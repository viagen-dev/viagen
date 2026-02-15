import './style.css'
import typescriptLogo from './typescript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="flex flex-col items-center gap-4">
    <div class="flex gap-4">
      <a href="https://vite.dev" target="_blank">
        <img src="${viteLogo}" class="h-24 p-6 transition-[filter] duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]" alt="Vite logo" />
      </a>
      <a href="https://www.typescriptlang.org/" target="_blank">
        <img src="${typescriptLogo}" class="h-24 p-6 transition-[filter] duration-300 hover:drop-shadow-[0_0_2em_#3178c6aa]" alt="TypeScript logo" />
      </a>
    </div>
    <h1 class="text-5xl font-bold">Vite + TypeScript</h1>
    <div class="p-8">
      <button id="counter" type="button" class="rounded-lg border border-transparent bg-zinc-800 px-5 py-2.5 font-medium cursor-pointer transition-colors hover:border-indigo-400"></button>
    </div>
    <p class="text-zinc-500">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

// Check viagen health
fetch('/via/health')
  .then((res) => res.json())
  .then((data: { status: string; configured: boolean; missing?: string[] }) => {
    const app = document.querySelector<HTMLDivElement>('#app')!

    const el = document.createElement('div')
    el.className = 'mt-6 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-left'

    if (data.configured) {
      el.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="inline-block h-2.5 w-2.5 rounded-full bg-green-500"></span>
          <span class="font-mono text-sm text-zinc-300">viagen: <strong class="text-green-400">${data.status}</strong></span>
        </div>
      `
      app.appendChild(el)
      setupChat(app)
    } else {
      el.innerHTML = `
        <div class="flex items-center gap-2 mb-4">
          <span class="inline-block h-2.5 w-2.5 rounded-full bg-red-500"></span>
          <span class="font-mono text-sm text-zinc-300">viagen: <strong class="text-red-400">${data.status}</strong></span>
        </div>
        <p class="text-sm text-zinc-400 mb-2">To get started:</p>
        <pre class="rounded-lg bg-zinc-950 border border-zinc-800 p-3 mb-3"><code class="text-sm text-indigo-300">cp .env.template .env</code></pre>
        <p class="text-sm text-zinc-400 mb-2">Add your Anthropic API key to <code class="text-indigo-300">.env</code>:</p>
        <pre class="rounded-lg bg-zinc-950 border border-zinc-800 p-3 mb-3"><code class="text-sm text-indigo-300">ANTHROPIC_API_KEY=sk-ant-...</code></pre>
        <p class="text-sm text-zinc-400">Then restart the dev server.</p>
      `
      app.appendChild(el)
    }
  })

function setupChat(app: HTMLDivElement) {
  const chat = document.createElement('div')
  chat.className = 'mt-4 w-full max-w-md'
  chat.innerHTML = `
    <div id="messages" class="rounded-xl border border-zinc-700 bg-zinc-900 p-4 mb-3 min-h-[200px] max-h-[400px] overflow-y-auto text-left space-y-3"></div>
    <form id="chat-form" class="flex gap-2">
      <input
        id="chat-input"
        type="text"
        placeholder="Send a message..."
        class="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
      />
      <button
        type="submit"
        id="chat-send"
        class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white cursor-pointer transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >Send</button>
    </form>
  `
  app.appendChild(chat)

  const form = document.querySelector<HTMLFormElement>('#chat-form')!
  const input = document.querySelector<HTMLInputElement>('#chat-input')!
  const sendBtn = document.querySelector<HTMLButtonElement>('#chat-send')!
  const messages = document.querySelector<HTMLDivElement>('#messages')!

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return

    // Add user message
    const userMsg = document.createElement('div')
    userMsg.className = 'text-sm text-zinc-300'
    userMsg.innerHTML = `<span class="font-semibold text-indigo-400">You:</span> ${escapeHtml(text)}`
    messages.appendChild(userMsg)

    // Add assistant placeholder
    const assistantMsg = document.createElement('div')
    assistantMsg.className = 'text-sm text-zinc-300'
    assistantMsg.innerHTML = `<span class="font-semibold text-green-400">Claude:</span> <span id="stream-target" class="text-zinc-400">...</span>`
    messages.appendChild(assistantMsg)
    messages.scrollTop = messages.scrollHeight

    input.value = ''
    input.disabled = true
    sendBtn.disabled = true

    const target = document.querySelector<HTMLSpanElement>('#stream-target')!
    target.textContent = ''

    try {
      const res = await fetch('/via/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (data.text) {
              target.textContent += data.text
              messages.scrollTop = messages.scrollHeight
            }
          }
          if (line.startsWith('event: error')) {
            target.textContent = 'Error streaming response.'
            target.className = 'text-red-400'
          }
        }
      }
    } catch {
      target.textContent = 'Failed to connect.'
      target.className = 'text-red-400'
    }

    // Remove the id so the next message gets a fresh target
    const finalTarget = document.querySelector('#stream-target')
    if (finalTarget) finalTarget.removeAttribute('id')

    input.disabled = false
    sendBtn.disabled = false
    input.focus()
  })

  input.focus()
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
