import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import type { ViteDevServer } from "vite";
import type { LogBuffer } from "./logger";
import { refreshAccessToken } from "./oauth";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export const DEFAULT_SYSTEM_PROMPT = `
  You are embedded in a Vite dev server as the "viagen" plugin.
  Your job is to help build and modify the app. Files you edit will trigger Vite HMR automatically.
  You can read .viagen/server.log to check recent Vite dev server output (compile errors, HMR updates, warnings).
  Be concise.
`;

export function findClaudeBin(): string {
  const _require = createRequire(import.meta.url);
  const pkgPath = _require.resolve("@anthropic-ai/claude-code/package.json");
  return pkgPath.replace("package.json", "cli.js");
}

export interface ChatEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  text?: string;
  name?: string;
  input?: unknown;
}

interface ChatSessionOpts {
  env: Record<string, string>;
  projectRoot: string;
  logBuffer: LogBuffer;
  model: string;
  claudeBin: string;
  systemPrompt?: string;
}

/**
 * Shared chat session — spawns Claude Code CLI processes and manages
 * session continuity. Used by both the HTTP endpoint and auto-prompt.
 */
export class ChatSession {
  private sessionId: string | undefined;
  private chatLogPath: string;
  private opts: ChatSessionOpts;

  constructor(opts: ChatSessionOpts) {
    this.opts = opts;
    this.chatLogPath = join(opts.projectRoot, ".viagen", "chat.log");
  }

  reset() {
    this.sessionId = undefined;
  }

  getHistory(): Array<Record<string, unknown>> {
    try {
      const raw = readFileSync(this.chatLogPath, "utf-8");
      const entries: Array<Record<string, unknown>> = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  private chatLog(entry: Record<string, unknown>) {
    try {
      appendFileSync(
        this.chatLogPath,
        JSON.stringify({ ...entry, timestamp: Date.now() }) + "\n",
      );
    } catch {
      // best-effort
    }
  }

  async refreshTokenIfNeeded(): Promise<string | null> {
    const hasOAuthToken = !!this.opts.env["CLAUDE_ACCESS_TOKEN"];
    if (hasOAuthToken && this.opts.env["CLAUDE_TOKEN_EXPIRES"]) {
      const expires = parseInt(this.opts.env["CLAUDE_TOKEN_EXPIRES"], 10);
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > expires - 300) {
        const tokens = await refreshAccessToken(
          this.opts.env["CLAUDE_REFRESH_TOKEN"],
        );
        this.opts.env["CLAUDE_ACCESS_TOKEN"] = tokens.access_token;
        this.opts.env["CLAUDE_REFRESH_TOKEN"] = tokens.refresh_token;
        this.opts.env["CLAUDE_TOKEN_EXPIRES"] = String(
          nowSec + tokens.expires_in,
        );

        const envPath = join(this.opts.projectRoot, ".env");
        if (existsSync(envPath)) {
          let content = readFileSync(envPath, "utf-8");
          const replacements: Record<string, string> = {
            CLAUDE_ACCESS_TOKEN: tokens.access_token,
            CLAUDE_REFRESH_TOKEN: tokens.refresh_token,
            CLAUDE_TOKEN_EXPIRES: String(nowSec + tokens.expires_in),
          };
          for (const [key, val] of Object.entries(replacements)) {
            const re = new RegExp(`^${key}=.*$`, "m");
            if (re.test(content)) {
              content = content.replace(re, `${key}=${val}`);
            }
          }
          writeFileSync(envPath, content);
        }
      }
    }
    return null;
  }

  /**
   * Send a message to Claude. Calls `onEvent` for each streamed event.
   * Returns a promise that resolves when Claude is done, and a kill
   * function to abort the process.
   */
  sendMessage(
    message: string,
    onEvent: (event: ChatEvent) => void,
  ): { done: Promise<void>; kill: () => void } {
    this.chatLog({ role: "user", type: "message", text: message });

    let systemPrompt = this.opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const recentErrors = this.opts.logBuffer.recentErrors();
    if (recentErrors.length > 0) {
      systemPrompt += `\n\nRecent Vite dev server errors/warnings:\n${recentErrors.join("\n")}`;
    }

    const args = [
      this.opts.claudeBin,
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      "--append-system-prompt",
      systemPrompt,
      "--model",
      this.opts.model,
    ];

    if (this.sessionId) {
      args.push("--resume", this.sessionId);
    }

    args.push(message);

    const hasApiKey = !!this.opts.env["ANTHROPIC_API_KEY"];
    const hasOAuthToken = !!this.opts.env["CLAUDE_ACCESS_TOKEN"];
    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CLAUDECODE: "",
    };
    if (hasApiKey) {
      childEnv["ANTHROPIC_API_KEY"] = this.opts.env["ANTHROPIC_API_KEY"];
    } else if (hasOAuthToken) {
      childEnv["CLAUDE_CODE_OAUTH_TOKEN"] =
        this.opts.env["CLAUDE_ACCESS_TOKEN"];
    }

    const child: ChildProcess = spawn("node", args, {
      cwd: this.opts.projectRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const session = this;
    let buffer = "";

    const done = new Promise<void>((resolve) => {
      child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg = JSON.parse(line);

            if (msg.type === "system" && msg.session_id) {
              session.sessionId = msg.session_id;
            }

            if (msg.type === "assistant" && msg.message?.content) {
              for (const block of msg.message.content) {
                if (block.type === "text" && block.text) {
                  session.chatLog({
                    role: "assistant",
                    type: "text",
                    text: block.text,
                  });
                  onEvent({ type: "text", text: block.text });
                }
                if (block.type === "tool_use") {
                  session.chatLog({
                    role: "assistant",
                    type: "tool_use",
                    name: block.name,
                    input: block.input,
                  });
                  onEvent({
                    type: "tool_use",
                    name: block.name,
                    input: block.input,
                  });
                }
              }
            }

            if (msg.type === "tool_result" && msg.content) {
              for (const block of msg.content) {
                if (block.type === "text" && block.text) {
                  onEvent({ type: "tool_result", text: block.text });
                }
              }
            }

            if (msg.type === "result") {
              if (msg.result) {
                session.chatLog({
                  role: "assistant",
                  type: "result",
                  text: msg.result,
                });
                onEvent({ type: "text", text: msg.result });
              }
              onEvent({ type: "done" });
            }
          } catch {
            // skip unparseable lines
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          onEvent({ type: "error", text });
        }
      });

      child.on("close", () => {
        onEvent({ type: "done" });
        resolve();
      });

      child.on("error", (err) => {
        onEvent({ type: "error", text: err.message });
        onEvent({ type: "done" });
        resolve();
      });
    });

