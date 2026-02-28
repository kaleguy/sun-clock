import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? '/sun-clock/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
