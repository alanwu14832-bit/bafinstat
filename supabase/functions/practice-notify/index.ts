// Practice reminders. Called by the nightly GitHub Action at 18:00 Taipei (x-cron-secret) to push "明天練球" to
// everyone subscribed, and by editors from the site (their JWT) to resend or to announce a cancellation.
// Deploy: supabase functions deploy practice-notify
// Secrets: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' } })

const taipei = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204)
  const admin = createClient(URL, SERVICE)
  // who is calling: the cron job (shared secret) or a signed-in editor
  let allowed = false
  const secret = req.headers.get('x-cron-secret')
  if (secret && secret === Deno.env.get('CRON_SECRET')) allowed = true
  const auth = req.headers.get('authorization')
  if (!allowed && auth) {
    const asUser = createClient(URL, ANON, { global: { headers: { Authorization: auth } } })
    const { data } = await asUser.rpc('is_editor')
    allowed = data === true
  }
  if (!allowed) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({})) as { practice_id?: string; kind?: 'notify' | 'cancelled' | 'reminder' }
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:baseball.ntuba@gmail.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

  // keep eight weeks of dated rows ahead of today
  await admin.rpc('generate_practices', { until: addDays(taipei(), 56) })

  let targets: Array<Record<string, unknown>> = []
  const kind = body.kind ?? 'notify'
  if (body.practice_id) {
    const { data } = await admin.from('practices').select('*').eq('id', body.practice_id).limit(1)
    targets = data ?? []
  } else {
    const { data } = await admin.from('practices').select('*').eq('date', addDays(taipei(), 1)).eq('status', 'scheduled').is('notified_at', null)
    targets = data ?? []
  }
  if (!targets.length) return json({ sent: 0, failed: 0, practices: 0 })

  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, subscription')
  let sent = 0, failed = 0
  const dead: string[] = []
  for (const p of targets) {
    const date = String(p.date), when = `${date.slice(5).replace('-', '/')}（${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}）${p.time}`
    const place = p.place ? `・${p.place}` : ''
    const payload = kind === 'cancelled'
      ? { title: '練球取消', body: `${when}${place} 的練球取消了。`, tag: `practice-${p.id}`, url: '/practice' }
      : kind === 'reminder'
        ? { title: '還沒回覆練球', body: `${when}${place}，點開回覆出席／小遲／請假。`, tag: `practice-${p.id}`, url: '/practice' }
        : { title: '明天練球', body: `${when}${place}，你會來嗎？點開回覆。`, tag: `practice-${p.id}`, url: '/practice' }
    for (const s of subs ?? []) {
      try { await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 60 * 60 * 15 }); sent++ }
      catch (e) { failed++; const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) dead.push(s.endpoint) }
    }
    if (kind === 'notify') await admin.from('practices').update({ notified_at: new Date().toISOString() }).eq('id', p.id)
    await admin.from('notification_log').insert({ practice_id: p.id, kind, sent, failed })
  }
  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead)
  return json({ sent, failed, practices: targets.length })
})
