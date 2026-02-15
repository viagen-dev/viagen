import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { viagen } from '../src'

export default defineConfig({
  envDir: '..',
  plugins: [tailwindcss(), viagen()],
})
