'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { BarChart2, Calculator, KeyRound, Menu, Plug, ScrollText, X } from 'lucide-react'

import { BrandLogo } from '@/app/components/branding/brand-logo'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Rate Calculator', href: '/portal/calculator', icon: Calculator },
  { label: 'API Credentials', href: '/portal/credentials', icon: KeyRound },
  { label: 'Integration Hub', href: '/portal/integration', icon: Plug },
  { label: 'Usage', href: '/portal/usage', icon: BarChart2 },
  { label: 'Request Log', href: '/portal/logs', icon: ScrollText },
]

interface PortalShellProps {
  customerName: string
  children: React.ReactNode
}

export function PortalShell({ customerName, children }: PortalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/portal/login')
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-5 md:px-5">
        <Link href="/portal/calculator" aria-label="Portal home" onClick={() => setSidebarOpen(false)}>
          <BrandLogo className="w-[130px]" />
        </Link>
        <button
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 pb-4 pt-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground/80 hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <p className="mb-3 truncate text-xs font-medium text-muted-foreground" title={customerName}>
          {customerName}
        </p>
        <button
          onClick={handleSignOut}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-svh bg-background">
      {/* Mobile topbar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm md:hidden">
        <button
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
        >
          <Menu className="size-5" />
        </button>
        <span className="text-sm font-semibold">{customerName}</span>
        {/* Spacer to keep name centred */}
        <div className="w-8" aria-hidden />
      </div>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-in-out md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Portal navigation"
      >
        {sidebarContent}
      </aside>

      {/* Page content — offset by sidebar width on desktop */}
      <div className="md:pl-64">
        <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-8" id="portal-main">
          {children}
        </main>
      </div>
    </div>
  )
}
