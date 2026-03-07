import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, type Plugin } from "vite";
import { LogBuffer, wrapLogger } from "./logger";
import { registerHealthRoutes, type ViteError } from "./health";
import { registerChatRoutes, ChatSession } from "./chat";
import { buildClientScript } from "./overlay";
import { buildUiHtml } from "./ui";
import { buildIframeHtml } from "./iframe";
import { createAuthMiddleware } from "./auth";
import { registerFileRoutes } from "./files";
import { createInjectionMiddleware } from "./inject";
import { registerGitRoutes } from "./git";
import { registerLogRoutes } from "./logs";
import { setDebug, debug } from "./debug";
import {
  createViagenTools,
  PLAN_SYSTEM_PROMPT,
  PLAN_MODE_DISALLOWED_TOOLS,
  planModeCanUseTool,
  TASK_TOOLS_PROMPT,
} from "./viagen-tools";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

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
  /** Enable verbose debug logging. Also enabled by VIAGEN_DEBUG=1 in .env. */
  debug?: boolean;
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
  let lastError: ViteError | null = null;
  let promptSent = false;
  let branchCheckedOut = false;
  const logBuffer = new LogBuffer();

  return {
    name: "viagen",
    config(_, { mode }) {
      const e = loadEnv(mode, process.cwd(), "");
      if (e["VIAGEN_AUTH_TOKEN"]) {
        return { server: { host: true, allowedHosts: true as const } };
      }
    },
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir ?? config.root, "");
      projectRoot = config.root;

      // Enable debug logging from option or env var
      const debugEnabled = options?.debug ?? env["VIAGEN_DEBUG"] === "1";
      setDebug(debugEnabled);

      debug("init", "plugin initializing");
      debug("init", `projectRoot: ${projectRoot}`);
      debug("init", `mode: ${config.mode}`);
      debug("init", `ANTHROPIC_API_KEY: ${env["ANTHROPIC_API_KEY"] ? "set (" + env["ANTHROPIC_API_KEY"].slice(0, 8) + "...)" : "NOT SET"}`);
      debug("init", `CLAUDE_ACCESS_TOKEN: ${env["CLAUDE_ACCESS_TOKEN"] ? "set" : "NOT SET"}`);
      debug("init", `GITHUB_TOKEN: ${env["GITHUB_TOKEN"] ? "set" : "NOT SET"}`);
      debug("init", `VIAGEN_AUTH_TOKEN: ${env["VIAGEN_AUTH_TOKEN"] ? "set" : "NOT SET"}`);
      debug("init", `VIAGEN_MODEL: ${env["VIAGEN_MODEL"] || "(not set)"}`);
      debug("init", `VIAGEN_PROMPT: ${env["VIAGEN_PROMPT"] ? `"${env["VIAGEN_PROMPT"].slice(0, 80)}..."` : "(not set)"}`);
      debug("init", `VIAGEN_TASK_ID: ${env["VIAGEN_TASK_ID"] || "(not set)"}`);
      debug("init", `model: ${env["VIAGEN_MODEL"] || opts.model}`);
      debug("init", `ui: ${opts.ui}, overlay: ${opts.overlay}, position: ${opts.position}`);

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
      debug("server", "configureServer starting");

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
        debug("server", "auth middleware enabled (VIAGEN_AUTH_TOKEN set)");
        server.middlewares.use(createAuthMiddleware(authToken));
      } else {
        debug("server", "auth middleware DISABLED (no VIAGEN_AUTH_TOKEN)");
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

      // App with chat overlay auto-opened
      server.middlewares.use("/via/pop", (_req, res) => {
        res.writeHead(302, { Location: "/?_viagen_chat" });
        res.end();
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
      const resolvedModel = env["VIAGEN_MODEL"] || opts.model;
      debug("server", `creating ChatSession (model: ${resolvedModel})`);

      // MCP tools — created when running inside a viagen sandbox with task context
      let mcpServers: Record<string, McpServerConfig> | undefined;
      const hasSandboxContext = !!(env["VIAGEN_CALLBACK_URL"] && env["VIAGEN_AUTH_TOKEN"] && env["VIAGEN_TASK_ID"]);
      if (hasSandboxContext) {
        debug("server", "creating viagen MCP tools (sandbox mode)");
        const viagenMcp = createViagenTools(
          env["VIAGEN_PROJECT_ID"]
            ? {
                authToken: env["VIAGEN_AUTH_TOKEN"],
                platformUrl: env["VIAGEN_PLATFORM_URL"] || "https://app.viagen.dev",
                projectId: env["VIAGEN_PROJECT_ID"],
              }
            : undefined,
        );
        mcpServers = { [viagenMcp.name]: viagenMcp };
      }

      // Plan mode restrictions
      const isPlanMode = env["VIAGEN_TASK_TYPE"] === "plan";
      let systemPrompt = options?.systemPrompt;

      if (isPlanMode) {
        debug("server", "plan mode active — restricting tools");
        systemPrompt = PLAN_SYSTEM_PROMPT;
      } else if (hasSandboxContext && env["VIAGEN_PROJECT_ID"]) {
        systemPrompt = (systemPrompt || "") + TASK_TOOLS_PROMPT;
      }

      const chatSession = new ChatSession({
        env,
        projectRoot,
        logBuffer,
        model: resolvedModel,
        systemPrompt,
        mcpServers,
        ...(isPlanMode
          ? {
              disallowedTools: PLAN_MODE_DISALLOWED_TOOLS,
              canUseTool: planModeCanUseTool,
            }
          : {}),
      });

      // Chat routes
      debug("server", "registering chat routes");
      registerChatRoutes(server, chatSession, { env });

      // File editor routes
      if (hasEditor) {
        registerFileRoutes(server, {
          editable: options!.editable!,
          projectRoot,
        });
      }

      // Git routes (status + diff)
      registerGitRoutes(server, { projectRoot, env });

      // Log routes (dev server logs)
      registerLogRoutes(server, { logBuffer });

      // Auto-send initial prompt if VIAGEN_PROMPT is set (headless mode, once only)
      const initialPrompt = env["VIAGEN_PROMPT"];
      if (initialPrompt && !promptSent) {
        promptSent = true;
        debug("server", `auto-sending VIAGEN_PROMPT: "${initialPrompt.slice(0, 100)}"`);
        logBuffer.push("info", `[viagen] Auto-sending prompt: "${initialPrompt}"`);
        chatSession.sendMessage(initialPrompt, (event) => {
          if (event.type === "done") {
            debug("server", "auto-prompt completed");
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
