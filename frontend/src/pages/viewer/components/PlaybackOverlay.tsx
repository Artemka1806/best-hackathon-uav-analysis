import { CirclePlay } from 'lucide-react'

const playbackFacts = [
  { label: 'Current sample', value: 'T+06:32' },
  { label: 'Altitude', value: '248.4 m' },
  { label: 'Speed', value: '18.7 m/s' },
] as const

export function PlaybackOverlay() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row">
      <div className="viewer-panel viewer-section-card min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <CirclePlay className="h-4 w-4 text-primary" />
          <span className="viewer-tiny-label">Playback</span>
        </div>
        <input
          className="w-full accent-[color:var(--viewer-accent)]"
          type="range"
          min="0"
          max="100"
          defaultValue="38"
          readOnly
        />
        <div className="mt-2 text-xs viewer-muted-text">Mock playback UI. Binding comes later.</div>
      </div>

      <div className="viewer-panel viewer-section-card min-w-0 md:w-[260px]">
        <div className="mb-2 viewer-tiny-label">Current Sample</div>
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
          {playbackFacts.map((fact) => (
            <div key={fact.label}>
              <div className="text-[11px] viewer-muted-text">{fact.label}</div>
              <div className="text-sm font-medium">{fact.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
