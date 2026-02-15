import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "vite";

export interface LogEntry {
  level: "info" | "warn" | "error";
  text: string;
  timestamp: number;
}

const MAX_LOG_LINES = 100;

export class LogBuffer {
  private entries: LogEntry[] = [];
  private logPath: string | undefined;

  init(projectRoot: string) {
    const dir = join(projectRoot, ".viagen");
    mkdirSync(dir, { recursive: true });
    this.logPath = join(dir, "server.log");
    this.flush();
  }

  push(level: LogEntry["level"], text: string) {
    this.entries.push({ level, text, timestamp: Date.now() });
    if (this.entries.length > MAX_LOG_LINES) {
      this.entries.shift();
    }
    this.flush();
  }

  recentErrors(): string[] {
    return this.entries
      .filter((e) => e.level === "error" || e.level === "warn")
      .map((e) => `[${e.level.toUpperCase()}] ${e.text}`);
  }

  private flush() {
    if (!this.logPath) return;
    const content = this.entries
      .map((e) => {
        const ts = new Date(e.timestamp).toISOString();
        return `[${ts}] [${e.level.toUpperCase()}] ${e.text}`;
      })
      .join("\n");
    writeFileSync(this.logPath, content + "\n");
  }
}

export function wrapLogger(logger: Logger, buffer: LogBuffer): void {
  const origInfo = logger.info.bind(logger);
  const origWarn = logger.warn.bind(logger);
  const origError = logger.error.bind(logger);

  logger.info = (msg, opts) => {
    buffer.push("info", msg);
    origInfo(msg, opts);
  };
  logger.warn = (msg, opts) => {
    buffer.push("warn", msg);
    origWarn(msg, opts);
  };
  logger.error = (msg, opts) => {
    buffer.push("error", msg);
    origError(msg, opts);
  };
}
