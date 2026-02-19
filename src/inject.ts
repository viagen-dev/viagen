import type { IncomingMessage, ServerResponse } from "node:http";

type NextFn = (err?: unknown) => void;

const SCRIPT_TAG = '<script src="/via/client.js" defer></script>';
const MARKER = "viagen-toggle";

/**
 * Connect middleware that intercepts HTML responses and injects the viagen
 * client script. Used as a post-middleware (runs after Vite's internal
 * transformIndexHtml) to support SSR frameworks like React Router that
 * bypass Vite's HTML pipeline.
 */
export function createInjectionMiddleware() {
  return function injectMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: NextFn,
  ) {
    // Only intercept GET/HEAD page requests
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }

    // Skip our own routes
    const url = req.url ?? "/";
    if (url.startsWith("/via/")) {
      return next();
    }

    // Only intercept if client accepts HTML
    const accept = req.headers.accept ?? "";
    if (!accept.includes("text/html")) {
      return next();
    }

    const originalWrite = res.write;
    const originalEnd = res.end;

    let injected = false;

    function isHtmlResponse(): boolean {
      const ct = res.getHeader("content-type");
      return !!ct && String(ct).includes("text/html");
    }

    function tryInject(chunk: unknown): unknown {
      if (injected || !chunk) return chunk;
      if (!isHtmlResponse()) return chunk;

      const str =
        typeof chunk === "string"
          ? chunk
          : Buffer.isBuffer(chunk)
            ? chunk.toString("utf-8")
            : null;

      if (!str) return chunk;

      // Already injected by transformIndexHtml or manual script tag
      if (str.includes(MARKER) || str.includes("/via/client.js")) {
        injected = true;
        return chunk;
      }

      // Find injection point: prefer </head>, fall back to </body>
      let idx = str.indexOf("</head>");
      if (idx === -1) idx = str.indexOf("</body>");
      if (idx === -1) return chunk;

      injected = true;

      // Strip Content-Length since we're changing the size
      if (!res.headersSent) {
        res.removeHeader("content-length");
      }

      const result = str.slice(0, idx) + SCRIPT_TAG + str.slice(idx);
      return typeof chunk === "string" ? result : Buffer.from(result, "utf-8");
    }

    // Patch write for streaming responses
    res.write = function (chunk: unknown, ...args: unknown[]): boolean {
      return (originalWrite as Function).call(
        res,
        tryInject(chunk),
        ...args,
      );
    } as typeof res.write;

    // Patch end for buffered responses
    res.end = function (chunk?: unknown, ...args: unknown[]): ServerResponse {
      return (originalEnd as Function).call(
        res,
        tryInject(chunk),
        ...args,
      );
    } as typeof res.end;

    next();
  };
}
