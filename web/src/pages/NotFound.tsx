import { Compass } from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon={<Compass />} title="找不到這個頁面" description="網址可能已變更或不存在。" action={<Button variant="primary" to="/">回到總覽</Button>} />
    </Card>
  )
}
