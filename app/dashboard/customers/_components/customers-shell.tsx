'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { CustomerTable } from './customer-table'
import { CustomerPanel } from './customer-panel'
import { CreateCustomerModal } from './create-customer-modal'

// ── Shared type (used by table, panel, and page) ──────────────────────────────

export type CustomerRow = {
  customer_id: string
  name: string | null
  user_id: string
  enforce_discounts: boolean
  created_at: string
  keyPrefix: string | null       // first 8 chars of hex key, display as lf_XXXXXXXX
  keyLastUsed: string | null
  hasActiveKey: boolean
  lastActive: string | null      // most recent rate_request created_at
  recentRequestCount: number     // requests in last 30 days
  hasDiscounts: boolean
  isReady: boolean               // hasActiveKey && hasDiscounts && recentRequestCount > 0
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function CustomersShell({ customers }: { customers: CustomerRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const selectedCustomer = customers.find((c) => c.customer_id === selectedId) ?? null

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id))
  }

  function handlePanelClose() {
    setSelectedId(null)
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {customers.length === 0
              ? 'No API customers yet.'
              : `${customers.length} customer${customers.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>New Customer</Button>
      </div>

      {/* Table */}
      <CustomerTable
        customers={customers}
        selectedId={selectedId}
        onSelect={handleSelect}
      />

      {/* Slide-over panel */}
      <CustomerPanel
        customer={selectedCustomer}
        open={selectedId !== null}
        onClose={handlePanelClose}
      />

      {/* Create modal */}
      <CreateCustomerModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </>
  )
}
