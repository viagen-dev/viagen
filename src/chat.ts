import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

export const DEFAULT_SYSTEM_PROMPT = `You are embedded in a Vite dev server as the "viagen" plugin. Your job is to help build and modify the app. Files you edit will trigger Vite HMR automatically. You can read .viagen/server.log to check recent Vite dev server output (compile errors, HMR updates, warnings). When running in a sandbox with git, the gh CLI is available and authenticated — you can create pull requests, comment on issues, and manage releases.

Publishing workflow:
- If you are on a feature branch (not main/master): commit your changes, push to the remote, and create a pull request using "gh pr create". Share the PR URL.
- If you are on main/master and Vercel credentials are set ($VERCEL_TOKEN): commit, push, and run "vercel deploy" to publish a preview. Share the preview URL.
- Check your current branch with "git branch --show-current" before deciding which workflow to use.

Be concise.`;

export function findClaudeBin(): string {
  const _require = createRequire(import.meta.url);
  const pkgPath = _require.resolve("@anthropic-ai/claude-code/package.json");
  return pkgPath.replace("package.json", "cli.js");
}

export function registerChatRoutes(
  server: ViteDevServer,
  opts: {
    env: Record<string, string>;
    projectRoot: string;
    logBuffer: LogBuffer;
    model: string;
    claudeBin: string;
    systemPrompt?: string;
  },
) {
  let sessionId: string | undefined;

  server.middlewares.use("/via/chat/reset", (_req, res) => {
    sessionId = undefined;
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
        JSON.stringify({ error: "No Claude auth configured. Run `npx viagen setup`." }),
      );
      return;
    }

    // Refresh OAuth token if expired (or expiring within 5 min)
    if (hasOAuthToken && opts.env["CLAUDE_TOKEN_EXPIRES"]) {
      const expires = parseInt(opts.env["CLAUDE_TOKEN_EXPIRES"], 10);
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > expires - 300) {
        try {
          const tokens = await refreshAccessToken(opts.env["CLAUDE_REFRESH_TOKEN"]);
          opts.env["CLAUDE_ACCESS_TOKEN"] = tokens.access_token;
          opts.env["CLAUDE_REFRESH_TOKEN"] = tokens.refresh_token;
          opts.env["CLAUDE_TOKEN_EXPIRES"] = String(nowSec + tokens.expires_in);

          // Persist refreshed tokens to .env so they survive restarts
          const envPath = join(opts.projectRoot, ".env");
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
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[viagen] OAuth token refresh failed: ${msg}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: `OAuth token refresh failed: ${msg}` }));
          return;
        }
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

    let systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

    const recentErrors = opts.logBuffer.recentErrors();
    if (recentErrors.length > 0) {
      systemPrompt += `\n\nRecent Vite dev server errors/warnings:\n${recentErrors.join("\n")}`;
    }

    const args = [
      opts.claudeBin,
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      "--append-system-prompt",
      systemPrompt,
      "--model",
      opts.model,
    ];

    if (sessionId) {
      args.push("--resume", sessionId);
    }

    args.push(message);

    const childEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      CLAUDECODE: "",
    };
    if (hasApiKey) {
      childEnv["ANTHROPIC_API_KEY"] = opts.env["ANTHROPIC_API_KEY"];
    } else if (hasOAuthToken) {
      childEnv["CLAUDE_CODE_OAUTH_TOKEN"] = opts.env["CLAUDE_ACCESS_TOKEN"];
    }

    const child: ChildProcess = spawn("node", args, {
      cwd: opts.projectRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const msg = JSON.parse(line);

          if (msg.type === "system" && msg.session_id) {
            sessionId = msg.session_id;
          }

          if (msg.type === "assistant" && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text) {
                res.write(
                  `data: ${JSON.stringify({ type: "text", text: block.text })}\n\n`,
                );
              }
              if (block.type === "tool_use") {
                res.write(
                  `data: ${JSON.stringify({ type: "tool_use", name: block.name, input: block.input })}\n\n`,
                );
              }
            }
          }

          if (msg.type === "tool_result" && msg.content) {
            for (const block of msg.content) {
              if (block.type === "text" && block.text) {
                res.write(
                  `data: ${JSON.stringify({ type: "tool_result", text: block.text })}\n\n`,
                );
              }
            }
          }

          if (msg.type === "result") {
            if (msg.result) {
              res.write(
                `data: ${JSON.stringify({ type: "text", text: msg.result })}\n\n`,
              );
            }
            res.write("event: done\ndata: {}\n\n");
          }
        } catch {
          // skip unparseable lines
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        res.write(`data: ${JSON.stringify({ type: "error", text })}\n\n`);
      }
    });

    child.on("close", () => {
      if (!res.writableEnded) {
        res.write("event: done\ndata: {}\n\n");
        res.end();
      }
    });

    child.on("error", (err) => {
      res.write(
        `data: ${JSON.stringify({ type: "error", text: err.message })}\n\n`,
      );
      res.write("event: done\ndata: {}\n\n");
      res.end();
    });

    req.on("close", () => {
      child.kill();
    });
  });
}
