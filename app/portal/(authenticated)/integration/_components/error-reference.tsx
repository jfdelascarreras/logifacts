import { cn } from '@/lib/utils'

const ERROR_CODES = [
  {
    code: '400',
    meaning: 'Bad request — malformed JSON body',
    retry: false,
    note: 'Fix the request format',
  },
  {
    code: '401',
    meaning: 'Invalid or missing API key',
    retry: false,
    note: 'Check Authorization header',
  },
  {
    code: '403',
    meaning: 'Account suspended or customer_id mismatch',
    retry: false,
    note: 'Contact support',
  },
  {
    code: '422',
    meaning: 'Validation error — see error field for details',
    retry: false,
    note: 'Fix the specific field',
  },
  {
    code: '429',
    meaning: 'Rate limit exceeded (100 req / min)',
    retry: true,
    note: 'Wait until X-RateLimit-Reset',
  },
  {
    code: '500',
    meaning: 'Internal server error',
    retry: true,
    note: 'Exponential backoff, max 3 retries',
  },
  {
    code: '503',
    meaning: 'Service temporarily unavailable',
    retry: true,
    note: 'Exponential backoff, max 3 retries',
  },
]

export function ErrorReference() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Code
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Meaning
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Retry?
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ERROR_CODES.map((row) => (
            <tr key={row.code}>
              <td className="px-4 py-3">
                <span className="font-mono font-semibold">{row.code}</span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.meaning}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    row.retry
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-destructive/10 text-destructive'
                  )}
                >
                  {row.retry ? 'Yes' : 'No'}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
