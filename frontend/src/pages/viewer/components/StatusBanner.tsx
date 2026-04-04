import { Info } from 'lucide-react'

export function StatusBanner() {
  return (
    <section className="viewer-panel viewer-section-card">
      <div className="viewer-section-header">
        <Info className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <div className="viewer-tiny-label">Pipeline Status</div>
          <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">
            Current Analysis State
          </h2>
        </div>
      </div>
      <div className="viewer-status viewer-status-info min-w-0 break-words">
        Select a `.BIN` file to start the analysis.
      </div>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
        <div className="min-w-0 rounded-[12px] border border-[color:var(--viewer-border)] p-3">
          <div className="viewer-tiny-label">Parsing</div>
          <div className="mt-2 break-words font-medium">Waiting for upload</div>
        </div>
        <div className="min-w-0 rounded-[12px] border border-[color:var(--viewer-border)] p-3">
          <div className="viewer-tiny-label">3D Scene</div>
          <div className="mt-2 break-words font-medium">Shell ready</div>
        </div>
        <div className="min-w-0 rounded-[12px] border border-[color:var(--viewer-border)] p-3">
          <div className="viewer-tiny-label">AI Debrief</div>
          <div className="mt-2 break-words font-medium">Waiting for analysis</div>
        </div>
      </div>
    </section>
  )
}
