import { Bot } from 'lucide-react'
import { AiDebriefPanel } from './components/AiDebriefPanel'
import { MessagesPanel } from './components/MessagesPanel'
import { PageHeader } from './components/PageHeader'
import { StatusBanner } from './components/StatusBanner'

const suggestedPrompts = [
  'Explain the altitude drop window',
  'Compare horizontal and vertical speed',
  'Show anomalous IMU spikes',
  'Summarize likely failure causes',
] as const

export default function DebriefPage() {
  return (
    <div className="w-full space-y-4 md:space-y-[18px]">
      <PageHeader icon={Bot} title="AI Debrief" />

      <section className="grid gap-4 md:gap-[18px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <AiDebriefPanel suggestedPrompts={suggestedPrompts} />
        </div>

        <div className="min-w-0 space-y-4 md:space-y-[18px]">
          <StatusBanner />

          <article className="viewer-panel viewer-section-card">
            <div className="viewer-tiny-label">Suggested prompts</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt) => (
                <span key={prompt} className="viewer-pill">
                  {prompt}
                </span>
              ))}
            </div>
          </article>
        </div>
      </section>

      <MessagesPanel title="Telemetry Context" />
    </div>
  )
}
