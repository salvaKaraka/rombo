import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Rutas relativas para que `dist/` funcione abriendo index.html con doble clic,
  // sin necesidad de servidor.
  base: './',
  server: { open: true },
  test: {
    globals: true,
    // Los tests de dominio corren sin DOM, pero los de la UI montan la app
    // completa: jsdom para todos sale mas barato que dos proyectos.
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
