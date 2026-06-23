'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type Tab = 'curl' | 'ts-fetch' | 'ts-sdk'

const TAB_LABELS: Record<Tab, string> = {
  curl: 'curl',
  'ts-fetch': 'TypeScript (fetch)',
  'ts-sdk': 'TypeScript (SDK)',
}

function buildCurl(customerId: string) {
  return `curl -X POST https://logifacts.com/api/rate-calculator \\
  -H "Authorization: Bearer lf_<your_api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_id": "${customerId}",
    "origin_zip": "60601",
    "destination_zip": "90210",
    "weight_lbs": 12.5,
    "residential": false,
    "ups_service": "ground",
    "fedex_service": "ground",
    "markup_pct": 0
  }'`
}

function buildTsFetch(customerId: string) {
  return `const response = await fetch('https://logifacts.com/api/rate-calculator', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${process.env.LOGIFACTS_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    customer_id: '${customerId}',
    origin_zip: '60601',
    destination_zip: '90210',
    weight_lbs: 12.5,
    residential: false,
    ups_service: 'ground',
    fedex_service: 'ground',
    markup_pct: 0,
  }),
});

if (!response.ok) {
  const { error } = await response.json();
  throw new Error(error);
}

const { ups, fedex } = await response.json();
console.log('UPS final rate:', ups.final_rate);
console.log('FedEx final rate:', fedex.final_rate);`
}

function buildTsSdk(customerId: string) {
  return `import { LogifactsClient } from '@logifacts/sdk';

const client = new LogifactsClient({
  apiKey: process.env.LOGIFACTS_API_KEY,
  customerId: '${customerId}',
});

const { ups, fedex } = await client.getRates({
  originZip: '60601',
  destinationZip: '90210',
  weightLbs: 12.5,
  residential: false,
  upsService: 'ground',
  fedexService: 'ground',
  markupPct: 0,
});

console.log('UPS final rate:', ups.final_rate);
console.log('FedEx final rate:', fedex.final_rate);`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
    >
      {copied ? (
        <CheckIcon className="size-4 text-emerald-400" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </button>
  )
}

export function CodeExamples({ customerId }: { customerId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('curl')

  const code: Record<Tab, string> = {
    curl: buildCurl(customerId),
    'ts-fetch': buildTsFetch(customerId),
    'ts-sdk': buildTsSdk(customerId),
  }

  const tabs = Object.keys(TAB_LABELS) as Tab[]

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-muted/40">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'border-b-2 border-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
        {activeTab === 'ts-sdk' && (
          <span className="ml-auto self-center pr-3 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            SDK coming soon
          </span>
        )}
      </div>

      {/* Code block */}
      <div className="relative bg-zinc-950">
        <div className="absolute right-2 top-2 z-10">
          <CopyButton text={code[activeTab]} />
        </div>
        <pre className="overflow-x-auto p-5 text-sm leading-relaxed text-zinc-100">
          <code>{code[activeTab]}</code>
        </pre>
      </div>
    </div>
  )
}
