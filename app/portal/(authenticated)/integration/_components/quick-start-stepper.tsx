import { KeyRoundIcon, SendIcon, ZapIcon } from 'lucide-react'

const STEPS = [
  {
    icon: KeyRoundIcon,
    title: 'Get your credentials',
    description:
      'Grab your Customer ID and API key from the Credentials page. Your key starts with lf_.',
  },
  {
    icon: SendIcon,
    title: 'Make your first request',
    description:
      'POST to /api/v1/rate-calculator with your customer_id and shipment details. Use the curl or TypeScript examples below.',
  },
  {
    icon: ZapIcon,
    title: 'Handle the response',
    description:
      'Parse the ups and fedex objects. Each contains a final_rate and a full charge breakdown. Both carriers are returned in one call.',
  },
]

export function QuickStartStepper() {
  return (
    <div className="relative">
      {/* Connector line — hidden on mobile, shown on md+ */}
      <div
        className="absolute left-5 top-5 hidden h-px w-[calc(100%-2.5rem)] bg-border md:block"
        aria-hidden
      />

      <ol className="flex flex-col gap-6 md:flex-row md:gap-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <li key={step.title} className="relative flex gap-4 md:flex-1 md:flex-col md:gap-3 md:pr-6">
              {/* Step number circle */}
              <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-background">
                <Icon className="size-4 text-accent" aria-hidden />
              </div>

              {/* Vertical connector on mobile */}
              {i < STEPS.length - 1 && (
                <div
                  className="absolute left-5 top-10 h-full w-px bg-border md:hidden"
                  aria-hidden
                />
              )}

              <div className="pb-6 md:pb-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Step {i + 1}
                </p>
                <h3 className="mt-0.5 font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
