'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { BrandLogo } from '@/app/components/branding/brand-logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function PortalLoginForm({ className }: { className?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError
      router.push('/portal/calculator')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex justify-center">
        <BrandLogo className="w-[160px]" priority />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Partner Portal</CardTitle>
          <CardDescription>Sign in to manage your API integration</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} noValidate aria-busy={isLoading}>
            <div className="flex flex-col gap-5">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  aria-invalid={!!error}
                  aria-describedby={error ? 'portal-login-error' : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto text-sm text-accent underline-offset-4 transition-colors hover:text-accent/85 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={!!error}
                  aria-describedby={error ? 'portal-login-error' : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error ? (
                <p id="portal-login-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Need access?{' '}
        <a
          href="mailto:support@logifacts.com"
          className="text-accent underline-offset-4 hover:underline"
        >
          Contact your account manager
        </a>
      </p>
    </div>
  )
}
