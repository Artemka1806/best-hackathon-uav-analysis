import { Map } from 'lucide-react'
import { PageHeader } from './components/PageHeader'
import { TrajectoryScene } from './components/TrajectoryScene'

export default function TrajectoryPage() {
  return (
    <div className="w-full space-y-4 md:space-y-[18px]">
      <PageHeader icon={Map} title="Trajectory" />
      <TrajectoryScene />
    </div>
  )
}
