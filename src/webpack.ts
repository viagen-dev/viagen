import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LogBuffer } from "./logger";
import { registerHealthRoutes, type ViteError } from "./health";
import { findClaudeBin, registerChatRoutes } from "./chat";
import { buildClientScript } from "./overlay";
import { buildUiHtml } from "./ui";
import { buildIframeHtml } from "./iframe";
import { createAuthMiddleware } from "./auth";

export { DEFAULT_SYSTEM_PROMPT } from "./chat";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _dirname = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));

let docsHtmlCache: string | undefined;
function getDocsHtml(): string {
  if (!docsHtmlCache) {
    docsHtmlCache = readFileSync(join(_dirname, "..", "site", "index.html"), "utf-8");
  }
  return docsHtmlCache;
}

export interface WebpackViagenOptions {
  /** Claude model to use. Default: 'sonnet' */
  model?: string;
  /** Chat panel width in px. Default: 420 */
  panelWidth?: number;
  /** Toggle button placement. Default: 'bottom-right' */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Inject the toggle button + chat panel into pages. Default: true */
  ui?: boolean;
  /** Custom system prompt appended to Claude. Overrides the default. */
  systemPrompt?: string;
}

const DEFAULT_WEBPACK_SYSTEM_PROMPT = `You are embedded in a webpack dev server as the "viagen" plugin. Your job is to help build and modify the app. Files you edit will trigger webpack HMR automatically. You can read .viagen/server.log to check recent dev server output (compile errors, HMR updates, warnings). When running in a sandbox with git, the gh CLI is available and authenticated — you can create pull requests, comment on issues, and manage releases. If Vercel credentials are set, you can run "vercel deploy" to publish a preview and share the URL. Be concise.`;

/**
 * Webpack-dev-server integration for viagen.
 *
 * Usage in webpack.config.js:
 * ```js
 * const { setupViagen } = require('viagen/webpack');
 *
 * module.exports = {
 *   devServer: {
 *     setupMiddlewares: (middlewares, devServer) => {
 *       setupViagen(devServer, { model: 'sonnet' });
 *       return middlewares;
 *     }
 *   }
 * };
 * ```
 */
export function setupViagen(
  devServer: {
    app: {
      use: (
        pathOrHandler:
          | string
          | ((
              req: IncomingMessage,
              res: ServerResponse,
              next: () => void,
            ) => void),
        handler?: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => void,
      ) => void;
    };
    compiler: {
      hooks: {
        done: {
          tap: (
            name: string,
            fn: (stats: {
              hasErrors(): boolean;
              compilation: {
                errors: Array<{
                  message: string;
                  stack?: string;
                  loc?: { line: number; column: number };
                  module?: { resource?: string };
                }>;
              };
            }) => void,
          ) => void;
        };
      };
    };
  },
  options?: WebpackViagenOptions,
): void {
  const opts = {
    model: options?.model ?? "sonnet",
    panelWidth: options?.panelWidth ?? 420,
    position: options?.position ?? "bottom-right",
    ui: options?.ui ?? true,
  };

  const projectRoot = process.cwd();

  // Load .env file (Vite does this via loadEnv, webpack has no equivalent)
  const env: Record<string, string> = {};
  const dotenvPath = join(projectRoot, ".env");
  if (existsSync(dotenvPath)) {
    const content = readFileSync(dotenvPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  // process.env overrides .env file values
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  const claudeBin = findClaudeBin();
  const logBuffer = new LogBuffer();
  logBuffer.init(projectRoot);

  let lastError: ViteError | null = null;

  // Capture webpack build errors
  devServer.compiler.hooks.done.tap("viagen", (stats) => {
    if (stats.hasErrors()) {
      const err = stats.compilation.errors[0];
      lastError = {
        message: err.message,
        stack: err.stack || "",
        loc: err.module?.resource && err.loc
          ? {
              file: err.module.resource,
              line: err.loc.line,
              column: err.loc.column,
            }
          : undefined,
      };
      logBuffer.push("error", `[webpack:build] ${err.message}`);
    } else {
      lastError = null;
    }
  });

  const app = devServer.app;

  // Auth middleware
  const authToken = env["VIAGEN_AUTH_TOKEN"];
  if (authToken) {
    app.use(createAuthMiddleware(authToken));
  }

  // HTML injection middleware — intercept HTML responses to inject client script
  if (opts.ui) {
    app.use(
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ) => {
        const origEnd = res.end.bind(res);
        const origWrite = res.write.bind(res);
        let body = "";
        let isHtml = false;

        const origWriteHead = res.writeHead.bind(res);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.writeHead = function (...args: any[]) {
          const headers = res.getHeaders();
          const ct = headers["content-type"];
          if (typeof ct === "string" && ct.includes("text/html")) {
            isHtml = true;
            // Remove content-length since we'll modify the body
            res.removeHeader("content-length");
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (origWriteHead as any)(...args);
        } as typeof res.writeHead;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.write = function (chunk: any, ...args: any[]) {
          if (isHtml) {
            body += typeof chunk === "string" ? chunk : chunk.toString();
            return true;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (origWrite as any)(chunk, ...args);
        } as typeof res.write;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.end = function (chunk?: any, ...args: any[]) {
          if (isHtml) {
            if (chunk) {
              body +=
                typeof chunk === "string" ? chunk : chunk.toString();
            }

            const url = new URL(
              req.url || "/",
              "http://localhost",
            );
            const isEmbed =
              url.searchParams.has("_viagen_embed");

            const script = buildClientScript({
              position: opts.position,
              panelWidth: opts.panelWidth,
              overlay: false,
              embedMode: isEmbed,
              buildTool: "webpack",
            });

            if (!isEmbed) {
              body = body.replace(
                "</body>",
                `<script>${script}</script></body>`,
              );
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (origEnd as any)(body, ...args);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (origEnd as any)(chunk, ...args);
        } as typeof res.end;

        next();
      },
    );
  }

  // Static page routes
  app.use("/via/ui" as string, (_req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "text/html");
    res.end(buildUiHtml());
  });

  app.use(
    "/via/iframe" as string,
    (_req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Content-Type", "text/html");
      res.end(buildIframeHtml({ panelWidth: opts.panelWidth }));
    },
  );

  app.use(
    "/via/docs" as string,
    (_req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Content-Type", "text/html");
      res.end(getDocsHtml());
    },
  );

  // Health + error routes
  // We need a Connect-compatible app wrapper for the shared register functions
  const connectLike = {
    use: (
      path: string,
      handler: (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ) => void,
    ) => {
      app.use(path as string, handler);
    },
  };

  registerHealthRoutes(
    connectLike as Parameters<typeof registerHealthRoutes>[0],
    env,
    { get: () => lastError },
  );

  registerChatRoutes(
    connectLike as Parameters<typeof registerChatRoutes>[0],
    {
      env,
      projectRoot,
      logBuffer,
      model: opts.model,
      claudeBin,
      systemPrompt: options?.systemPrompt ?? DEFAULT_WEBPACK_SYSTEM_PROMPT,
    },
  );
}
