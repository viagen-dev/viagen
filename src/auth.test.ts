import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer } from "./test-server";
import { createAuthMiddleware } from "./auth";

const TOKEN = "test-secret-token";

describe("auth middleware", () => {
  const server = createTestServer((app) => {
    app.use(createAuthMiddleware(TOKEN));
    app.use((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });

  beforeAll(() => server.start());
  afterAll(() => server.stop());

  it("rejects requests with no auth", async () => {
    const res = await fetch(server.url);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("accepts valid Bearer token", async () => {
    const res = await fetch(server.url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects invalid Bearer token", async () => {
    const res = await fetch(server.url, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts valid session cookie", async () => {
    const res = await fetch(server.url, {
      headers: { Cookie: `viagen_session=${TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects invalid session cookie", async () => {
    const res = await fetch(server.url, {
      headers: { Cookie: "viagen_session=wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("redirects and sets cookie on valid ?token= param", async () => {
    const res = await fetch(`${server.url}/some/path?token=${TOKEN}&other=1`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/some/path?other=1");

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain(`viagen_session=${TOKEN}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  it("redirects to clean path when token is the only param", async () => {
    const res = await fetch(`${server.url}/?token=${TOKEN}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("rejects invalid ?token= param", async () => {
    const res = await fetch(`${server.url}/?token=wrong`);
    expect(res.status).toBe(401);
  });
});
