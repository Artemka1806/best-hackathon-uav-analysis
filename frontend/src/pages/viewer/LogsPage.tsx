import { FileWarning, ListFilter, MessageSquare } from 'lucide-react'
import { PageHeader } from './components/PageHeader'
import { DataTableCard } from './components/DataTableCard'

const logInventoryRows = [
  ['GPS', '1,294', 'Position, speed, and altitude'],
  ['IMU', '3,871', 'Acceleration and gyroscope stream'],
  ['ATT', '1,742', 'Attitude samples'],
  ['BARO', '816', 'Pressure altitude'],
  ['PARM', '224', 'Flight controller configuration'],
] as const

const logEventRows = [
  ['Sample sync', 'GPS + IMU aligned', 'Normal'],
  ['Warnings', '3 active windows', 'Review'],
  ['Anomaly review', 'Final approach segment', 'Pending'],
  ['Parsed payload', 'Metrics, logs, AI context', 'Ready'],
] as const

const logPreviewRows = [
  {
    time: '00:06:31.200',
    position: '49.842013 / 24.031115',
    altitude: '248.4 m',
    attitude: '2.1° / -1.8° / 83.4°',
  },
  {
    time: '00:06:31.300',
    position: '49.842029 / 24.031188',
    altitude: '248.9 m',
    attitude: '2.4° / -1.7° / 84.0°',
  },
  {
    time: '00:06:31.400',
    position: '49.842051 / 24.031253',
    altitude: '249.3 m',
    attitude: '2.6° / -1.5° / 84.8°',
  },
  {
    time: '00:06:31.500',
    position: '49.842072 / 24.031330',
    altitude: '249.8 m',
    attitude: '2.8° / -1.2° / 85.6°',
  },
  {
    time: '00:06:31.600',
    position: '49.842094 / 24.031404',
    altitude: '250.0 m',
    attitude: '3.0° / -1.1° / 86.2°',
  },
] as const

export default function LogsPage() {
  const inventoryRows = logInventoryRows.map((row) => ({
    id: row[0],
    cells: [...row],
  }))

  const eventRows = logEventRows.map((row) => ({
    id: row[0],
    cells: [...row],
  }))

  return (
    <div className="w-full space-y-4 md:space-y-[18px]">
      <PageHeader icon={MessageSquare} title="Raw Logs" />

      <section className="grid gap-4 md:gap-[18px] xl:grid-cols-2">
        <DataTableCard
          icon={ListFilter}
          title="Parsed Message Inventory"
          columns={['Type', 'Count', 'Description']}
          rows={inventoryRows}
        />

        <DataTableCard
          icon={FileWarning}
          title="Events and Parsing Watchlist"
          columns={['Check', 'Status', 'Stage']}
          rows={eventRows}
        />
      </section>

      <article className="viewer-panel viewer-section-card min-w-0">
        <div className="viewer-section-header">
          <MessageSquare className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <div className="viewer-tiny-label">Data Section</div>
            <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">
              Sample Rows
            </h2>
          </div>
        </div>

        <div className="mb-4 flex min-w-0 flex-wrap gap-2">
          <span className="viewer-pill">offset: 0</span>
          <span className="viewer-pill">limit: 100</span>
          <span className="viewer-pill">preview rows: 5</span>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {logPreviewRows.map((row) => (
            <article
              key={row.time}
              className="viewer-soft-block min-w-0 rounded-[14px] p-4"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="viewer-tiny-label">Log sample</div>
                <div className="text-sm font-semibold">{row.time}</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="min-w-0 sm:col-span-2">
                  <div className="viewer-tiny-label">Coordinates</div>
                  <div className="mt-1 break-words text-sm leading-6">{row.position}</div>
                </div>

                <div className="min-w-0">
                  <div className="viewer-tiny-label">Altitude</div>
                  <div className="mt-1 text-sm font-medium">{row.altitude}</div>
                </div>

                <div className="min-w-0 sm:col-span-3">
                  <div className="viewer-tiny-label">Attitude</div>
                  <div className="mt-1 break-words text-sm leading-6">{row.attitude}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </article>
    </div>
  )
}
