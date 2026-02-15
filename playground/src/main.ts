import "./style.css";
import typescriptLogo from "./typescript.svg";
import viteLogo from "/vite.svg";
import claudeLogo from "./claude.svg";
import { setupCounter } from "./counter.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="flex flex-col items-center gap-4">
    <div class="flex gap-4">
      <a href="https://vite.dev" target="_blank">
        <img src="${viteLogo}" class="h-24 p-6 transition-[filter] duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]" alt="Vite logo" />
      </a>
      <a href="https://www.typescriptlang.org/" target="_blank">
        <img src="${typescriptLogo}" class="h-24 p-6 transition-[filter] duration-300 hover:drop-shadow-[0_0_2em_#3178c6aa]" alt="TypeScript logo" />
      </a>
      <a href="https://claude.ai" target="_blank">
        <img src="${claudeLogo}" class="h-24 p-6 transition-[filter] duration-300 hover:drop-shadow-[0_0_2em_#E07B53aa]" alt="Claude logo" />
      </a>
    </div>
    <h1 class="text-5xl font-bold">Vite + TypeScript + Claude</h1>
    <div class="p-8">
      <button id="counter" type="button" class="rounded-lg border border-transparent bg-zinc-800 px-5 py-2.5 font-medium cursor-pointer transition-colors hover:border-indigo-400"></button>
    </div>
    <p class="text-zinc-500">
      Click on the Vite, TypeScript, and Claude logos to learn more
    </p>
  </div>
`;

setupCounter(document.querySelector<HTMLButtonElement>("#counter")!);

// Check viagen health
fetch("/via/health")
  .then((res) => res.json())
  .then((data: { status: string; configured: boolean; missing?: string[] }) => {
    const app = document.querySelector<HTMLDivElement>("#app")!;

    const el = document.createElement("div");
    el.className =
      "mt-6 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-left";

    if (data.configured) {
      el.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full bg-green-500"></span>
            <span class="font-mono text-sm text-zinc-300">viagen: <strong class="text-green-400">${data.status}</strong></span>
          </div>
          <button id="launch-via" class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white cursor-pointer transition-colors hover:bg-indigo-500">
            Launch
          </button>
        </div>
      `;
      app.appendChild(el);

      document.getElementById("launch-via")!.addEventListener("click", () => {
        const toggle = document.getElementById("viagen-toggle") as HTMLButtonElement | null;
        if (toggle) toggle.click();
      });
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
      `;
      app.appendChild(el);
    }
  });
