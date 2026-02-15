import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, type Plugin, type Logger } from "vite";
import type { IncomingMessage } from "node:http";
import { VIAGEN_UI_HTML } from "./ui";

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

interface LogEntry {
  level: "info" | "warn" | "error";
  text: string;
  timestamp: number;
}

const MAX_LOG_LINES = 100;

class LogBuffer {
  private entries: LogEntry[] = [];
  private logPath: string | undefined;

  init(projectRoot: string) {
    const dir = join(projectRoot, ".viagen");
    mkdirSync(dir, { recursive: true });
    this.logPath = join(dir, "server.log");
    this.flush();
  }

  push(level: LogEntry["level"], text: string) {
    this.entries.push({ level, text, timestamp: Date.now() });
    if (this.entries.length > MAX_LOG_LINES) {
      this.entries.shift();
    }
    this.flush();
  }

  recentErrors(): string[] {
    return this.entries
      .filter((e) => e.level === "error" || e.level === "warn")
      .map((e) => `[${e.level.toUpperCase()}] ${e.text}`);
  }

  private flush() {
    if (!this.logPath) return;
    const content = this.entries
      .map((e) => {
        const ts = new Date(e.timestamp).toISOString();
        return `[${ts}] [${e.level.toUpperCase()}] ${e.text}`;
      })
      .join("\n");
    writeFileSync(this.logPath, content + "\n");
  }
}

function wrapLogger(logger: Logger, buffer: LogBuffer): void {
  const origInfo = logger.info.bind(logger);
  const origWarn = logger.warn.bind(logger);
  const origError = logger.error.bind(logger);

  logger.info = (msg, opts) => {
    buffer.push("info", msg);
    origInfo(msg, opts);
  };
  logger.warn = (msg, opts) => {
    buffer.push("warn", msg);
    origWarn(msg, opts);
  };
  logger.error = (msg, opts) => {
    buffer.push("error", msg);
    origError(msg, opts);
  };
}

interface ViteError {
  message: string;
  stack: string;
  frame?: string;
  plugin?: string;
  loc?: { file: string; line: number; column: number };
}

const VIAGEN_CLIENT_SCRIPT = /* js */ `
(function() {
  /* ---- Error overlay: inject Fix button into shadow DOM ---- */
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        if (added[j].nodeName === 'VITE-ERROR-OVERLAY') injectFixButton(added[j]);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function injectFixButton(overlay) {
    if (!overlay.shadowRoot) return;
    setTimeout(function() {
      var root = overlay.shadowRoot;
      if (root.getElementById('viagen-fix-btn')) return;
      var target = root.querySelector('.window') || root.firstElementChild;
      if (!target) return;

      var btn = document.createElement('button');
      btn.id = 'viagen-fix-btn';
      btn.textContent = 'Fix This Error';
      btn.style.cssText = 'display:block;width:100%;margin-top:12px;padding:12px 20px;background:#4f46e5;color:white;border:2px solid #6366f1;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;transition:background 0.15s;';
      btn.onmouseenter = function() { btn.style.background = '#4338ca'; };
      btn.onmouseleave = function() { btn.style.background = '#4f46e5'; };
      btn.addEventListener('click', function() { fixError(btn); });
      target.appendChild(btn);
    }, 50);
  }

  async function fixError(btn) {
    btn.textContent = 'Fixing...';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.style.cursor = 'wait';
    try {
      var errorRes = await fetch('/via/error');
      var errorData = await errorRes.json();
      if (!errorData.error) { btn.textContent = 'No error found'; return; }
      var e = errorData.error;
      var prompt = 'Fix this Vite build error in ' +
        (e.loc ? e.loc.file + ':' + e.loc.line : 'unknown file') +
        ':\\n\\n' + e.message +
        (e.frame ? '\\n\\nCode frame:\\n' + e.frame : '');
      var chatRes = await fetch('/via/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      var reader = chatRes.body.getReader();
      while (true) { var r = await reader.read(); if (r.done) break; }
    } catch(err) {
      console.error('[viagen] Fix error failed:', err);
    }
    btn.textContent = 'Try Again';
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }

  /* ---- Floating toggle + iframe panel ---- */
  var PANEL_KEY = 'viagen_panel_open';
  var panel = document.createElement('div');
  panel.id = 'viagen-panel';
  panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:420px;z-index:99997;display:none;border-left:1px solid #27272a;box-shadow:-4px 0 24px rgba(0,0,0,0.5);';
  var iframe = document.createElement('iframe');
  iframe.src = '/via/ui';
  iframe.style.cssText = 'width:100%;height:100%;border:none;background:#09090b;';
  panel.appendChild(iframe);
  document.body.appendChild(panel);

  var toggle = document.createElement('button');
  toggle.id = 'viagen-toggle';
  toggle.textContent = 'via';
  toggle.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99998;padding:8px 14px;background:#18181b;color:#a1a1aa;border:1px solid #3f3f46;border-radius:20px;font-size:12px;font-weight:600;font-family:ui-monospace,monospace;cursor:pointer;letter-spacing:0.05em;transition:border-color 0.15s,color 0.15s,background 0.15s;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  toggle.onmouseenter = function() { toggle.style.borderColor = '#6366f1'; toggle.style.color = '#e4e4e7'; };
  toggle.onmouseleave = function() { if (panel.style.display === 'none') { toggle.style.borderColor = '#3f3f46'; toggle.style.color = '#a1a1aa'; } };

  function setPanelOpen(open) {
    panel.style.display = open ? 'block' : 'none';
    toggle.textContent = open ? 'x' : 'via';
    toggle.style.right = open ? '436px' : '16px';
    toggle.style.borderColor = open ? '#6366f1' : '#3f3f46';
    toggle.style.color = open ? '#e4e4e7' : '#a1a1aa';
    toggle.style.background = open ? '#4f46e5' : '#18181b';
    try { sessionStorage.setItem(PANEL_KEY, open ? '1' : ''); } catch(e) {}
  }

  toggle.addEventListener('click', function() {
    setPanelOpen(panel.style.display === 'none');
  });
  document.body.appendChild(toggle);

  // Restore panel state
  try { if (sessionStorage.getItem(PANEL_KEY)) setPanelOpen(true); } catch(e) {}
})();
`;

