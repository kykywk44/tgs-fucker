import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['tlottie'],
  },
  test: {
    // Agent worktrees live under .claude/worktrees/; their tests must not run in this checkout's gate.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
