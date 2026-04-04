import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import { ROUTES } from '@/constants/routes'
import NotFoundPage from '@/pages/NotFoundPage'
import ChartsPage from '@/pages/viewer/ChartsPage'
import DebriefPage from '@/pages/viewer/DebriefPage'
import LogsPage from '@/pages/viewer/LogsPage'
import OverviewPage from '@/pages/viewer/OverviewPage'
import TrajectoryPage from '@/pages/viewer/TrajectoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to={ROUTES.overview} replace />} />
          <Route path={ROUTES.overview} element={<OverviewPage />} />
          <Route path={ROUTES.trajectory} element={<TrajectoryPage />} />
          <Route path={ROUTES.charts} element={<ChartsPage />} />
          <Route path={ROUTES.debrief} element={<DebriefPage />} />
          <Route path={ROUTES.logs} element={<LogsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
