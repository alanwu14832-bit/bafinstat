/**
 * Content-Security-Policy for the built site, written into index.html as a <meta> (so it holds on every host:
 * Vercel, Cloudflare, GitHub Pages). Only this site's own scripts run (no inline or injected script, no eval); data
 * goes only to this site and its own Supabase project; the page cannot be framed (frame-ancestors is sent as an HTTP
 * header by vercel.json / public/_headers, since a <meta> cannot carry it).
 * 限時動態's 自動去背 runs in a module worker (lib/cutout.worker.ts, served from this site): a <meta> policy does not
 * reach a worker, which loads ONNX Runtime's WebAssembly from jsDelivr (the exact version in package.json) and the
 * model from Hugging Face (one pinned revision). The photo itself never leaves the device.
 */
export function contentSecurityPolicy(supabaseUrl?: string): string {
  let supabase = ''
  try { if (supabaseUrl) { const u = new URL(supabaseUrl); supabase = ` ${u.origin} wss://${u.host}` } } catch { /* not configured: local mode */ }
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React style attributes and the team colour <style> need inline styles; fonts come from Google Fonts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // (cdn.jsdelivr.net: 王漢宗顏楷體 for the 限動 / 先發陣容 cards, pinned to one commit of this repo's fonts/ — lib/storyFonts.ts)
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
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