function findClaudeBin(): string {
  // Vite always runs plugins as ESM, so import.meta.url is available
  const _require = createRequire(import.meta.url);
  const pkgPath = _require.resolve("@anthropic-ai/claude-code/package.json");
  return pkgPath.replace("package.json", "cli.js");
}

export function viagen(): Plugin {
  let env: Record<string, string>;
  let projectRoot: string;
  let sessionId: string | undefined;
  let claudeBin: string;
  let lastError: ViteError | null = null;
  const logBuffer = new LogBuffer();

  return {
    name: "viagen",
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir ?? config.root, "");
      projectRoot = config.root;
      claudeBin = findClaudeBin();
      logBuffer.init(projectRoot);
      wrapLogger(config.logger, logBuffer);
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: VIAGEN_CLIENT_SCRIPT,
          injectTo: "body" as const,
        },
      ];
    },
    configureServer(server) {
      // Intercept HMR error payloads to capture structured build errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hmrSender: any = (server as any).hot ?? server.ws;
      if (hmrSender?.send) {
        const origSend = hmrSender.send.bind(hmrSender);
        hmrSender.send = (...args: unknown[]) => {
          const payload = args[0] as
            | { type: string; err?: ViteError }
            | undefined;
          if (payload?.type === "error" && payload.err) {
            lastError = payload.err;
            logBuffer.push(
              "error",
              `[vite:build] ${payload.err.message}\n${payload.err.frame || ""}`,
            );
          } else if (payload?.type === "update") {
            lastError = null;
          }
          return origSend(...args);
        };
      }

      server.middlewares.use("/via/ui", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(VIAGEN_UI_HTML);
      });

      server.middlewares.use("/via/error", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: lastError }));
      });

      server.middlewares.use("/via/health", (_req, res) => {
        const required = ["ANTHROPIC_API_KEY"];
        const missing = required.filter((key) => !env[key]);

        res.setHeader("Content-Type", "application/json");

        if (missing.length === 0) {
          res.end(JSON.stringify({ status: "ok", configured: true }));
        } else {
          res.end(
            JSON.stringify({ status: "error", configured: false, missing }),
          );
        }
      });

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

        if (!env["ANTHROPIC_API_KEY"]) {
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

        let systemPrompt = `You are embedded in a Vite dev server as the "viagen" plugin. Your job is to help build and modify the app running at ${projectRoot}. Files you edit will trigger Vite HMR automatically. You can read .viagen/server.log to check recent Vite dev server output (compile errors, HMR updates, warnings). Be concise.`;

        const recentErrors = logBuffer.recentErrors();
        if (recentErrors.length > 0) {
          systemPrompt += `\n\nRecent Vite dev server errors/warnings:\n${recentErrors.join("\n")}`;
        }

        const args = [
          claudeBin,
          "--print",
          "--verbose",
          "--output-format",
          "stream-json",
          "--dangerously-skip-permissions",
          "--append-system-prompt",
          systemPrompt,
          "--model",
          "sonnet",
        ];

        if (sessionId) {
          args.push("--resume", sessionId);
        }

        args.push(message);

        const child: ChildProcess = spawn("node", args, {
          cwd: projectRoot,
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: env["ANTHROPIC_API_KEY"],
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
    },
  };
}

export default viagen;
