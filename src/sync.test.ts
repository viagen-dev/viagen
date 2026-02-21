import { describe, it, expect } from "vitest";
import { gatherSyncSecrets } from "./cli";

describe("gatherSyncSecrets", () => {
  it("returns empty object when no credentials in env", () => {
    expect(gatherSyncSecrets({})).toEqual({});
  });

  it("includes Claude Max tokens when all three are present", () => {
    const env = {
      CLAUDE_ACCESS_TOKEN: "access-123",
      CLAUDE_REFRESH_TOKEN: "refresh-456",
      CLAUDE_TOKEN_EXPIRES: "1700000000",
    };
    const secrets = gatherSyncSecrets(env);
    expect(secrets).toEqual({
      CLAUDE_ACCESS_TOKEN: "access-123",
      CLAUDE_REFRESH_TOKEN: "refresh-456",
      CLAUDE_TOKEN_EXPIRES: "1700000000",
    });
  });

  it("includes ANTHROPIC_API_KEY when present", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-abc123" };
    const secrets = gatherSyncSecrets(env);
    expect(secrets).toEqual({ ANTHROPIC_API_KEY: "sk-ant-abc123" });
  });

  it("includes GitHub and Vercel tokens when present", () => {
    const env = {
      GITHUB_TOKEN: "ghp_abc",
      VERCEL_TOKEN: "vercel-xyz",
      VERCEL_ORG_ID: "team_123",
      VERCEL_PROJECT_ID: "prj_456",
    };
    const secrets = gatherSyncSecrets(env);
    expect(secrets).toEqual({
      GITHUB_TOKEN: "ghp_abc",
      VERCEL_TOKEN: "vercel-xyz",
      VERCEL_ORG_ID: "team_123",
      VERCEL_PROJECT_ID: "prj_456",
    });
  });

  it("includes git user info when present", () => {
    const env = {
      GIT_USER_NAME: "Ben",
      GIT_USER_EMAIL: "ben@example.com",
    };
    const secrets = gatherSyncSecrets(env);
    expect(secrets).toEqual({
      GIT_USER_NAME: "Ben",
      GIT_USER_EMAIL: "ben@example.com",
    });
  });

  it("omits keys that are missing", () => {
    const env = {
      GITHUB_TOKEN: "ghp_abc",
      // No Claude, no Vercel
    };
    const secrets = gatherSyncSecrets(env);
    expect(secrets).toEqual({ GITHUB_TOKEN: "ghp_abc" });
    expect(secrets).not.toHaveProperty("CLAUDE_ACCESS_TOKEN");
    expect(secrets).not.toHaveProperty("VERCEL_TOKEN");
  });

  it("omits keys with empty values", () => {
    const env = {
      GITHUB_TOKEN: "ghp_abc",
      VERCEL_TOKEN: "",
      ANTHROPIC_API_KEY: "",
    };
    const secrets = gatherSyncSecrets(env);
    expect(secrets).toEqual({ GITHUB_TOKEN: "ghp_abc" });
  });

  it("gathers all credentials when everything is set", () => {
    const env = {
      CLAUDE_ACCESS_TOKEN: "access",
      CLAUDE_REFRESH_TOKEN: "refresh",
      CLAUDE_TOKEN_EXPIRES: "9999999999",
      ANTHROPIC_API_KEY: "sk-ant-key",
      GITHUB_TOKEN: "ghp_token",
      VERCEL_TOKEN: "vtoken",
      VERCEL_ORG_ID: "team_id",
      VERCEL_PROJECT_ID: "prj_id",
      GIT_USER_NAME: "User",
      GIT_USER_EMAIL: "user@test.com",
    };
    const secrets = gatherSyncSecrets(env);
    expect(Object.keys(secrets)).toHaveLength(10);
  });
});