    return { done, kill: () => child.kill() };
  }
}

export function registerChatRoutes(
  server: ViteDevServer,
  session: ChatSession,
  opts: { env: Record<string, string> },
) {
  server.middlewares.use("/via/chat/history", (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const since = parseInt(url.searchParams.get("since") || "0", 10);

    let entries = session.getHistory();
    if (since > 0) {
      entries = entries.filter(
        (e) => typeof e.timestamp === "number" && e.timestamp > since,
      );
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ entries }));
  });

  server.middlewares.use("/via/chat/reset", (_req, res) => {
    session.reset();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
  });

  server.middlewares.use("/via/chat", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const hasApiKey = !!opts.env["ANTHROPIC_API_KEY"];
    const hasOAuthToken = !!opts.env["CLAUDE_ACCESS_TOKEN"];

    if (!hasApiKey && !hasOAuthToken) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: "No Claude auth configured. Run `npx viagen setup`.",
        }),
      );
      return;
    }

    // Refresh OAuth token if needed
    if (hasOAuthToken) {
      try {
        await session.refreshTokenIfNeeded();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[viagen] OAuth token refresh failed: ${msg}`);
        res.statusCode = 500;
        res.end(
          JSON.stringify({ error: `OAuth token refresh failed: ${msg}` }),
        );
        return;
      }
    }

    let message: string;
    try {
      const body = JSON.parse(await readBody(req));
      message = body.message;
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    if (!message) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Missing "message" field' }));
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let done = false;
    const { kill } = session.sendMessage(message, (event) => {
      if (done) return;
      if (event.type === "done") {
        done = true;
        if (!res.writableEnded) {
          res.write("event: done\ndata: {}\n\n");
          res.end();
        }
        return;
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    req.on("close", () => {
      kill();
    });

    // Ensure response ends
    await done;
  });
}
