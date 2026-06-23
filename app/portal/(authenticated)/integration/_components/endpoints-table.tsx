const ENDPOINTS = [
  {
    environment: 'Production',
    url: 'https://logifacts.com/api/rate-calculator',
    status: 'live',
  },
  {
    environment: 'Sandbox',
    url: 'https://logifacts.com/api/sandbox/rate-calculator',
    status: 'coming-soon',
  },
  {
    environment: 'Batch',
    url: 'https://logifacts.com/api/rate-calculator/batch',
    status: 'coming-soon',
  },
]

export function EndpointsTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Environment
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              URL
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ENDPOINTS.map((row) => (
            <tr key={row.environment}>
              <td className="px-4 py-3 font-medium">{row.environment}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.url}</td>
              <td className="px-4 py-3">
                {row.status === 'live' ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                ) : (
                  <span className="text-muted-foreground">Coming soon</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
