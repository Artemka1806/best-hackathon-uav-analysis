import type { ElementType } from 'react'

interface PageHeaderProps {
  icon: ElementType
  title: string
}

export function PageHeader({ icon: Icon, title }: PageHeaderProps) {
  return (
    <section className="viewer-panel min-w-0 px-4 py-3 md:px-5 md:py-4">
      <div className="flex min-h-[44px] min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight md:text-2xl">
          {title}
        </h1>
      </div>
    </section>
  )
}
