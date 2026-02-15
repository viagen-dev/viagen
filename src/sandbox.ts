import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { Sandbox } from "@vercel/sandbox";

export interface GitInfo {
  /** HTTPS remote URL (transformed from SSH if needed). */
  remoteUrl: string;
  /** Branch to check out. */
  branch: string;
  /** Git user name for commits. */
  userName: string;
  /** Git user email for commits. */
  userEmail: string;
  /** GitHub PAT (or other host token) for auth. */
  token: string;
}

interface DeploySandboxOptions {
  /** Project directory to upload (used in file-upload mode). */
  cwd: string;
  /** Anthropic API key to inject into sandbox .env. */
  apiKey: string;
  /** If provided, clone the repo instead of uploading files. */
  git?: GitInfo;
  /** Dirty files to overlay on top of a git clone. */
  overlayFiles?: { path: string; content: Buffer }[];
}

interface DeploySandboxResult {
  /** Full URL with auth token in query string. */
  url: string;
  /** Auth token for API access. */
  token: string;
  /** Sandbox ID for later management. */
  sandboxId: string;
  /** Deployment mode used. */
  mode: "git" | "upload";
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".viagen",
  ".next",
  ".nuxt",
]);

const SKIP_FILES = new Set([".env", ".env.local"]);

export function collectFiles(
  dir: string,
  base: string,
): { path: string; content: Buffer }[] {
  const files: { path: string; content: Buffer }[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && SKIP_DIRS.has(entry.name)) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    const relPath = relative(base, fullPath);

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      files.push({ path: relPath, content: readFileSync(fullPath) });
    }
  }

  return files;
}

function extractHost(httpsUrl: string): string {
  try {
    return new URL(httpsUrl).host;
  } catch {
    return "github.com";
  }
}

export async function deploySandbox(
  opts: DeploySandboxOptions,
): Promise<DeploySandboxResult> {
  const token = randomUUID();
  const useGit = !!opts.git;

  // Create sandbox — with git source or bare
  const sandbox = await Sandbox.create({
    runtime: "node22",
    ports: [5173],
    ...(opts.git
      ? {
          source: {
            type: "git" as const,
            url: opts.git.remoteUrl,
            username: "x-access-token",
            password: opts.git.token,
            revision: opts.git.branch,
          },
        }
      : {}),
  });

  try {
    if (useGit && opts.git) {
      // Configure git identity for commits
      await sandbox.runCommand("git", [
        "config",
        "user.name",
        opts.git.userName,
      ]);
      await sandbox.runCommand("git", [
        "config",
        "user.email",
        opts.git.userEmail,
      ]);

      // Configure credential helper so Claude can push
      const credentialFile = "/vercel/sandbox/.git-credentials";
      await sandbox.writeFiles([
        {
          path: ".git-credentials",
          content: Buffer.from(
            `https://x-access-token:${opts.git.token}@${extractHost(opts.git.remoteUrl)}\n`,
          ),
        },
      ]);
      await sandbox.runCommand("git", [
        "config",
        "credential.helper",
        `store --file=${credentialFile}`,
      ]);

      // Overlay dirty files if provided
      if (opts.overlayFiles && opts.overlayFiles.length > 0) {
        await sandbox.writeFiles(opts.overlayFiles);
      }
    } else {
      // File upload mode
      const files = collectFiles(opts.cwd, opts.cwd);
      if (files.length > 0) {
        await sandbox.writeFiles(files);
      }
    }

    // Write .env with secrets
    const envLines = [
      `ANTHROPIC_API_KEY=${opts.apiKey}`,
      `VIAGEN_AUTH_TOKEN=${token}`,
    ];
    if (opts.git) {
      envLines.push(`GITHUB_TOKEN=${opts.git.token}`);
    }
    await sandbox.writeFiles([
      {
        path: ".env",
        content: Buffer.from(envLines.join("\n")),
      },
    ]);

    // Install dependencies
    const install = await sandbox.runCommand("npm", ["install"]);
    if (install.exitCode !== 0) {
      const stderr = await install.stderr();
      throw new Error(
        `npm install failed (exit ${install.exitCode}): ${stderr}`,
      );
    }

    // Start dev server (detached so it runs in background)
    await sandbox.runCommand({
      cmd: "npm",
      args: ["run", "dev", "--", "--host", "0.0.0.0"],
      detached: true,
    });

    const baseUrl = sandbox.domain(5173);
    const url = `${baseUrl}?token=${token}`;

    return {
      url,
      token,
      sandboxId: sandbox.sandboxId,
      mode: useGit ? "git" : "upload",
    };
  } catch (err) {
    // Clean up on failure
    await sandbox.stop().catch(() => {});
    throw err;
  }
}

export async function stopSandbox(sandboxId: string): Promise<void> {
  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.stop();
}
