import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="viewer-panel max-w-md p-6 text-center">
        <div className="viewer-tiny-label">404</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm leading-6 viewer-muted-text">
          This route does not exist in the current viewer shell.
        </p>
        <Button asChild className="mt-6 rounded-xl">
          <Link to={ROUTES.overview}>Go to Overview</Link>
        </Button>
      </div>
    </div>
  )
}
