import { Waypoints } from 'lucide-react'

interface MessagesPanelProps {
  title?: string
}

const messageBadges = [
  { name: 'GPS', count: 1294 },
  { name: 'IMU', count: 3871 },
  { name: 'ATT', count: 1742 },
  { name: 'BARO', count: 816 },
  { name: 'PARM', count: 224 },
] as const

const telemetryRows = [
  {
    stream: 'GPS',
    frequency: '10 Hz',
    result: 'Track, ground speed, and altitude derived from the global fix stream.',
  },
  {
    stream: 'IMU',
    frequency: '100 Hz',
    result: 'Acceleration, gyroscope, and derived load spikes for maneuver analysis.',
  },
  {
    stream: 'ATT',
    frequency: 'Synchronized',
    result: 'Roll, pitch, and heading aligned into a single event context.',
  },
  {
    stream: 'Derived',
    frequency: '6 metrics',
    result: 'Distance, speed, climb, acceleration, and key anomaly windows.',
  },
] as const

export function MessagesPanel({
  title = 'GPS / IMU Sampling and Derived Metrics',
}: MessagesPanelProps) {
  return (
    <section className="viewer-panel viewer-section-card">
      <div className="viewer-section-header">
        <Waypoints className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="viewer-tiny-label">Data Section</div>
          <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">{title}</h2>
        </div>
      </div>

      <div className="mb-4 flex min-w-0 flex-wrap gap-2">
        {messageBadges.map((message) => (
          <span key={message.name} className="viewer-pill">
            {message.name}
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px]">
              {message.count}
            </span>
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {telemetryRows.map((row) => (
          <article key={row.stream} className="viewer-soft-block min-w-0 p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="viewer-tiny-label">Stream</div>
                <div className="mt-1 break-words text-sm font-semibold">{row.stream}</div>
              </div>

              <div className="min-w-0">
                <div className="viewer-tiny-label">Frequency</div>
                <div className="mt-1">
                  <span className="viewer-pill">{row.frequency}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 min-w-0">
              <div className="viewer-tiny-label">Derived Output</div>
              <div className="mt-1 break-words text-sm leading-6">{row.result}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
