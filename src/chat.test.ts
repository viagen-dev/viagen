import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer } from "./test-server";
import { registerChatRoutes } from "./chat";
import { LogBuffer } from "./logger";
import type { ViteDevServer } from "vite";

/**
 * Tests for chat endpoint validation paths.
 * These don't spawn Claude — they test the guard logic
 * (method, API key, body parsing) that runs before the subprocess.
 */
describe("chat routes — validation", () => {
  const logBuffer = new LogBuffer();

  const server = createTestServer((app) => {
    const fakeServer = { middlewares: app } as unknown as ViteDevServer;
    registerChatRoutes(fakeServer, {
      env: {}, // no API key
      projectRoot: "/tmp/fake",
      logBuffer,
      model: "sonnet",
      claudeBin: "/nonexistent/claude",
    });
  });

  beforeAll(() => server.start());
  afterAll(() => server.stop());

  it("rejects non-POST to /via/chat", async () => {
    const res = await fetch(`${server.url}/via/chat`);
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "Method not allowed" });
  });

  it("returns 500 when ANTHROPIC_API_KEY is missing", async () => {
    const res = await fetch(`${server.url}/via/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "ANTHROPIC_API_KEY not configured",
    });
  });

  it("resets session via /via/chat/reset", async () => {
    const res = await fetch(`${server.url}/via/chat/reset`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("chat routes — body validation", () => {
  const logBuffer = new LogBuffer();

  const server = createTestServer((app) => {
    const fakeServer = { middlewares: app } as unknown as ViteDevServer;
    registerChatRoutes(fakeServer, {
      env: { ANTHROPIC_API_KEY: "sk-test-key" },
      projectRoot: "/tmp/fake",
      logBuffer,
      model: "sonnet",
      claudeBin: "/nonexistent/claude",
    });
  });

  beforeAll(() => server.start());
  afterAll(() => server.stop());

  it("rejects invalid JSON body", async () => {
    const res = await fetch(`${server.url}/via/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("rejects missing message field", async () => {
    const res = await fetch(`${server.url}/via/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notMessage: "hello" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing "message" field' });
  });
});
