import './style.css'
import typescriptLogo from './typescript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

// Check viagen health
fetch('/via/health')
  .then((res) => res.json())
  .then((data: { status: string; configured: boolean; missing?: string[] }) => {
    const el = document.createElement('div')
    el.className = 'card'

    if (data.configured) {
      el.innerHTML = `<p>viagen: <strong>${data.status}</strong></p>`
    } else {
      el.innerHTML = `<p>viagen: <strong>${data.status}</strong> — missing: ${data.missing?.join(', ')}</p>`
    }

    document.querySelector<HTMLDivElement>('#app')!.appendChild(el)
  })
