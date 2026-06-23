import { cn } from '@/lib/utils'

export type ApiKeyRow = {
  id: string
  key_prefix: string
  active: boolean
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
}

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function RevokedBadge({ reason }: { reason: string | null }) {
  const label =
    reason === 'regenerated'
      ? 'Regenerated'
      : reason === 'compromised'
        ? 'Compromised'
        : reason === 'admin'
          ? 'Revoked by admin'
          : 'Revoked'

  return (
    <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
      {label}
    </span>
  )
}

export function KeyHistoryTable({ keys }: { keys: ApiKeyRow[] }) {
  if (keys.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Key History</h2>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Prefix
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Last Used
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Revoked
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keys.map((key) => (
              <tr
                key={key.id}
                className={cn(
                  'transition-colors',
                  key.active ? 'bg-emerald-500/5' : 'text-muted-foreground'
                )}
              >
                <td className="px-4 py-3 font-mono text-xs">
                  lf_{key.key_prefix}
                  {key.active && (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide">Active</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{formatDate(key.created_at)}</td>
                <td className="px-4 py-3">{formatDate(key.last_used_at)}</td>
                <td className="px-4 py-3">
                  {key.revoked_at ? (
                    <RevokedBadge reason={key.revoked_reason} />
                  ) : key.active ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">{formatDate(key.revoked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
