import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pwaPlugin } from './src/pwa/pwaPlugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pwaPlugin()],
  define: { global: "window" }
})
