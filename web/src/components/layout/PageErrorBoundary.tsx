import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'

/**
 * A page whose file could not be downloaded (offline the first time, or the site was updated meanwhile and the old
 * file is gone) shows a way out instead of an empty screen. Changing page clears it.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey }
  static getDerivedStateFromError() { return { failed: true } }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="max-w-md flex flex-col gap-3 py-10">
        <div className="text-[16px] font-semibold text-ink">這一頁沒有載入成功</div>
        <p className="text-[13px] text-ink-2 leading-relaxed">可能是網路暫時斷了，或網站剛好更新。重新整理一次通常就好；紀錄比賽的進度存在這台裝置，不會不見。</p>
        <Button variant="primary" size="sm" icon={<RefreshCw />} onClick={() => window.location.reload()} className="self-start">重新整理</Button>
      </div>
    )
  }
}
