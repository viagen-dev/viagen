import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { deploySandbox, stopSandbox, collectFiles } from "./sandbox";
import { oauthMaxFlow, oauthConsoleFlow, refreshAccessToken } from "./oauth";
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

function writeEnvVars(dir: string, vars: Record<string, string>) {
  const envPath = join(dir, ".env");
  let content = "";
  if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf-8");
  }

  const existing = loadDotenv(dir);
  const toAdd: string[] = [];

  for (const [key, val] of Object.entries(vars)) {
    if (existing[key]) continue;
    toAdd.push(`${key}=${val}`);
  }

  if (toAdd.length === 0) return;

  if (content.length > 0 && !content.endsWith("\n")) {
    content += "\n";
  }
  content += toAdd.join("\n") + "\n";
  writeFileSync(envPath, content);
}

function updateEnvVars(dir: string, vars: Record<string, string>) {
  const envPath = join(dir, ".env");
  if (!existsSync(envPath)) return;

  let content = readFileSync(envPath, "utf-8");
  for (const [key, val] of Object.entries(vars)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `${key}=${val}`);
    }
  }
  writeFileSync(envPath, content);
}

function openBrowser(url: string) {
  try {
    const platform = process.platform;
    if (platform === "darwin") execSync(`open "${url}"`);
    else if (platform === "linux") execSync(`xdg-open "${url}"`);
    else if (platform === "win32") execSync(`start "${url}"`);
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
  return execSync(`git ${args}`, {
    cwd,
    stdio: "pipe",
    encoding: "utf-8",
  }).trim();
}

function sshToHttps(url: string): string {
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) return url.replace(/^http:\/\//, "https://");

  const shorthand = url.match(/^[\w.-]+@([\w.-]+):([\w./_-]+)$/);
  if (shorthand) return `https://${shorthand[1]}/${shorthand[2]}`;

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

    return {
      remoteUrl,
      branch,
      userName,
      userEmail,
      isDirty: status.length > 0,
    };
  } catch {
    return null;
  }
}

