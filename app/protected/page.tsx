import { redirect } from 'next/navigation'

import { CloseAccountSection } from '@/app/components/profile/close-account-section'
import { ProfileEditor } from '@/app/components/profile/profile-editor'
import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { createClient } from '@/lib/supabase/server'

export default async function ProtectedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  const metadata = user.user_metadata ?? {}

  return (
    <AuthenticatedShell
      title="My Profile"
      subtitle={`Signed in as ${user.email ?? 'your account'}`}
    >
      <div className="space-y-6">
        <ProfileEditor
          email={user.email ?? ''}
          fullName={(metadata.full_name as string | undefined) ?? ''}
          companyName={(metadata.company_name as string | undefined) ?? ''}
          employees={(metadata.employees as string | undefined) ?? ''}
          industry={(metadata.industry as string | undefined) ?? ''}
          companyPictureUrl={(metadata.company_picture_url as string | undefined) ?? ''}
          originZip={(metadata.origin_zip as string | undefined) ?? ''}
        />
        <CloseAccountSection email={user.email ?? ''} />
      </div>
    </AuthenticatedShell>
  )
}
