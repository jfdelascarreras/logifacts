export type DayPoint = {
  date: string // YYYY-MM-DD
  completed: number
  errors: number
}

export function VolumeChart({ days }: { days: DayPoint[] }) {
  const W = 600
  const H = 180
  const PAD = { top: 12, right: 12, bottom: 36, left: 40 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const chartBottom = PAD.top + chartH

  const maxTotal = Math.max(...days.map((d) => d.completed + d.errors), 1)
  const barCount = days.length
  const barGap = barCount > 30 ? 0 : 1
  const barWidth = Math.max(2, (chartW - barGap * (barCount - 1)) / barCount)
  const rx = Math.min(1, Math.max(0, Math.floor(barWidth / 3)))

  function toX(i: number) {
    return PAD.left + i * (barWidth + barGap)
  }

  function toH(count: number) {
    return (count / maxTotal) * chartH
  }

  const yTicks = [0, 0.5, 1].map((frac) => ({
    label: Math.round(maxTotal * frac).toString(),
    y: chartBottom - frac * chartH,
  }))

  const labelEvery = barCount <= 7 ? 1 : barCount <= 30 ? 5 : 15
  const hasData = days.some((d) => d.completed + d.errors > 0)

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Daily Request Volume</p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" aria-hidden />
            Completed
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm bg-red-500" aria-hidden />
            Errors
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-muted-foreground">No requests in this period</p>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Daily request volume"
        >
          {/* Y-axis grid lines */}
          {yTicks.map((tick) => (
            <g key={tick.label}>
              <line
                x1={PAD.left}
                y1={tick.y}
                x2={PAD.left + chartW}
                y2={tick.y}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 4}
                y={tick.y + 4}
                textAnchor="end"
                fontSize={9}
                fill="currentColor"
                fillOpacity={0.4}
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Bars — completed at bottom (close to x-axis), errors stacked on top */}
          {days.map((day, i) => {
            const x = toX(i)
            const completedH = toH(day.completed)
            const errorH = toH(day.errors)

            return (
              <g key={day.date}>
                {/* Completed: starts at chartBottom, grows upward */}
                {day.completed > 0 && (
                  <rect
                    x={x}
                    y={chartBottom - completedH}
                    width={barWidth}
                    height={completedH}
                    fill="#10b981"
                    fillOpacity={0.85}
                    rx={rx}
                  >
                    <title>
                      {day.date} — {day.completed} completed
                    </title>
                  </rect>
                )}
                {/* Errors: stacked above completed */}
                {day.errors > 0 && (
                  <rect
                    x={x}
                    y={chartBottom - completedH - errorH}
                    width={barWidth}
                    height={errorH}
                    fill="#ef4444"
                    fillOpacity={0.85}
                    rx={rx}
                  >
                    <title>
                      {day.date} — {day.errors} error{day.errors !== 1 ? 's' : ''}
                    </title>
                  </rect>
                )}
              </g>
            )
          })}

          {/* X-axis labels */}
          {days.map((day, i) => {
            if (i % labelEvery !== 0) return null
            return (
              <text
                key={day.date}
                x={toX(i) + barWidth / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize={8}
                fill="currentColor"
                fillOpacity={0.4}
              >
                {day.date.slice(5)}
              </text>
            )
          })}
        </svg>
      )}
    </div>
  )
}
