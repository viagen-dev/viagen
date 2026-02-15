import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import type { IncomingMessage } from "node:http";
import type { ViteDevServer } from "vite";
import type { LogBuffer } from "./logger";

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

    if (!opts.env["ANTHROPIC_API_KEY"]) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      );
      return;
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

    let systemPrompt = `You are embedded in a Vite dev server as the "viagen" plugin. Your job is to help build and modify the app running at ${opts.projectRoot}. Files you edit will trigger Vite HMR automatically. You can read .viagen/server.log to check recent Vite dev server output (compile errors, HMR updates, warnings). Be concise.`;

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

    const child: ChildProcess = spawn("node", args, {
      cwd: opts.projectRoot,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: opts.env["ANTHROPIC_API_KEY"],
        CLAUDECODE: "",
      },
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
