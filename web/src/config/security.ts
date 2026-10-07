/**
 * Content-Security-Policy for the built site, written into index.html as a <meta> (so it holds on every host:
 * Vercel, Cloudflare, GitHub Pages). Only this site's own scripts run (no inline or injected script, no eval); data
 * goes only to this site and its own Supabase project; the page cannot be framed (frame-ancestors is sent as an HTTP
 * header by vercel.json / public/_headers, since a <meta> cannot carry it).
 */
export function contentSecurityPolicy(supabaseUrl?: string): string {
  let supabase = ''
  try { if (supabaseUrl) { const u = new URL(supabaseUrl); supabase = ` ${u.origin} wss://${u.host}` } } catch { /* not configured: local mode */ }
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React style attributes and the team colour <style> need inline styles; fonts come from Google Fonts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self'${supabase}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}
