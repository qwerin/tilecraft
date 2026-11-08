/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // Musí být před react(): generuje src/routeTree.gen.ts a dělí routy do chunků.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Instalace na plochu (PWA). Service worker drží jen samotnou aplikaci, API se nikdy necachuje.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registruje src/lib/app-update.ts (načtení nové verze bez ztráty formuláře)
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'theme-init.js'],
      manifest: {
        name: 'TileCraft',
        short_name: 'TileCraft',
        description: 'Nabídky, zakázky a faktury pro obkladače',
        lang: 'cs',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0a3537',
        background_color: '#fcf8f3',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // nové vydání převezme i otevřená okna hned (bez toho čekalo, až se zavřou všechna okna aplikace)
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:8080' },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
