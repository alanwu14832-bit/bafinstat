import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// 修改資料 keeps unsaved changes on the device (components/ui/editDraft.ts): one test's must not greet the next one
afterEach(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('bafin.gameEdit.')) localStorage.removeItem(k) } catch { /* no storage */ } })

// jsdom lacks matchMedia and ResizeObserver; provide minimal stubs for components that use them.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom has no IntersectionObserver; whileInView reveals treat everything as visible.
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    cb: IntersectionObserverCallback
    constructor(cb: IntersectionObserverCallback) { this.cb = cb }
    observe(el: Element) { this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
    root = null
    rootMargin = ''
    thresholds = []
  } as unknown as typeof IntersectionObserver
}
