import { IconBat } from '../components/icons/baseball'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon={<IconBat />} title="三振出局：找不到這個頁面" description="網址可能已變更或不存在。回本壘重新站上打擊區。" action={<Button variant="primary" to="/">回到總覽</Button>} />
    </Card>
  )
}
