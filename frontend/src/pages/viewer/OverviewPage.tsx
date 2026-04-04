import { Gauge } from 'lucide-react'
import { MessagesPanel } from './components/MessagesPanel'
import { MetricsPanel } from './components/MetricsPanel'
import { PageHeader } from './components/PageHeader'
import { StatusBanner } from './components/StatusBanner'
import { UploadControls } from './components/UploadControls'
import { WarningsPanel } from './components/WarningsPanel'

export default function OverviewPage() {
  return (
    <div className="w-full space-y-4 md:space-y-[18px]">
      <PageHeader icon={Gauge} title="Mission Overview" />

      <section className="grid items-start gap-4 md:gap-[18px] xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <div className="min-w-0 space-y-4 md:space-y-[18px]">
          <UploadControls />
          <MetricsPanel />
        </div>

        <div className="min-w-0 space-y-4 md:space-y-[18px]">
          <StatusBanner />
          <MessagesPanel />
          <WarningsPanel />
        </div>
      </section>
    </div>
  )
}
