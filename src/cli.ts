#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { deploySandbox, stopSandbox } from "./sandbox";

function loadDotenv(dir: string): Record<string, string> {
  const envPath = join(dir, ".env");
  if (!existsSync(envPath)) return {};

  const vars: Record<string, string> = {};
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    vars[key] = val;
  }
  return vars;
}

function openBrowser(url: string) {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      execSync(`open "${url}"`);
    } else if (platform === "linux") {
      execSync(`xdg-open "${url}"`);
    } else if (platform === "win32") {
      execSync(`start "${url}"`);
    }
  } catch {
    // Silent fail — user can open manually
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "sandbox") {
    const subcommand = args[1];

    if (subcommand === "stop") {
      const sandboxId = args[2];
      if (!sandboxId) {
        console.error("Usage: viagen sandbox stop <sandboxId>");
        process.exit(1);
      }

      console.log(`Stopping sandbox ${sandboxId}...`);
      await stopSandbox(sandboxId);
      console.log("Sandbox stopped.");
      return;
    }

    // Default: deploy sandbox
    const cwd = process.cwd();
    const env = { ...loadDotenv(cwd), ...process.env } as Record<string, string>;

    const apiKey = env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      console.error("Error: ANTHROPIC_API_KEY not found.");
      console.error("Set it in .env or as an environment variable.");
      process.exit(1);
    }

    // Check for Vercel auth
    const hasOidc = !!env["VERCEL_OIDC_TOKEN"];
    const hasToken =
      !!env["VERCEL_TOKEN"] &&
      !!env["VERCEL_TEAM_ID"] &&
      !!env["VERCEL_PROJECT_ID"];

    if (!hasOidc && !hasToken) {
      console.error("Error: Vercel authentication not configured.");
      console.error("");
      console.error("Option 1: Run `vercel link && vercel env pull`");
      console.error(
        "Option 2: Set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID",
      );
      process.exit(1);
    }

    console.log("Creating sandbox...");
    const result = await deploySandbox({ cwd, apiKey });

    console.log("");
    console.log("Sandbox deployed!");
    console.log("");
    console.log(`  URL:        ${result.url}`);
    console.log(`  Sandbox ID: ${result.sandboxId}`);
    console.log(`  Token:      ${result.token}`);
    console.log("");
    console.log(`Stop with: npx viagen sandbox stop ${result.sandboxId}`);

    openBrowser(result.url);
  } else {
    console.log("viagen — Claude Code in your Vite dev server");
    console.log("");
    console.log("Commands:");
    console.log("  viagen sandbox           Deploy to a Vercel Sandbox");
    console.log("  viagen sandbox stop <id> Stop a running sandbox");
    console.log("");
    console.log("As a Vite plugin:");
    console.log("  npm install viagen");
    console.log("  Add viagen() to your vite.config.ts plugins");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
