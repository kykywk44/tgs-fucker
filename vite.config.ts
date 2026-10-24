import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import { remote } from './server/remote.ts'
import { isRuntimeData } from './server/runtime-files.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env without the VITE_ prefix: read here on the server only, never shipped to the page.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Password for the Cloudflare tunnel and the «В Telegram» API (server/remote.ts).
      remote({
        root: process.cwd(),
        password: env.SITE_PASSWORD ?? '',
        botToken: env.BOT_CONTROL_TOKEN ?? '',
        botPort: Number(env.BOT_CONTROL_PORT || 8790),
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      watch: { ignored: (file) => isRuntimeData(process.cwd(), file) },
      // The phone reaches the dev server through a quick Cloudflare tunnel (*.trycloudflare.com).
      allowedHosts: ['.trycloudflare.com'],
    },
    build: {
      // The editor (React, Base UI, framer-motion) is one ~680 kB local-tool chunk;
      // splitting it buys nothing here, so the default 500 kB warning is raised to keep builds quiet.
      chunkSizeWarningLimit: 800,
    },
    test: {
      // Agent worktrees live under .claude/worktrees/; their tests must not run in this checkout's gate.
      exclude: [...configDefaults.exclude, '.claude/**'],
    },
  }
})
