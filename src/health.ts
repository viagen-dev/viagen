import type { ViteDevServer } from "vite";

export interface ViteError {
  message: string;
  stack: string;
  frame?: string;
  plugin?: string;
  loc?: { file: string; line: number; column: number };
}

export function registerHealthRoutes(
  server: ViteDevServer,
  env: Record<string, string>,
  errorRef: { get(): ViteError | null },
) {
  server.middlewares.use("/via/error", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: errorRef.get() }));
  });

  server.middlewares.use("/via/health", (_req, res) => {
    const configured =
      !!env["ANTHROPIC_API_KEY"] || !!env["CLAUDE_ACCESS_TOKEN"];
    const git = !!env["GITHUB_TOKEN"];
    const branch = env["VIAGEN_BRANCH"] || null;

    // Session timing (sandbox only)
    const sessionStart = env["VIAGEN_SESSION_START"]
      ? parseInt(env["VIAGEN_SESSION_START"], 10)
      : null;
    const sessionTimeout = env["VIAGEN_SESSION_TIMEOUT"]
      ? parseInt(env["VIAGEN_SESSION_TIMEOUT"], 10)
      : null;
    const session =
      sessionStart && sessionTimeout
        ? {
            startedAt: sessionStart,
            expiresAt: sessionStart + sessionTimeout,
            timeoutSeconds: sessionTimeout,
          }
        : null;

    res.setHeader("Content-Type", "application/json");

    if (configured) {
      res.end(JSON.stringify({ status: "ok", configured: true, git, branch, session }));
    } else {
      res.end(
        JSON.stringify({ status: "error", configured: false, git, branch, session }),
      );
    }
  });
}
