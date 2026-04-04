import { Compass, MapPinned } from 'lucide-react'

const trajectoryMapLabels = [
  { label: 'Takeoff', top: '69%', left: '16%' },
  { label: 'Cruise arc', top: '39%', left: '42%' },
  { label: 'Landing corridor', top: '22%', left: '73%' },
] as const

export function TrajectoryMapCanvas() {
  return (
    <div className="relative h-[420px] min-w-0 overflow-hidden rounded-[18px] bg-[#08131a] md:h-[560px] xl:h-[680px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(107,227,255,0.22),transparent_18%),radial-gradient(circle_at_74%_28%,rgba(244,201,93,0.18),transparent_18%),radial-gradient(circle_at_46%_74%,rgba(53,122,146,0.26),transparent_24%),linear-gradient(180deg,#11222c_0%,#09131a_100%)]" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      <svg
        viewBox="0 0 1400 900"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="mock-trajectory-stroke" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#6be3ff" />
            <stop offset="52%" stopColor="#f4c95d" />
            <stop offset="100%" stopColor="#69d29d" />
          </linearGradient>
        </defs>
        <path
          d="M120 650 C 240 620, 300 520, 410 420 S 635 170, 790 220 S 980 470, 1130 360 S 1270 210, 1330 150"
          fill="none"
          opacity="0.95"
          stroke="url(#mock-trajectory-stroke)"
          strokeLinecap="round"
          strokeWidth="14"
        />
        <circle cx="120" cy="650" r="18" fill="#6be3ff" />
        <circle cx="1330" cy="150" r="18" fill="#69d29d" />
      </svg>

      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(8,16,22,0.68)] px-3 py-2 text-sm text-white/92 backdrop-blur-md md:left-[18px] md:top-[18px]">
        <MapPinned className="h-4 w-4 text-[#f4c95d]" />
        <span>3D trajectory viewport</span>
      </div>

      <div className="absolute bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[rgba(8,16,22,0.72)] text-white/90 backdrop-blur-md">
        <Compass className="h-5 w-5" />
      </div>

      {trajectoryMapLabels.map((item) => (
        <div
          key={item.label}
          className="absolute rounded-full border border-white/10 bg-[rgba(8,16,22,0.68)] px-3 py-1.5 text-xs text-white/82 backdrop-blur-md"
          style={{ left: item.left, top: item.top }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}
