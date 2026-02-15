import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { LogBuffer, wrapLogger } from "./logger";
import { registerHealthRoutes, type ViteError } from "./health";
import { findClaudeBin, registerChatRoutes } from "./chat";
import { buildClientScript } from "./overlay";
import { buildUiHtml } from "./ui";
import { createAuthMiddleware } from "./auth";

let docsHtmlCache: string | undefined;
function getDocsHtml(): string {
  if (!docsHtmlCache) {
    const dir = dirname(fileURLToPath(import.meta.url));
    docsHtmlCache = readFileSync(join(dir, "..", "site", "index.html"), "utf-8");
  }
  return docsHtmlCache;
}

export interface ViagenOptions {
  /** Toggle button placement. Default: 'bottom-right' */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Claude model to use. Default: 'sonnet' */
  model?: string;
  /** Chat panel width in px. Default: 420 */
  panelWidth?: number;
  /** Show "Fix This Error" button on Vite error overlay. Default: true */
  overlay?: boolean;
  /** Inject the toggle button + chat panel into pages. Default: true */
  ui?: boolean;
}

export {
  deploySandbox,
  type GitInfo,
} from "./sandbox";

export function viagen(options?: ViagenOptions): Plugin {
  const opts = {
    position: options?.position ?? "bottom-right",
    model: options?.model ?? "sonnet",
    panelWidth: options?.panelWidth ?? 420,
    overlay: options?.overlay ?? true,
    ui: options?.ui ?? true,
  };

  let env: Record<string, string>;
  let projectRoot: string;
  let claudeBin: string;
  let lastError: ViteError | null = null;
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
    },
    transformIndexHtml() {
      if (!opts.ui) return [];
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

      // Auth middleware — only when VIAGEN_AUTH_TOKEN is set
      const authToken = env["VIAGEN_AUTH_TOKEN"];
      if (authToken) {
        server.middlewares.use(createAuthMiddleware(authToken));
      }

      // Chat UI + docs pages
      server.middlewares.use("/via/ui", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(buildUiHtml());
      });

      server.middlewares.use("/via/docs", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(getDocsHtml());
      });

      // Health + error routes
      registerHealthRoutes(server, env, {
        get: () => lastError,
      });

      // Chat routes
      registerChatRoutes(server, {
        env,
        projectRoot,
        logBuffer,
        model: opts.model,
        claudeBin,
      });
    },
  };
}

export default viagen;
