import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Bot, ChartColumn, Gauge, Map, Menu, MessageSquare, X } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: ROUTES.overview, icon: Gauge, label: 'Overview' },
  { to: ROUTES.trajectory, icon: Map, label: 'Trajectory' },
  { to: ROUTES.charts, icon: ChartColumn, label: 'Charts' },
  { to: ROUTES.debrief, icon: Bot, label: 'AI Debrief' },
  { to: ROUTES.logs, icon: MessageSquare, label: 'Logs' },
] as const

function SidebarContent({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col py-1">
      <div className="flex items-center gap-3.5 px-5 py-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-sm">
          <Map className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[1.05rem] font-semibold leading-tight tracking-tight">
            UAV Analysis
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground md:hidden"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-4 h-px bg-border/50" />

      <nav className="flex-1 space-y-1.5 px-3 py-5">
        <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/55">
          Workspace
        </p>
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) => cn('nav-item', isActive && 'active')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <header className="viewer-panel fixed left-1/2 top-3 z-40 flex h-14 w-[calc(100%-1.5rem)] max-w-[1440px] -translate-x-1/2 items-center justify-between px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Map className="h-4.5 w-4.5" />
          </div>
          <div className="text-sm font-bold leading-none tracking-tight">
            UAV Analysis
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />

            <motion.aside
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="viewer-panel fixed bottom-3 left-3 top-3 z-50 flex overflow-hidden md:hidden"
              style={{ width: 'min(86vw, var(--sidebar-width))' }}
            >
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-3 pb-3 pt-20 md:px-4 md:pb-4 md:pt-4 xl:px-5">
        <div className="md:grid md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] md:gap-6">
          <aside className="hidden md:block">
            <div className="sticky top-4">
              <div className="viewer-panel flex h-[calc(100vh-2rem)] overflow-hidden">
                <SidebarContent />
              </div>
            </div>
          </aside>

          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
