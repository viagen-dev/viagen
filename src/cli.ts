import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { deploySandbox, stopSandbox, collectFiles } from "./sandbox";
import type { GitInfo } from "./sandbox";

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

interface LocalGitInfo {
  remoteUrl: string;
  branch: string;
  userName: string;
  userEmail: string;
  isDirty: boolean;
}

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
}

function sshToHttps(url: string): string {
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) return url.replace(/^http:\/\//, "https://");

  // git@host:user/repo.git
  const shorthand = url.match(/^[\w.-]+@([\w.-]+):([\w./_-]+)$/);
  if (shorthand) return `https://${shorthand[1]}/${shorthand[2]}`;

  // ssh://git@host/user/repo.git
  const sshUrl = url.match(/^ssh:\/\/[\w.-]+@([\w.-]+)\/([\w./_-]+)$/);
  if (sshUrl) return `https://${sshUrl[1]}/${sshUrl[2]}`;

  return url;
}

function getGitInfo(cwd: string): LocalGitInfo | null {
  try {
    git(cwd, "rev-parse --is-inside-work-tree");
  } catch {
    return null;
  }

  try {
    const remoteUrlRaw = git(cwd, "remote get-url origin");
    const branch = git(cwd, "branch --show-current");
    const userName = git(cwd, "config user.name");
    const userEmail = git(cwd, "config user.email");
    const status = git(cwd, "status --porcelain");

    const remoteUrl = sshToHttps(remoteUrlRaw);
    if (!remoteUrl || !branch) return null;

    return { remoteUrl, branch, userName, userEmail, isDirty: status.length > 0 };
  } catch {
    return null;
  }
}

function promptUser(question: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
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
    const dotenv = loadDotenv(cwd);
    for (const [key, val] of Object.entries(dotenv)) {
      if (!process.env[key]) process.env[key] = val;
    }
    const env = { ...dotenv, ...process.env } as Record<string, string>;

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

    // Git detection
    const githubToken = env["GITHUB_TOKEN"];
    const gitInfo = getGitInfo(cwd);

    let deployGit: GitInfo | undefined;
    let overlayFiles: { path: string; content: Buffer }[] | undefined;

    if (gitInfo && githubToken) {
      if (gitInfo.isDirty) {
        console.log("");
        console.log("Your working tree has uncommitted changes.");
        console.log("");
        console.log("  1) Clone from remote (clean) — full git, can push");
        console.log("  2) Upload local files — includes changes, no git");
        console.log("  3) Clone + overlay — git history + your local changes (default)");
        console.log("");
        let answer = await promptUser("Choose mode [1/2/3]: ");
        if (!answer || answer === "3") {
          deployGit = {
            remoteUrl: gitInfo.remoteUrl,
            branch: gitInfo.branch,
            userName: gitInfo.userName,
            userEmail: gitInfo.userEmail,
            token: githubToken,
          };
          overlayFiles = collectFiles(cwd, cwd);
        } else if (answer === "1") {
          deployGit = {
            remoteUrl: gitInfo.remoteUrl,
            branch: gitInfo.branch,
            userName: gitInfo.userName,
            userEmail: gitInfo.userEmail,
            token: githubToken,
          };
        } else {
          console.log("Note: Sandbox is ephemeral — changes can't be pushed.");
        }
      } else {
        // Clean tree — default to git clone
        deployGit = {
          remoteUrl: gitInfo.remoteUrl,
          branch: gitInfo.branch,
          userName: gitInfo.userName,
          userEmail: gitInfo.userEmail,
          token: githubToken,
        };
      }
    } else if (gitInfo && !githubToken) {
      console.log("Note: No GITHUB_TOKEN set — changes from the sandbox can't be saved.");
    } else {
      console.log("Note: Not a git repo — sandbox will use file upload (ephemeral).");
    }

    console.log("");
    console.log("Creating sandbox...");
    if (deployGit) {
      console.log(`  Repo:   ${deployGit.remoteUrl}`);
      console.log(`  Branch: ${deployGit.branch}`);
    }

    const result = await deploySandbox({ cwd, apiKey, git: deployGit, overlayFiles });

    console.log("");
    console.log("Sandbox deployed!");
    console.log("");
    console.log(`  URL:        ${result.url}`);
    console.log(`  Sandbox ID: ${result.sandboxId}`);
    console.log(`  Mode:       ${result.mode === "git" ? "git clone (can push)" : "file upload (ephemeral)"}`);
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
