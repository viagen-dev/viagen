# Viagen (Vite Agent)

A Vite plugin that exposes endpoints for chatting with Claude Code. Add it to any Vite app, spin up a sandbox, and remotely chat with your app to make changes.

## Install

```bash
npm install viagen
```

## Usage

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import { viagen } from 'viagen'

export default defineConfig({
  plugins: [viagen()],
})
```

Set the `ANTHROPIC_API_KEY` environment variable, then start your dev server. The plugin adds endpoints under `/via/*`:

- `GET /via/health` — Returns env var configuration status
- `POST /via/chat` — Chat with Claude Code to build and modify your app (streams SSE)
- `POST /via/chat/reset` — Reset the conversation

Claude Code runs as a subprocess with full access to your project — it can read, write, and edit files, run commands, and search your codebase. Changes trigger Vite HMR automatically.

## Development

```bash
npm install
npm run dev        # Start the playground dev server
npm run build      # Build the plugin with tsup
npm run typecheck  # Run TypeScript type checking
```
