import { cn } from '@/lib/utils'

const BRANCHES = [
  {
    code: '429',
    label: 'Rate limited',
    action: 'Wait until X-RateLimit-Reset',
    detail: 'Retry once after the reset timestamp in the response header.',
    tone: 'amber',
  },
  {
    code: '5xx',
    label: 'Server error',
    action: 'Exponential backoff — retry up to 3×',
    detail: '1 s → 2 s → 4 s. Stop after 3 attempts and surface the error.',
    tone: 'amber',
  },
  {
    code: '422',
    label: 'Validation error',
    action: 'Do not retry',
    detail: 'The payload is invalid. Fix the field named in the error response.',
    tone: 'red',
  },
  {
    code: '401 / 403',
    label: 'Auth error',
    action: 'Do not retry',
    detail: 'Check your API key and customer_id. Contact support if correct.',
    tone: 'red',
  },
] as const

const TONE = {
  amber: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    badge: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  },
  red: {
    border: 'border-destructive/30',
    bg: 'bg-destructive/5',
    badge: 'bg-destructive/10 text-destructive',
  },
}

export function RetryDecisionTree() {
  return (
    <div className="space-y-3">
      {/* Root node */}
      <div className="flex justify-center">
        <div className="rounded-lg border-2 border-foreground/20 bg-muted px-6 py-3 text-center font-semibold text-foreground">
          Request failed?
        </div>
      </div>

      {/* Connector */}
      <div className="flex justify-center">
        <div className="h-4 w-px bg-border" aria-hidden />
      </div>

      {/* Branches */}
      <div className="grid gap-3 sm:grid-cols-2">
        {BRANCHES.map((branch) => {
          const t = TONE[branch.tone]
          return (
            <div
              key={branch.code}
              className={cn('rounded-xl border p-4', t.border, t.bg)}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 font-mono text-[11px] font-bold',
                    t.badge
                  )}
                >
                  {branch.code}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{branch.label}</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{branch.action}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{branch.detail}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
