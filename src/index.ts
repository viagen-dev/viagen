import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, type Plugin } from "vite";
import { LogBuffer, wrapLogger } from "./logger";
import { registerHealthRoutes, type ViteError } from "./health";
import { findClaudeBin, registerChatRoutes, ChatSession } from "./chat";
import { buildClientScript } from "./overlay";
import { buildUiHtml } from "./ui";
import { buildIframeHtml } from "./iframe";
import { createAuthMiddleware } from "./auth";
import { registerFileRoutes } from "./files";
import { createInjectionMiddleware } from "./inject";
import { registerGitRoutes } from "./git";
import { registerLogRoutes } from "./logs";

export interface ViagenOptions {
  /** Toggle button placement. Default: 'bottom-right' */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Claude model to use. Default: 'sonnet' */
  model?: string;
  /** Chat panel width in px. Default: 375 */
  panelWidth?: number;
  /** Show "Fix This Error" button on Vite error overlay. Default: true */
  overlay?: boolean;
  /** Inject the toggle button + chat panel into pages. Default: true */
  ui?: boolean;
  /** Custom system prompt appended to Claude. Overrides the default. */
  systemPrompt?: string;
  /**
   * Files to always include in sandbox deployments (e.g. credentials, configs).
   * Paths are relative to the project root. Read from package.json `viagen.sandboxFiles`.
   * @example ["config.json"]
   */
  sandboxFiles?: string[];
  /**
   * Files and directories editable through the UI file panel.
   * Paths are relative to the project root. Directories include all files within.
   * @example ['src/components', '.env', 'vite.config.ts']
   */
  editable?: string[];
}

export { DEFAULT_SYSTEM_PROMPT } from "./chat";

export { deploySandbox, type GitInfo } from "./sandbox";

export function viagen(options?: ViagenOptions): Plugin {
  const opts = {
    position: options?.position ?? "bottom-right",
    model: options?.model ?? "sonnet",
    panelWidth: options?.panelWidth ?? 375,
    overlay: options?.overlay ?? true,
    ui: options?.ui ?? true,
  };

  let env: Record<string, string>;
  let projectRoot: string;
  let claudeBin: string;
  let lastError: ViteError | null = null;
  let promptSent = false;
  let branchCheckedOut = false;
  const logBuffer = new LogBuffer();

  return {
    name: "viagen",
    config(_, { mode }) {
      const e = loadEnv(mode, process.cwd(), "");
      if (e["VIAGEN_AUTH_TOKEN"]) {
        return { server: { allowedHosts: true as const } };
      }
    },
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir ?? config.root, "");
      projectRoot = config.root;
      claudeBin = findClaudeBin();
      logBuffer.init(projectRoot);
      wrapLogger(config.logger, logBuffer);

      // Write plugin config so the CLI can read it
      const viagenDir = join(projectRoot, ".viagen");
      mkdirSync(viagenDir, { recursive: true });
      writeFileSync(
        join(viagenDir, "config.json"),
        JSON.stringify({
          sandboxFiles: options?.sandboxFiles ?? [],
          editable: options?.editable ?? [],
        }),
      );
    },
    transformIndexHtml(_html, ctx) {
      if (!opts.ui) return [];

      // In embed mode, only inject if overlay is enabled (for the Fix button)
      const url = new URL(ctx.originalUrl || ctx.path, "http://localhost");
      const isEmbed = url.searchParams.has("_viagen_embed");
      if (isEmbed && !opts.overlay) return [];

      return [
        {
          tag: "script",
          children: buildClientScript({
            position: opts.position,
            panelWidth: opts.panelWidth,
            overlay: opts.overlay,
          }),
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

      // Checkout GIT_BRANCH if set (sandbox mode, once only)
      const gitBranch = env["GIT_BRANCH"];
      if (gitBranch && !branchCheckedOut) {
        branchCheckedOut = true;
        try {
          execSync(`git checkout ${gitBranch}`, {
            cwd: projectRoot,
            stdio: "pipe",
          });
          logBuffer.push("info", `[viagen] Checked out branch: ${gitBranch}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logBuffer.push("warn", `[viagen] Could not checkout ${gitBranch} (dirty working tree?): ${msg}`);
        }
      }

      // Auth middleware — only when VIAGEN_AUTH_TOKEN is set
      const authToken = env["VIAGEN_AUTH_TOKEN"];
      if (authToken) {
        server.middlewares.use(createAuthMiddleware(authToken));
      }

      const hasEditor = !!(options?.editable && options.editable.length > 0);

      // Client script — served as a JS file for SSR injection
      const clientJs = buildClientScript({
        position: opts.position,
        panelWidth: opts.panelWidth,
        overlay: opts.overlay,
      });
      server.middlewares.use("/via/client.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(clientJs);
      });

      // Chat UI
      server.middlewares.use("/via/ui", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(buildUiHtml({ editable: hasEditor, git: true }));
      });

      server.middlewares.use("/via/iframe", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(buildIframeHtml({ panelWidth: opts.panelWidth }));
      });

      // Health + error routes
      registerHealthRoutes(server, env, {
        get: () => lastError,
      });

      // Chat session singleton — shared between routes and auto-prompt
      const chatSession = new ChatSession({
        env,
        projectRoot,
        logBuffer,
        model: opts.model,
        claudeBin,
        systemPrompt: options?.systemPrompt,
      });

      // Chat routes
      registerChatRoutes(server, chatSession, { env });

      // File editor routes
      if (hasEditor) {
        registerFileRoutes(server, {
          editable: options!.editable!,
          projectRoot,
        });
      }

      // Git routes (status + diff)
      registerGitRoutes(server, { projectRoot });

      // Log routes (dev server logs)
      registerLogRoutes(server, { logBuffer });

      // Auto-send initial prompt if VIAGEN_PROMPT is set (headless mode, once only)
      const initialPrompt = env["VIAGEN_PROMPT"];
      if (initialPrompt && !promptSent) {
        promptSent = true;
        logBuffer.push("info", `[viagen] Auto-sending prompt: "${initialPrompt}"`);
        chatSession.sendMessage(initialPrompt, (event) => {
          if (event.type === "done") {
            logBuffer.push("info", `[viagen] Prompt completed`);
          }
        });
      }

      // Post-middleware: inject client script into SSR-rendered HTML
      // Runs after Vite's internal transformIndexHtml middleware
      if (opts.ui) {
        return () => {
          server.middlewares.use(createInjectionMiddleware());
        };
      }
    },
  };
}

export default viagen;
