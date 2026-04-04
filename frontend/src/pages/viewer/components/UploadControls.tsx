import { CloudUpload, Map, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const uploadHighlights = [
  'ArduPilot FC logs',
  'WGS-84 -> ENU',
  'Haversine distance',
  'Trapezoidal integration',
  'LLM debrief',
] as const

export function UploadControls() {
  return (
    <section className="viewer-panel viewer-section-card">
      <div className="viewer-section-header">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Map className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="viewer-tiny-label">Flight Intake</div>
          <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">
            Upload and Preview
          </h2>
        </div>
      </div>

      <div className="viewer-soft-block min-w-0 space-y-4 p-[14px]">
        <div className="space-y-2">
          <Label className="viewer-tiny-label" htmlFor="viewer-file">
            Flight Log (.BIN)
          </Label>
          <div className="relative">
            <CloudUpload className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="viewer-file"
              type="file"
              disabled
              className="viewer-field pl-10 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          {uploadHighlights.map((item) => (
            <span key={item} className="viewer-pill">
              {item}
            </span>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(224px,240px)] lg:items-end">
          <div className="min-w-0 space-y-2">
            <Label className="viewer-tiny-label" htmlFor="viewer-color-mode">
              Trajectory Color
            </Label>
            <div className="relative">
              <Palette className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                id="viewer-color-mode"
                className="viewer-field h-11 w-full pl-10 pr-3 text-sm shadow-none outline-none"
                defaultValue="speed"
                disabled
              >
                <option value="speed">Speed</option>
                <option value="time">Time</option>
              </select>
            </div>
          </div>

          <div className="flex min-w-0 items-end">
            <Button
              className="min-h-[52px] w-full rounded-xl border-0 bg-primary px-4 py-3 text-center text-sm leading-tight text-primary-foreground shadow-[var(--viewer-shadow)] whitespace-normal hover:bg-primary/90 lg:max-w-[240px]"
              disabled
            >
              Analyze Flight
            </Button>
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0 rounded-[12px] border border-[color:var(--viewer-border)] bg-[color:color-mix(in_srgb,var(--viewer-text)_3%,transparent)] p-3">
            <div className="viewer-tiny-label">Current File</div>
            <div className="mt-2 break-words font-medium">fc_mission_alpha.BIN</div>
            <div className="mt-1 break-words viewer-muted-text">1.9 MB · ArduPilot telemetry package</div>
          </div>
          <div className="min-w-0 rounded-[12px] border border-[color:var(--viewer-border)] bg-[color:color-mix(in_srgb,var(--viewer-text)_3%,transparent)] p-3">
            <div className="viewer-tiny-label">Expected Output</div>
            <div className="mt-2 break-words font-medium">3D path + metrics + AI debrief</div>
            <div className="mt-1 break-words viewer-muted-text">
              This is currently a design-only shell. Data binding will be added later.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
