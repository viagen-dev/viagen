import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { Sandbox } from "@vercel/sandbox";

interface DeploySandboxOptions {
  /** Project directory to upload. */
  cwd: string;
  /** Anthropic API key to inject into sandbox .env. */
  apiKey: string;
}

interface DeploySandboxResult {
  /** Full URL with auth token in query string. */
  url: string;
  /** Auth token for API access. */
  token: string;
  /** Sandbox ID for later management. */
  sandboxId: string;
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

function collectFiles(
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

export async function deploySandbox(
  opts: DeploySandboxOptions,
): Promise<DeploySandboxResult> {
  const token = randomUUID();

  // Create sandbox with Node.js runtime and expose Vite's default port
  const sandbox = await Sandbox.create({
    runtime: "node22",
    ports: [5173],
  });

  try {
    // Upload project files
    const files = collectFiles(opts.cwd, opts.cwd);
    if (files.length > 0) {
      await sandbox.writeFiles(files);
    }

    // Write .env with secrets
    await sandbox.writeFiles([
      {
        path: ".env",
        content: Buffer.from(
          [
            `ANTHROPIC_API_KEY=${opts.apiKey}`,
            `VIAGEN_AUTH_TOKEN=${token}`,
          ].join("\n"),
        ),
      },
    ]);

    // Install dependencies
    const install = await sandbox.runCommand("npm", ["install"]);
    if (install.exitCode !== 0) {
      const stderr = await install.stderr();
      throw new Error(`npm install failed (exit ${install.exitCode}): ${stderr}`);
    }

    // Start dev server (detached so it runs in background)
    await sandbox.runCommand({
      cmd: "npm",
      args: ["run", "dev", "--", "--host", "0.0.0.0"],
      detached: true,
    });

    const domain = sandbox.domain(5173);
    const url = `https://${domain}?token=${token}`;

    return {
      url,
      token,
      sandboxId: sandbox.sandboxId,
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
