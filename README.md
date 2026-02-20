# viagen

A Vite dev server plugin and CLI tool that enables you to use Claude Code in a sandbox — instantly.

## Prerequisites

- [Claude](https://claude.ai/signup) — Max, Pro, or API plan. The setup wizard handles auth.
- [Vercel](https://vercel.com/signup) — Free plan works. Sandboxes last 45 min on Hobby, 5 hours on Pro.
- [GitHub CLI](https://cli.github.com) — Enables git clone and push from sandboxes.

## Step 1 — Add viagen to your app

```bash
npm install --save-dev viagen
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { viagen } from 'viagen'

export default defineConfig({
  plugins: [viagen()],
})
```

## Step 2 — Setup

```bash
npx viagen setup
```

The setup wizard authenticates with Claude, detects your GitHub and Vercel credentials, and captures your git remote info — all written to your local `.env`. This ensures sandboxes clone the correct repo instead of inferring it at runtime.

You can now run `npm run dev` to start the local dev server. At this point you can launch viagen and chat with Claude to make changes to your app.

## Step 3 — Sandbox

```bash
npx viagen sandbox
```

Deploys your dev server to a remote Vercel Sandbox — an isolated VM-like environment where Claude can read, write, and push code.

```bash
# Deploy on a specific branch
npx viagen sandbox --branch feature/my-thing

# Set a longer timeout (default: 30 min)
npx viagen sandbox --timeout 60

# Auto-send a prompt on load
npx viagen sandbox --prompt "build me a landing page"

# Stop a running sandbox
npx viagen sandbox stop <sandboxId>
```

## Step 4 — Sync

```bash
npx viagen sync
```

Pushes your local `.env` credentials (Claude Max tokens, GitHub token, Vercel config) to a platform project. This lets you launch sandboxes from the web — use your Max subscription from any device without needing a browser redirect.

The first run prompts you to pick or create a project. After that, subsequent syncs target the same project automatically (stored as `VIAGEN_PROJECT_ID` in `.env`).

Claude tokens are refreshed automatically if expired before syncing. Requires `viagen login` first.

## Plugin Options

```ts
viagen({
  position: 'bottom-right',  // toggle button position
  model: 'sonnet',           // claude model
  panelWidth: 420,           // chat panel width in px
  overlay: true,             // fix button on error overlay
  ui: true,                  // inject chat panel into pages
  sandboxFiles: [...],       // copy files manually into sandbox
  systemPrompt: '...',       // custom system prompt (see below)
  editable: ['src','conf'],  // files/dirs editable in the UI
})
```

### SSR Frameworks (React Router, Remix, SvelteKit, etc.)

For plain Vite apps, the chat panel is injected automatically. SSR frameworks render their own HTML, so you need to add one script tag to your root layout:

```html
<script src="/via/client.js" defer></script>
```

For React Router, add it to `app/root.tsx`:

```tsx
export default function Root() {
  return (
    <html>
      <head>
        <script src="/via/client.js" defer />
        {/* ... */}
      </head>
      {/* ... */}
    </html>
  )
}
```

### Editable Files

Add a file editor panel to the chat UI:

```ts
viagen({
  editable: ['src/components', 'vite.config.ts']
})
```

Paths can be files or directories (directories include all files within). The editor appears as a "Files" tab in the chat panel.

The default system prompt:

```
You are embedded in a Vite dev server as the "viagen" plugin. Your job is to
help build and modify the app. Files you edit will trigger Vite HMR
automatically. You can read .viagen/server.log to check recent Vite dev server
output (compile errors, HMR updates, warnings). When running in a sandbox with
git, the gh CLI is available and authenticated — you can create pull requests,
comment on issues, and manage releases.

Publishing workflow:
- If you are on a feature branch (not main/master): commit your changes, push
  to the remote, and create a pull request using "gh pr create". Share the PR URL.
- If you are on main/master and Vercel credentials are set ($VERCEL_TOKEN):
  commit, push, and run "vercel deploy" to publish a preview. Share the preview URL.
- Check your current branch with "git branch --show-current" before deciding
  which workflow to use.

Be concise.
```

Recent build errors are automatically appended to give Claude context about what went wrong. To customize the prompt, you can replace it entirely or extend the default:

```ts
import { viagen, DEFAULT_SYSTEM_PROMPT } from 'viagen'

viagen({
  // Replace entirely
  systemPrompt: 'You are a React expert. Only use TypeScript.',

  // Or extend the default
  systemPrompt: DEFAULT_SYSTEM_PROMPT + '\nAlways use Tailwind for styling.',
})
```

## API

Every viagen endpoint is available as an API. Build your own UI, integrate with CI, or script Claude from the command line.

```
POST /via/chat        — send a message, streamed SSE response
POST /via/chat/reset  — clear conversation history
GET  /via/health      — check API key status
GET  /via/error       — latest build error (if any)
GET  /via/ui          — standalone chat interface
GET  /via/iframe      — split view (app + chat side by side)
GET  /via/files       — list editable files (when configured)
GET  /via/file?path=  — read file content
POST /via/file        — write file content { path, content }
GET  /via/git/status  — list changed files (git status)
GET  /via/git/diff    — full diff, or single file with ?path=
GET  /via/logs        — dev server log entries, optional ?since=<timestamp>
```

When `VIAGEN_AUTH_TOKEN` is set (always on in sandboxes), pass the token as a `Bearer` header or `?token=` query param.

```bash
# With curl
curl -X POST http://localhost:5173/via/chat \
  -H "Authorization: Bearer $VIAGEN_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "add a hello world route"}'

# Or pass the token as a query param (sets a session cookie)
open "http://localhost:5173/via/ui?token=$VIAGEN_AUTH_TOKEN"
```

## Development

```bash
npm install
npm run dev        # Dev server (site)
npm run build      # Build with tsup
npm run test       # Run tests
npm run typecheck  # Type check
```

## License

[MIT](LICENSE)
