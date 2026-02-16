import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
  },
  {
    entry: ['src/webpack.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    esbuildOptions(opts) {
      opts.logOverride = { 'empty-import-meta': 'silent' };
    },
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
  },
])
