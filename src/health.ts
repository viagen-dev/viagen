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
    const vercel =
      !!env["VERCEL_TOKEN"] &&
      !!env["VERCEL_ORG_ID"] &&
      !!env["VERCEL_PROJECT_ID"];
    const branch = env["VIAGEN_BRANCH"] || null;

    // Build checklist of missing env vars
    const missing: string[] = [];
    if (!env["ANTHROPIC_API_KEY"] && !env["CLAUDE_ACCESS_TOKEN"])
      missing.push("ANTHROPIC_API_KEY");
    if (!env["GITHUB_TOKEN"]) missing.push("GITHUB_TOKEN");
    if (!env["VERCEL_TOKEN"]) missing.push("VERCEL_TOKEN");
    if (!env["VERCEL_ORG_ID"]) missing.push("VERCEL_ORG_ID");
    if (!env["VERCEL_PROJECT_ID"]) missing.push("VERCEL_PROJECT_ID");

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

    const prompt = env["VIAGEN_PROMPT"] || null;

    res.setHeader("Content-Type", "application/json");

    if (configured) {
      res.end(JSON.stringify({ status: "ok", configured: true, git, vercel, branch, session, prompt, missing }));
    } else {
      res.end(
        JSON.stringify({ status: "error", configured: false, git, vercel, branch, session, prompt, missing }),
      );
    }
  });
}
