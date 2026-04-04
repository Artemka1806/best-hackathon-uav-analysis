import { Bot, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AiDebriefPanelProps {
  suggestedPrompts: readonly string[]
}

const aiMessages = [
  {
    role: 'assistant',
    title: 'Initial debrief',
    text: 'The flight remained stable during the cruise segment. The main risk is a short descent spike in the last third of the mission together with elevated pitch oscillation.',
  },
  {
    role: 'user',
    title: 'Operator question',
    text: 'Show the likely cause of the altitude drop and whether it overlaps with the acceleration spike.',
  },
  {
    role: 'assistant',
    title: 'Follow-up answer',
    text: 'The current layout reserves space for streaming answers from the backend WebSocket route. Final binding will plug the real stream into this block later.',
  },
] as const

export function AiDebriefPanel({ suggestedPrompts }: AiDebriefPanelProps) {
  return (
    <details className="viewer-accordion min-w-0" open>
      <summary>
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          AI Flight Debrief
        </span>
        <span className="viewer-muted-text">Preview</span>
      </summary>

      <div className="viewer-accordion-body">
        <div className="font-mono text-xs viewer-muted-text">The AI stream is currently mocked while the layout is being finalized.</div>

        <div className="space-y-3">
          {aiMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className="rounded-[12px] border p-3"
              style={{
                borderColor:
                  message.role === 'user'
                    ? 'color-mix(in srgb, var(--viewer-accent) 25%, transparent)'
                    : 'var(--viewer-border)',
                background:
                  message.role === 'user'
                    ? 'color-mix(in srgb, var(--viewer-accent) 10%, transparent)'
                    : 'color-mix(in srgb, var(--viewer-text) 4%, transparent)',
              }}
            >
              <div className="viewer-tiny-label">{message.title}</div>
              <div className="mt-2 text-sm leading-6">{message.text}</div>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <span key={prompt} className="viewer-pill">
              {prompt}
            </span>
          ))}
        </div>

        <div className="space-y-2">
          <div className="relative">
            <MessageSquare className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <textarea
              className="viewer-field min-h-[96px] w-full resize-y pl-10 pr-3 py-3 text-sm outline-none"
              placeholder="Ask a follow-up question about the flight analysis..."
              disabled
            />
          </div>
          <Button
            className="min-h-[48px] w-full rounded-xl border border-[color:var(--viewer-border)] bg-transparent px-4 py-3 text-center leading-tight text-foreground whitespace-normal hover:bg-white/10"
            disabled
          >
            Send Prompt
          </Button>
        </div>
      </div>
    </details>
  )
}