function remoteBranchExists(
  remoteUrl: string,
  branch: string,
  token: string,
): boolean {
  try {
    const url = new URL(remoteUrl);
    url.username = "x-access-token";
    url.password = token;
    const out = execSync(
      `git ls-remote --heads ${url.toString()} refs/heads/${branch}`,
      { encoding: "utf-8", stdio: "pipe" },
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/** Extract "owner/repo" from an HTTPS remote URL. */
function repoNwo(remoteUrl: string): string | null {
  const m = remoteUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

/**
 * Create a branch on the remote via `gh api`.
 * Returns true if the branch was created (or already existed).
 */
function createRemoteBranch(
  remoteUrl: string,
  branch: string,
  token: string,
): boolean {
  const nwo = repoNwo(remoteUrl);
  if (!nwo) return false;

  try {
    // Get the SHA of the default branch HEAD
    const sha = execSync(
      `gh api repos/${nwo}/git/ref/heads/main --jq .object.sha`,
      { encoding: "utf-8", stdio: "pipe", env: { ...process.env, GH_TOKEN: token } },
    ).trim();

    if (!sha) return false;

    execSync(
      `gh api repos/${nwo}/git/refs -f ref=refs/heads/${branch} -f sha=${sha}`,
      { encoding: "utf-8", stdio: "pipe", env: { ...process.env, GH_TOKEN: token } },
    );
    return true;
  } catch {
    return false;
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

function shellOk(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function shellOutput(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: "pipe", encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function getVercelConfigDir(): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "com.vercel.cli");
  } else if (platform === "win32") {
    return join(
      process.env["APPDATA"] || join(homedir(), "AppData", "Roaming"),
      "com.vercel.cli",
    );
  } else {
    return join(
      process.env["XDG_DATA_HOME"] || join(homedir(), ".local", "share"),
      "com.vercel.cli",
    );
  }
}

// ─── setup command ───────────────────────────────────────────────

async function setup() {
  const cwd = process.cwd();
  const existing = loadDotenv(cwd);
  const newVars: Record<string, string> = {};

  console.log("viagen setup");
  console.log("");

  // Step 1: Claude authentication
  if (existing["ANTHROPIC_API_KEY"] || existing["CLAUDE_ACCESS_TOKEN"]) {
    console.log("Claude auth ... already configured");
  } else {
    console.log("How do you want to authenticate with Claude?");
    console.log("");
    console.log("  1) Log in with Claude Max/Pro (recommended)");
    console.log("  2) Log in with Anthropic Console (creates API key)");
    console.log("  3) Paste an existing API key");
    console.log("");

    const choice = await promptUser("Choose [1/2/3]: ");

    if (choice === "1" || !choice) {
      const tokens = await oauthMaxFlow();
      newVars["CLAUDE_ACCESS_TOKEN"] = tokens.access_token;
      newVars["CLAUDE_REFRESH_TOKEN"] = tokens.refresh_token;
      newVars["CLAUDE_TOKEN_EXPIRES"] = String(
        Math.floor(Date.now() / 1000) + tokens.expires_in,
      );
      console.log("Claude auth ... Max/Pro tokens saved");
    } else if (choice === "2") {
      const apiKey = await oauthConsoleFlow();
      newVars["ANTHROPIC_API_KEY"] = apiKey;
      console.log("Claude auth ... API key created");
    } else {
      const key = await promptUser("Paste your ANTHROPIC_API_KEY: ");
      if (key) {
        newVars["ANTHROPIC_API_KEY"] = key;
        console.log("Claude auth ... API key saved");
      } else {
        console.log("Claude auth ... skipped");
      }
    }
  }

  console.log("");

  // Step 2: GitHub
  if (existing["GITHUB_TOKEN"]) {
    console.log("GitHub       ... already configured");
  } else if (!shellOk("which gh")) {
    console.log("GitHub CLI (gh) is not installed.");
    console.log("Without it, sandboxes can't commit or push changes.");
    console.log("");
    const install = await promptUser("Install gh now? [y/n]: ");
    if (install === "y" || install === "yes") {
      console.log("");
      console.log("Installing gh...");
      try {
        execSync("brew install gh", { stdio: "inherit" });
        console.log("");
        console.log("Running gh auth login...");
        execSync("gh auth login", { stdio: "inherit" });
        const token = shellOutput("gh auth token");
        if (token) {
          newVars["GITHUB_TOKEN"] = token;
          console.log("GitHub       ... configured");
        }
      } catch {
        console.log("GitHub       ... install failed, skipping");
      }
    } else {
      console.log("GitHub       ... skipped");
    }
  } else if (shellOk("gh auth status")) {
    const token = shellOutput("gh auth token");
    if (token) {
      newVars["GITHUB_TOKEN"] = token;
      console.log("GitHub       ... token from gh CLI");
    }
  } else {
    console.log("gh CLI is installed but not logged in.");
    console.log("Without it, sandboxes can't commit or push changes.");
    console.log("");
    const login = await promptUser("Run gh auth login now? [y/n]: ");
    if (login === "y" || login === "yes") {
      try {
        execSync("gh auth login", { stdio: "inherit" });
        const token = shellOutput("gh auth token");
        if (token) {
          newVars["GITHUB_TOKEN"] = token;
          console.log("GitHub       ... configured");
        }
      } catch {
        console.log("GitHub       ... login failed, skipping");
      }
    } else {
      console.log("GitHub       ... skipped");
    }
  }

  console.log("");

  // Step 3: Vercel
  const hasVercel =
    existing["VERCEL_TOKEN"] &&
    existing["VERCEL_TEAM_ID"] &&
    existing["VERCEL_PROJECT_ID"];

  if (hasVercel) {
    console.log("Vercel       ... already configured");
  } else if (!shellOk("which vercel")) {
    console.log("Vercel CLI is not installed.");
    console.log("Sandbox deployment requires Vercel.");
    console.log("");
    const install = await promptUser("Install vercel now? [y/n]: ");
    if (install === "y" || install === "yes") {
      console.log("");
      console.log("Installing vercel...");
      try {
        execSync("npm i -g vercel", { stdio: "inherit" });
        console.log("");
        console.log("Running vercel login...");
        execSync("vercel login", { stdio: "inherit" });
      } catch {
        console.log("Vercel       ... install failed, skipping");
      }
    }

    // Check if it worked (whether we just installed or user said no)
    if (!shellOk("which vercel") || !shellOk("vercel whoami")) {
      console.log("Vercel       ... not configured (sandbox won't work)");
    }
  }

  // Vercel is installed — configure it (runs for both fresh install and existing)
  if (!hasVercel && shellOk("vercel whoami")) {
    // Link project if needed
    const projectJsonPath = join(cwd, ".vercel", "project.json");
    if (!existsSync(projectJsonPath)) {
      console.log("Vercel       ... linking project...");
      execSync("vercel link --yes", { cwd, stdio: "inherit" });
    }

    // Read project IDs
    if (existsSync(projectJsonPath)) {
      const project = JSON.parse(readFileSync(projectJsonPath, "utf-8")) as {
        orgId: string;
        projectId: string;
      };
      if (!existing["VERCEL_TEAM_ID"]) {
        newVars["VERCEL_TEAM_ID"] = project.orgId;
      }
      if (!existing["VERCEL_PROJECT_ID"]) {
        newVars["VERCEL_PROJECT_ID"] = project.projectId;
      }
    }

    // Read auth token
    if (!existing["VERCEL_TOKEN"]) {
      const authPath = join(getVercelConfigDir(), "auth.json");
      if (existsSync(authPath)) {
        const auth = JSON.parse(readFileSync(authPath, "utf-8")) as {
          token: string;
        };
        newVars["VERCEL_TOKEN"] = auth.token;
      }
    }

    console.log("Vercel       ... configured from CLI");
  } else if (!hasVercel && shellOk("which vercel")) {
    // Installed but not logged in
    console.log("Vercel CLI is installed but not logged in.");
    console.log("Sandbox deployment requires Vercel auth.");
    console.log("");
    const login = await promptUser("Run vercel login now? [y/n]: ");
    if (login === "y" || login === "yes") {
      try {
        execSync("vercel login", { stdio: "inherit" });
      } catch {
        console.log("Vercel       ... login failed");
      }
    }

    if (shellOk("vercel whoami")) {
      // Login succeeded — link and configure
      const projectJsonPath2 = join(cwd, ".vercel", "project.json");
      if (!existsSync(projectJsonPath2)) {
        console.log("Vercel       ... linking project...");
        execSync("vercel link --yes", { cwd, stdio: "inherit" });
      }
      if (existsSync(projectJsonPath2)) {
        const project = JSON.parse(readFileSync(projectJsonPath2, "utf-8")) as {
          orgId: string;
          projectId: string;
        };
        if (!existing["VERCEL_TEAM_ID"]) newVars["VERCEL_TEAM_ID"] = project.orgId;
        if (!existing["VERCEL_PROJECT_ID"]) newVars["VERCEL_PROJECT_ID"] = project.projectId;
      }
      if (!existing["VERCEL_TOKEN"]) {
        const authPath2 = join(getVercelConfigDir(), "auth.json");
        if (existsSync(authPath2)) {
          const auth = JSON.parse(readFileSync(authPath2, "utf-8")) as { token: string };
          newVars["VERCEL_TOKEN"] = auth.token;
        }
      }
      console.log("Vercel       ... configured");
    } else {
      console.log("Vercel       ... not configured (sandbox won't work)");
    }
  }

  console.log("");

  // Step 4: Write .env
  if (Object.keys(newVars).length > 0) {
    writeEnvVars(cwd, newVars);
    console.log("Wrote to .env:");
    for (const key of Object.keys(newVars)) {
      const display =
        key.includes("TOKEN") || key.includes("KEY") || key.includes("SECRET")
          ? newVars[key].slice(0, 8) + "..."
          : newVars[key];
      console.log(`  ${key}=${display}`);
    }
  } else {
    console.log("Nothing new to write — .env is already configured.");
  }

  console.log("");
  console.log("Next steps:");
  console.log("  npm run dev          Start the dev server");
  console.log("  npx viagen sandbox   Deploy to a sandbox");
}

// ─── sandbox command ─────────────────────────────────────────────

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

async function sandbox(args: string[]) {
  const subcommand = args[0];

  if (subcommand === "stop") {
    const sandboxId = args[1];
    if (!sandboxId) {
      console.error("Usage: viagen sandbox stop <sandboxId>");
      process.exit(1);
    }

    console.log(`Stopping sandbox ${sandboxId}...`);
    await stopSandbox(sandboxId);
    console.log("Sandbox stopped.");
    return;
  }

  const branchOverride = parseFlag(args, "--branch") || parseFlag(args, "-b");
  const timeoutFlag = parseFlag(args, "--timeout") || parseFlag(args, "-t");
  const timeoutMinutes = timeoutFlag ? parseInt(timeoutFlag, 10) : undefined;

  // Default: deploy sandbox
  const cwd = process.cwd();
  const dotenv = loadDotenv(cwd);
  for (const [key, val] of Object.entries(dotenv)) {
    if (!process.env[key]) process.env[key] = val;
  }
  const env = { ...dotenv, ...process.env } as Record<string, string>;

  const hasApiKey = !!env["ANTHROPIC_API_KEY"];
  const hasOAuth = !!env["CLAUDE_ACCESS_TOKEN"];
  if (!hasApiKey && !hasOAuth) {
    console.error(
      "Error: No Claude auth found. Run `npx viagen setup` first.",
    );
    process.exit(1);
  }

  // Refresh OAuth tokens if expired (or expiring within 5 min)
  if (hasOAuth && env["CLAUDE_REFRESH_TOKEN"]) {
    const expires = parseInt(env["CLAUDE_TOKEN_EXPIRES"] || "0", 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > expires - 300) {
      console.log("Refreshing Claude OAuth tokens...");
      try {
        const tokens = await refreshAccessToken(env["CLAUDE_REFRESH_TOKEN"]);
        env["CLAUDE_ACCESS_TOKEN"] = tokens.access_token;
        env["CLAUDE_REFRESH_TOKEN"] = tokens.refresh_token;
        env["CLAUDE_TOKEN_EXPIRES"] = String(nowSec + tokens.expires_in);
        // Persist refreshed tokens to .env
        updateEnvVars(cwd, {
          CLAUDE_ACCESS_TOKEN: tokens.access_token,
          CLAUDE_REFRESH_TOKEN: tokens.refresh_token,
          CLAUDE_TOKEN_EXPIRES: String(nowSec + tokens.expires_in),
        });
        console.log("  Tokens refreshed.");
      } catch (err) {
        console.error(
          "Failed to refresh OAuth tokens. Run `npx viagen setup` to re-authenticate.",
        );
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }
  }

  const hasOidc = !!env["VERCEL_OIDC_TOKEN"];
  const hasToken =
    !!env["VERCEL_TOKEN"] &&
    !!env["VERCEL_TEAM_ID"] &&
    !!env["VERCEL_PROJECT_ID"];

  if (!hasOidc && !hasToken) {
    console.error(
      "Error: Vercel not configured. Run `npx viagen setup` first.",
    );
    process.exit(1);
  }

  // Git detection
  const githubToken = env["GITHUB_TOKEN"];
  const gitInfo = getGitInfo(cwd);

  let deployGit: GitInfo | undefined;
  let overlayFiles: { path: string; content: Buffer }[] | undefined;

  const branch = branchOverride || (gitInfo ? gitInfo.branch : "main");

  if (gitInfo && githubToken) {
    let branchExistsOnRemote = remoteBranchExists(
      gitInfo.remoteUrl,
      branch,
      githubToken,
    );
    if (!branchExistsOnRemote) {
      console.log(
        `Branch "${branch}" not found on remote — creating it...`,
      );
      const created = createRemoteBranch(
        gitInfo.remoteUrl,
        branch,
        githubToken,
      );
      if (created) {
        console.log(`  Branch "${branch}" created on remote (from main).`);
        branchExistsOnRemote = true;
      } else {
        console.log(
          `  Could not create branch on remote — will clone default branch and create locally.`,
        );
      }
    }

    const makeGitInfo = (): GitInfo => ({
      remoteUrl: gitInfo.remoteUrl,
      branch,
      revision: branchExistsOnRemote ? branch : undefined,
      userName: gitInfo.userName,
      userEmail: gitInfo.userEmail,
      token: githubToken,
    });

    if (gitInfo.isDirty && !branchOverride) {
      console.log("");
      console.log("Your working tree has uncommitted changes.");
      console.log("");
      console.log("  1) Clone from remote (clean) — full git, can push");
      console.log("  2) Upload local files — includes changes, no git");
      console.log(
        "  3) Clone + overlay — git history + your local changes (default)",
      );
      console.log("");
      const answer = await promptUser("Choose mode [1/2/3]: ");
      if (!answer || answer === "3") {
        deployGit = makeGitInfo();
        overlayFiles = collectFiles(cwd, cwd);
      } else if (answer === "1") {
        deployGit = makeGitInfo();
      } else {
        console.log("Note: Sandbox is ephemeral — changes can't be pushed.");
      }
    } else {
      deployGit = makeGitInfo();
    }
  } else if (gitInfo && !githubToken) {
    console.log(
      "Note: No GITHUB_TOKEN set — changes from the sandbox can't be saved.",
    );
  } else {
    console.log(
      "Note: Not a git repo — sandbox will use file upload (ephemeral).",
    );
  }

  // Read sandboxFiles from .viagen/config.json (written by the plugin)
  const configPath = join(cwd, ".viagen", "config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const sandboxFiles: string[] = config.sandboxFiles ?? [];
      if (sandboxFiles.length > 0) {
        const extra: { path: string; content: Buffer }[] = [];
        for (const file of sandboxFiles) {
          const fullPath = join(cwd, file);
          if (existsSync(fullPath)) {
            extra.push({ path: file, content: readFileSync(fullPath) });
          } else {
            console.log(`  Warning: sandboxFiles entry "${file}" not found, skipping.`);
          }
        }
        if (extra.length > 0) {
          overlayFiles = [...(overlayFiles ?? []), ...extra];
          console.log(`  Including ${extra.length} extra file(s) from sandboxFiles.`);
        }
      }
    } catch {
      // Ignore if config is missing or malformed
    }
  }

  console.log("");
  console.log("Creating sandbox...");
  if (deployGit) {
    console.log(`  Repo:   ${deployGit.remoteUrl}`);
    console.log(`  Branch: ${deployGit.branch}`);
  }

  const result = await deploySandbox({
    cwd,
    apiKey: hasApiKey ? env["ANTHROPIC_API_KEY"] : undefined,
    oauth: hasOAuth
      ? {
          accessToken: env["CLAUDE_ACCESS_TOKEN"],
          refreshToken: env["CLAUDE_REFRESH_TOKEN"],
          tokenExpires: env["CLAUDE_TOKEN_EXPIRES"],
        }
      : undefined,
    git: deployGit,
    overlayFiles,
    envVars: dotenv,
    vercel:
      env["VERCEL_TOKEN"] && env["VERCEL_TEAM_ID"] && env["VERCEL_PROJECT_ID"]
        ? {
            token: env["VERCEL_TOKEN"],
            teamId: env["VERCEL_TEAM_ID"],
            projectId: env["VERCEL_PROJECT_ID"],
          }
        : undefined,
    timeoutMinutes,
  });

  const iframeUrl = result.url.replace("?token=", "via/iframe?token=");
  const chatUrl = result.url.replace("?token=", "via/ui?token=");

  console.log("");
  console.log("Sandbox deployed!");
  console.log("");
  console.log(`  App:        ${result.url}`);
  console.log(`  Split view: ${iframeUrl}`);
  console.log(`  Chat only:  ${chatUrl}`);
  console.log("");
  console.log(`  Sandbox ID: ${result.sandboxId}`);
  console.log(
    `  Mode:       ${result.mode === "git" ? "git clone (can push)" : "file upload (ephemeral)"}`,
  );
  console.log(`  Timeout:    ${timeoutMinutes ?? 30} minutes`);
  console.log("");
  console.log(`Stop with: npx viagen sandbox stop ${result.sandboxId}`);

  openBrowser(iframeUrl);
}

// ─── help ────────────────────────────────────────────────────────

function help() {
  console.log("viagen — Claude Code in your Vite dev server");
  console.log("");
  console.log("Usage:");
  console.log("  viagen <command>");
  console.log("");
  console.log("Commands:");
  console.log("  setup                          Set up .env with API keys and tokens");
  console.log("  sandbox [-b branch] [-t min]   Deploy your project to a Vercel Sandbox");
  console.log("  sandbox stop <id>              Stop a running sandbox");
  console.log("  help                           Show this help message");
  console.log("");
  console.log("Sandbox options:");
  console.log("  -b, --branch <name>   Branch to clone (default: current branch)");
  console.log("  -t, --timeout <min>   Sandbox timeout in minutes (default: 30)");
  console.log("");
  console.log("Getting started:");
  console.log("  1. npm install viagen");
  console.log("  2. Add viagen() to your vite.config.ts plugins");
  console.log("  3. npx viagen setup");
  console.log("  4. npm run dev");
  console.log("");
  console.log("Environment variables (.env):");
  console.log(
    "  ANTHROPIC_API_KEY      Claude API key (from console or setup).",
  );
  console.log(
    "  CLAUDE_ACCESS_TOKEN    Claude Max/Pro OAuth token (from setup).",
  );
  console.log(
    "  GITHUB_TOKEN           Enables git commit+push from sandbox.",
  );
  console.log(
    "  VIAGEN_AUTH_TOKEN      Protects all endpoints with token auth.",
  );
  console.log(
    "  VERCEL_TOKEN           Vercel access token (for sandbox).",
  );
  console.log(
    "  VERCEL_TEAM_ID         Vercel team ID (for sandbox).",
  );
  console.log(
    "  VERCEL_PROJECT_ID      Vercel project ID (for sandbox).",
  );
  console.log("");
  console.log("Docs: https://viagen.dev");
}

// ─── main ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "setup") {
    await setup();
  } else if (command === "sandbox") {
    await sandbox(args.slice(1));
  } else {
    help();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
