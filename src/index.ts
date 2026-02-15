import Anthropic from '@anthropic-ai/sdk'
import { loadEnv, type Plugin } from 'vite'
import type { IncomingMessage } from 'node:http'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export function viagen(): Plugin {
  let env: Record<string, string>

  return {
    name: 'viagen',
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir ?? config.root, '')
    },
    configureServer(server) {
      server.middlewares.use('/via/health', (_req, res) => {
        const required = ['ANTHROPIC_API_KEY']
        const missing = required.filter((key) => !env[key])

        res.setHeader('Content-Type', 'application/json')

        if (missing.length === 0) {
          res.end(JSON.stringify({ status: 'ok', configured: true }))
        } else {
          res.end(
            JSON.stringify({ status: 'error', configured: false, missing })
          )
        }
      })

      server.middlewares.use('/via/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        if (!env['ANTHROPIC_API_KEY']) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }))
          return
        }

        let message: string
        try {
          const body = JSON.parse(await readBody(req))
          message = body.message
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
          return
        }

        if (!message) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing "message" field' }))
          return
        }

        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        try {
          const client = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] })

          const stream = await client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 1024,
            messages: [{ role: 'user', content: message }],
            stream: true,
          })

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            }
          }

          res.write('event: done\ndata: {}\n\n')
          res.end()
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          res.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`)
          res.end()
        }
      })
    },
  }
}

export default viagen
