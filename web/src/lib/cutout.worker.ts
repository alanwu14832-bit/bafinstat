/// <reference lib="webworker" />
/**
 * 自動去背, off the page's thread: the IS-Net model (general subject segmentation, MIT-licensed int8 build) run by ONNX
 * Runtime Web on this device. The photo never leaves the device; the only downloads are the runtime (jsDelivr, the exact
 * version this site was built with) and the model (Hugging Face, pinned to one revision), kept in the browser's cache
 * afterwards. The page posts a 1024 × 1024 RGBA picture; the worker answers with a 1024 × 1024 alpha mask.
 */
import * as ort from 'onnxruntime-web/wasm'

const SIZE = 1024
const MODEL_URL = 'https://huggingface.co/xrds/isnet-general-onnx-int8/resolve/71eff2372ec9c8edbc6ca637ded591423d23b65a/onnx/model_quantized.onnx'
const CACHE = 'bafin-cutout-v1'

export type CutoutRequest = { id: number; rgba: Uint8ClampedArray }
export type CutoutReply =
  | { id: number; type: 'progress'; stage: 'download' | 'prepare' | 'run'; loaded?: number; total?: number }
  | { id: number; type: 'done'; mask: Float32Array }
  | { id: number; type: 'error'; message: string }

const post = (m: CutoutReply, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

/** The model's bytes: from the browser's cache when it was fetched before, else downloaded with progress. */
async function modelBytes(id: number): Promise<ArrayBuffer> {
  let cache: Cache | null = null
  try { cache = await caches.open(CACHE); const hit = await cache.match(MODEL_URL); if (hit) return await hit.arrayBuffer() } catch { cache = null }
  const res = await fetch(MODEL_URL)
  if (!res.ok || !res.body) throw new Error(`下載去背工具失敗（${res.status}）`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader(), parts: Uint8Array[] = []
  let loaded = 0, last = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value); loaded += value.length
    if (loaded - last > 512 * 1024) { last = loaded; post({ id, type: 'progress', stage: 'download', loaded, total }) }
  }
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const p of parts) { bytes.set(p, at); at += p.length }
  try { await cache?.put(MODEL_URL, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })) } catch { /* no room: fetched again next time */ }
  return bytes.buffer
}

let session: Promise<ort.InferenceSession> | null = null
function open(id: number): Promise<ort.InferenceSession> {
  if (!session) {
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`
    ort.env.wasm.numThreads = 1
    session = modelBytes(id).then((b) => { post({ id, type: 'progress', stage: 'prepare' }); return ort.InferenceSession.create(b, { executionProviders: ['wasm'] }) })
    session.catch(() => { session = null })
  }
  return session
}

self.onmessage = async (e: MessageEvent<CutoutRequest>) => {
  const { id, rgba } = e.data
  try {
    const s = await open(id)
    post({ id, type: 'progress', stage: 'run' })
    // IS-Net's input: RGB planes, (value − 128) / 256
    const n = SIZE * SIZE, f = new Float32Array(3 * n)
    for (let i = 0; i < n; i++) { f[i] = (rgba[i * 4] - 128) / 256; f[n + i] = (rgba[i * 4 + 1] - 128) / 256; f[2 * n + i] = (rgba[i * 4 + 2] - 128) / 256 }
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, SIZE, SIZE]) })
    const mask = Float32Array.from(out[s.outputNames[0]].data as Float32Array)
    post({ id, type: 'done', mask }, [mask.buffer])
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
