import { redirect } from 'next/navigation'

/** Per-invoice dashboards are retired — Premium Analysis aggregates the full upload set. */
export default function LegacyInvoiceDashboardRedirect() {
  redirect('/premium-analysis')
}
