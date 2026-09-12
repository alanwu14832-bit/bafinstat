/** Web Push subscription for practice reminders. iPhone needs the site installed to the Home Screen first. */
import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
export const pushConfigured = !!VAPID
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
/** iPhone Safari only exposes push to installed web apps. */
export const needsInstall = () => isIOS() && !isStandalone()

function toKey(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function subscribePush(playerName: string | null): Promise<void> {
  if (!pushSupported() || !VAPID) throw new Error('這個瀏覽器不支援推播')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('沒有允許通知，請到瀏覽器設定開啟')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID) as BufferSource }))
  const { data: { user } } = await supabase().auth.getUser()
  if (!user) throw new Error('請先登入')
  const { error } = await supabase().from('push_subscriptions').upsert({ endpoint: sub.endpoint, user_id: user.id, player_name: playerName, subscription: sub.toJSON() }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function unsubscribePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase().from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
