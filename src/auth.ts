import type { IncomingMessage, ServerResponse } from "node:http";

type NextFn = (err?: unknown) => void;

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = val;
  }
  return cookies;
}

export function createAuthMiddleware(token: string) {
  return function authMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: NextFn,
  ) {
    // 1. Strip /t/:token or ?token= from URL first — always redirect to clean
    //    path so downstream middleware never sees the token segment (which
    //    would 404 in Vite's static file serving).
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    const pathMatch = url.pathname.match(/^(.*)\/t\/([^/]+)$/);
    if (pathMatch && pathMatch[2] === token) {
      const cleanPath = pathMatch[1] || "/";
      const cleanUrl = cleanPath + (url.search || "");
      res.setHeader(
        "Set-Cookie",
        `viagen_session=${token}; HttpOnly; SameSite=Lax; Path=/; Secure`,
      );
      res.writeHead(302, { Location: cleanUrl });
      res.end();
      return;
    }

    const queryToken = url.searchParams.get("token");
    if (queryToken === token) {
      url.searchParams.delete("token");
      const cleanUrl = url.pathname + (url.search || "");
      res.setHeader(
        "Set-Cookie",
        `viagen_session=${token}; HttpOnly; SameSite=Lax; Path=/; Secure`,
      );
      res.writeHead(302, { Location: cleanUrl });
      res.end();
      return;
    }

    // 2. Check session cookie
    if (req.headers.cookie) {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies["viagen_session"] === token) {
        next();
        return;
      }
    }

    // 3. Check Authorization header
    const auth = req.headers.authorization;
    if (auth && auth === `Bearer ${token}`) {
      next();
      return;
    }

    // 5. Unauthorized
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized" }));
  };
}
