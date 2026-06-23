import { redirect } from 'next/navigation'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'
import { CalculatorForm } from './_components/calculator-form'

export const metadata = { title: 'Rate Calculator — LogiFacts Portal' }

export default async function CalculatorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const ctx = await getCustomerContext(user.id)
  if (!ctx) redirect('/portal/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rate Calculator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Get live UPS and FedEx shipping estimates with your contract rates applied.
        </p>
      </div>

      <CalculatorForm defaultDimensions={ctx.default_dimensions} />
    </div>
  )
}
