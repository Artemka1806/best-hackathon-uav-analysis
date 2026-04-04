import type { CSSProperties } from 'react'

const chartHighlights = [
  { label: 'Visible series', value: '3' },
  { label: 'Points after downsample', value: 'up to 240' },
  { label: 'Sample sync', value: 'GPS + IMU' },
] as const

const chartCards = [
  {
    title: 'Altitude over Time',
    description: 'Relative altitude profile with takeoff, cruise, and final descent phases.',
    points: [18, 24, 31, 40, 49, 52, 50, 47, 44, 38, 29, 18],
    color: 'var(--chart-3)',
    fill: 'color-mix(in srgb, var(--chart-3) 18%, transparent)',
    legend: ['Altitude', 'Climb profile'],
  },
  {
    title: 'Integrated Speed',
    description: 'Horizontal and vertical speed bands for comparison across mission phases.',
    points: [12, 16, 19, 24, 23, 28, 31, 29, 26, 21, 18, 15],
    color: 'var(--chart-4)',
    fill: 'color-mix(in srgb, var(--chart-4) 18%, transparent)',
    legend: ['Horizontal', 'Vertical'],
  },
  {
    title: 'Acceleration',
    description: 'Acceleration peaks and smoothing windows on a dedicated analysis track.',
    points: [8, 11, 10, 16, 13, 22, 18, 15, 17, 12, 9, 7],
    color: 'var(--chart-5)',
    fill: 'color-mix(in srgb, var(--chart-5) 18%, transparent)',
    legend: ['Acceleration', 'Peak window'],
  },
] as const

function buildPath(points: readonly number[]) {
  const width = 320
  const height = 180
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = Math.max(max - min, 1)

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      const y = height - ((point - min) / range) * (height - 28) - 14
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export function FlightCharts() {
  return (
    <div className="space-y-4 md:space-y-[18px]">
      <section className="grid gap-4 md:grid-cols-3">
        {chartHighlights.map((item) => (
          <article key={item.label} className="viewer-panel viewer-section-card">
            <div className="viewer-tiny-label">{item.label}</div>
            <div className="mt-2 text-lg font-semibold">{item.value}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:gap-[18px] lg:grid-cols-3">
        {chartCards.map((chart) => (
          <article
            key={chart.title}
            className="viewer-panel viewer-section-card flex min-h-[280px] min-w-0 flex-col"
          >
            <div className="mb-3 flex min-w-0 items-center gap-2">
              <div
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ background: chart.color } as CSSProperties}
              />
              <span className="truncate viewer-tiny-label">{chart.title}</span>
            </div>
            <div className="mb-4 text-sm viewer-muted-text">
              {chart.description}
            </div>
            <div className="viewer-placeholder flex min-h-[220px] min-w-0 flex-1 flex-col justify-between p-3">
              <svg viewBox="0 0 320 180" className="h-[180px] w-full min-w-0">
                <defs>
                  <linearGradient id={`fill-${chart.title}`} x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor={chart.fill} />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path
                  d={`${buildPath(chart.points)} L 320 180 L 0 180 Z`}
                  fill={`url(#fill-${chart.title})`}
                  opacity="0.9"
                />
                <path
                  d={buildPath(chart.points)}
                  fill="none"
                  stroke={chart.color}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                {chart.legend.map((label) => (
                  <span key={label} className="viewer-pill">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
