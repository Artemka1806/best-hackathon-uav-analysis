import { Clock3, Gauge, Radar } from 'lucide-react'

const trajectoryModes = [
  { label: 'Speed', active: true },
  { label: 'Time', active: false },
] as const

const trajectoryFacts = [
  { label: 'Coordinate system', value: 'WGS-84 -> ENU' },
  { label: 'Path segments', value: '1,842' },
  { label: 'Takeoff origin', value: '49.842 / 24.031' },
  { label: 'Playback mode', value: 'Time-indexed' },
] as const

export function TrajectoryScenePanel() {
  return (
    <div className="viewer-panel viewer-section-card">
      <div className="viewer-tiny-label">Map Controls</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">Scene Overview</h2>

      <div className="mt-3 flex gap-2">
        {trajectoryModes.map((mode) => (
          <button
            key={mode.label}
            type="button"
            className={
              mode.active
                ? 'flex-1 rounded-xl border border-primary bg-primary/15 px-3 py-2 text-sm text-foreground'
                : 'flex-1 rounded-xl border border-[color:var(--viewer-border)] bg-transparent px-3 py-2 text-sm viewer-muted-text'
            }
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-[color:var(--viewer-border)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--viewer-accent-2)]" />
            <span className="viewer-tiny-label">{trajectoryFacts[1].label}</span>
          </div>
          <div className="text-lg font-semibold">{trajectoryFacts[1].value}</div>
        </div>

        <div className="rounded-[12px] border border-[color:var(--viewer-border)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-[var(--viewer-accent)]" />
            <span className="viewer-tiny-label">{trajectoryFacts[3].label}</span>
          </div>
          <div className="text-sm font-medium">{trajectoryFacts[3].value}</div>
        </div>

        <div className="rounded-[12px] border border-[color:var(--viewer-border)] p-3 sm:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            <span className="viewer-tiny-label">{trajectoryFacts[2].label}</span>
          </div>
          <div className="text-sm font-medium">{trajectoryFacts[2].value}</div>
        </div>
      </div>
    </div>
  )
}
