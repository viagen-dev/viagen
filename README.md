# Viagen (Vite Agent)

A Vite plugin that embeds Claude Code into any Vite dev server.

## Install

```bash
npm install viagen
```

## Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { viagen } from 'viagen'

export default defineConfig({
  plugins: [viagen()],
})
```

Set `ANTHROPIC_API_KEY` in your `.env`, start the dev server.

## Options

```ts
viagen({
  position: 'bottom-right',  // toggle button: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  model: 'sonnet',           // claude model
  panelWidth: 420,           // chat panel width in px
  overlay: true,             // "Fix This Error" button on Vite error overlay
  ui: true,                  // inject toggle button + chat panel into pages
})
```

All options are optional. Defaults shown above.

## Sandbox

Deploy your dev server to a remote Vercel Sandbox:

```bash
npx viagen sandbox
```

This creates an isolated microVM, uploads your project, installs dependencies, and starts the dev server. All endpoints are protected with token-based auth.

**Prerequisites:** `ANTHROPIC_API_KEY` in `.env` + Vercel auth (`vercel link && vercel env pull` or set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`).

```bash
npx viagen sandbox stop <sandboxId>   # Stop a running sandbox
```

## Auth

Set `VIAGEN_AUTH_TOKEN` in `.env` to protect all endpoints. When set:

- Browser: visit `?token=<token>` to set a session cookie
- API: use `Authorization: Bearer <token>` header

Auth is automatic when deploying via `npx viagen sandbox`.

## Endpoints

**`POST /via/chat`** — Send a message, get a streamed response.

```bash
curl -N -X POST http://localhost:5173/via/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "add a dark mode toggle"}'
```

Response is SSE with `data:` lines containing JSON:

```
data: {"type":"text","text":"I'll add a dark mode toggle..."}
data: {"type":"tool_use","name":"Edit","input":{"file_path":"src/App.tsx"}}
data: {"type":"text","text":"Done! The toggle is in the header."}
event: done
data: {}
```

**`POST /via/chat/reset`** — Clear conversation history.

**`GET /via/health`** — Check if `ANTHROPIC_API_KEY` is configured.

**`GET /via/error`** — Get the latest Vite build error (if any).

## UI

The plugin injects a `via` toggle button into your page. Click it to open the chat panel. Build errors get a "Fix This Error" button on the Vite error overlay.

You can also open the chat UI directly at `http://localhost:5173/via/ui`.

## Development

```bash
npm install
npm run dev        # Dev server
npm run build      # Build with tsup
```
