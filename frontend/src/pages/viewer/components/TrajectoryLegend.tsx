const trajectoryLegend = [
  { label: 'Color by speed', color: 'var(--viewer-accent-2)' },
  { label: 'Color by time', color: 'var(--viewer-accent)' },
  { label: 'Aircraft marker', color: 'var(--viewer-ok)' },
] as const

export function TrajectoryLegend() {
  return (
    <article className="viewer-panel viewer-section-card">
      <div className="viewer-tiny-label">Map Legend</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">Trajectory Color Guide</h2>
      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        {trajectoryLegend.map((item) => (
          <span
            key={item.label}
            className="viewer-pill"
            style={{ borderColor: item.color }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </article>
  )
}
