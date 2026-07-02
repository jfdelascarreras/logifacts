'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BrandLogo } from '@/app/components/branding/brand-logo'
import { ThemeToggle } from '@/app/components/theme/theme-toggle'
import { LogoutButton } from '@/components/logout-button'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Home', href: '/home' },
  { label: 'Premium Analysis', href: '/premium-analysis' },
  { label: 'Fuel Surcharges', href: '/fuel-surcharges' },
  { label: 'LogiFacts Shipment Calculator', href: '/pricing' },
  { label: 'Join Panel', href: '/join-panel' },
  { label: 'My Benchmark', href: '/my-benchmark' },
  { label: 'Consumer Study', href: '/consumer-study' },
  { label: 'API Portal', href: '/portal' },
  { label: 'My Profile', href: '/protected' },
  { label: 'Customers', href: '/dashboard/customers', adminOnly: true },
]

export function AuthSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <aside className="w-full border-b border-border bg-card/50 p-4 md:min-h-svh md:w-64 md:border-b-0 md:border-r md:p-6">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Link href="/home" className="inline-block" aria-label="LogiFacts home">
            <BrandLogo className="w-[140px] sm:w-[160px]" />
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 md:flex-col md:gap-1">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground/85 hover:bg-muted hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6 md:mt-8">
        <LogoutButton />
      </div>
    </aside>
  )
}
