import { redirect } from 'next/navigation'

import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { PremiumDashboard } from '@/app/components/analysis/premium-dashboard'
import { InvoiceCsvUpload } from '@/app/components/invoices/invoice-csv-upload'
import { createClient } from '@/lib/supabase/server'

export default async function PremiumAnalysisPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <AuthenticatedShell
      title="Premium Analysis"
      subtitle={`Signed in as ${user.email ?? 'your account'}`}
    >
      <div className="space-y-8">
        <section
          id="premium-invoice-upload"
          className="scroll-mt-24 bg-background pb-2"
          aria-label="Invoice CSV upload"
        >
          <div className="mx-auto w-full max-w-5xl">
            <InvoiceCsvUpload />
          </div>
        </section>
        <PremiumDashboard />
      </div>
    </AuthenticatedShell>
  )
}

