import type { Plugin } from 'vite'

export function viagen(): Plugin {
  return {
    name: 'viagen',
    configureServer(server) {
      server.middlewares.use('/via/health', (_req, res) => {
        const required = ['ANTHROPIC_API_KEY']
        const missing = required.filter((key) => !process.env[key])

        res.setHeader('Content-Type', 'application/json')

        if (missing.length === 0) {
          res.end(JSON.stringify({ status: 'ok', configured: true }))
        } else {
          res.end(
            JSON.stringify({ status: 'error', configured: false, missing })
          )
        }
      })
    },
  }
}

export default viagen
