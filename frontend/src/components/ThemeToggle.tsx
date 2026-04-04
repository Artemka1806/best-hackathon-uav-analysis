import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const nextThemeLabel = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        'viewer-field h-10 w-10 shrink-0 border-0 bg-transparent hover:bg-white/10',
        className,
      )}
      aria-label={`Switch to ${nextThemeLabel} theme`}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  )
}
