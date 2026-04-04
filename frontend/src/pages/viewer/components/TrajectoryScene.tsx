import { PlaybackOverlay } from './PlaybackOverlay'
import { TrajectoryLegend } from './TrajectoryLegend'
import { TrajectoryMapCanvas } from './TrajectoryMapCanvas'
import { TrajectoryScenePanel } from './TrajectoryScenePanel'

export function TrajectoryScene() {
  return (
    <section className="space-y-4 md:space-y-[18px]">
      <div className="viewer-panel overflow-hidden p-0">
        <TrajectoryMapCanvas />
      </div>

      <div className="grid gap-4 md:gap-[18px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <PlaybackOverlay />
        </div>

        <div className="min-w-0 space-y-4 md:space-y-[18px]">
          <TrajectoryScenePanel />
          <TrajectoryLegend />
        </div>
      </div>
    </section>
  )
}
