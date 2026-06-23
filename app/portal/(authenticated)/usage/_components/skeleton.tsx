export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
      <div className="h-56 rounded-xl border border-border bg-muted/40" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-48 rounded-xl border border-border bg-muted/40" />
        <div className="h-48 rounded-xl border border-border bg-muted/40" />
      </div>
      <div className="h-52 rounded-xl border border-border bg-muted/40" />
    </div>
  )
}
