import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import browserslistToEsbuild from 'browserslist-to-esbuild'
import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const bunLinks = path.join(homedir(), '.bun/install/cache/links')

export default defineConfig({
  base: '/key-value-db/',
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react({ compiler: true }),
  ],
  server: {
    host: '127.0.0.1',
    port: 33477,
    strictPort: true,
    fs: {
      allow: [rootDir, bunLinks],
    },
  },
  build: {
    target: browserslistToEsbuild(),
  },
  define: {
    __BUILD_SHA__: JSON.stringify(process.env.VITE_BUILD_SHA ?? 'dev'),
  },
})
