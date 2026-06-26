import { AuthSidebar } from '@/app/components/navigation/auth-sidebar'
import { getAdminContext } from '@/lib/admin/getAdminContext'

interface AuthenticatedShellProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export async function AuthenticatedShell({ title, subtitle, children }: AuthenticatedShellProps) {
  const admin = await getAdminContext()

  return (
    <div className="min-h-svh bg-background md:flex">
      <AuthSidebar isAdmin={!!admin} />

      <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </header>

        <section>{children}</section>
      </div>
    </div>
  )
}
