/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { accentCss, assetUrl, resolveTeam, type TeamConfig } from './src/config/teamDefaults'
import { contentSecurityPolicy } from './src/config/security'

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * Puts this deployment's team (VITE_TEAM_*, see src/config/teamDefaults.ts) into the parts the app cannot
 * set itself: the page title and home-screen tags in index.html, and the web app manifest.
 */
function teamSite(): Plugin {
  let team: TeamConfig
  let base = '/'
  let supabaseUrl: string | undefined
  const manifest = () => JSON.stringify({
    name: team.org, short_name: team.short, lang: 'zh-TW', start_url: base, scope: base, display: 'standalone',
    background_color: '#f5f5f7', theme_color: '#f5f5f7',
    icons: [{ src: assetUrl(team.mark, base), sizes: 'any', type: 'image/png', purpose: 'any' }],
  }, null, 2)
  return {
    name: 'team-site',
    // A build-time constant, so a team that starts empty (VITE_TEAM_SEED=0) does not ship BaFiN's recorded
    // games in its bundle at all — not just hidden. src/data/seed.ts reads it.
    config(_, { mode }) {
      const seed = resolveTeam(loadEnv(mode, process.cwd(), 'VITE_')).seed
      return { define: { __TEAM_SEED__: JSON.stringify(seed) } }
    },
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_')
      team = resolveTeam(env)
      supabaseUrl = env.VITE_SUPABASE_URL
      base = config.base
    },
    transformIndexHtml: (html, ctx) => html
      // the built site only (the dev server needs inline scripts and its own websocket)
      .replace('<meta charset="UTF-8" />', ctx.server ? '<meta charset="UTF-8" />' : `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(contentSecurityPolicy(supabaseUrl))}" />`)
      .replaceAll('%TEAM_ORG%', escapeHtml(team.org))
      .replaceAll('%TEAM_SHORT%', escapeHtml(team.short))
      .replaceAll('%TEAM_MARK%', escapeHtml(assetUrl(team.mark, base)))
      .replaceAll('%BASE%', escapeHtml(base))
      .replace('</head>', `<style id="team-accent">${accentCss(team)}</style>\n  </head>`),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith('/manifest.webmanifest')) return next()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() })
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), teamSite()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
