'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

interface ProfileEditorProps {
  email: string
  fullName: string
  companyName: string
  employees: string
  industry: string
  companyPictureUrl: string
}

export function ProfileEditor({
  email,
  fullName,
  companyName,
  employees,
  industry,
  companyPictureUrl,
}: ProfileEditorProps) {
  const [form, setForm] = useState({
    fullName,
    companyName,
    employees,
    industry,
    companyPictureUrl,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const initials = useMemo(() => {
    const source = form.companyName || form.fullName || email
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
  }, [email, form.companyName, form.fullName])

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: form.fullName,
          company_name: form.companyName,
          employees: form.employees,
          industry: form.industry,
          company_picture_url: form.companyPictureUrl,
        },
      })

      if (updateError) throw updateError
      setMessage('Profile updated successfully.')
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save profile.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Update your company picture and profile details.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-semibold text-foreground">
            {form.companyPictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.companyPictureUrl}
                alt="Company profile"
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="w-full">
            <Label htmlFor="companyPictureUrl">Company Picture URL</Label>
            <Input
              id="companyPictureUrl"
              type="url"
              placeholder="https://your-domain.com/company-logo.png"
              value={form.companyPictureUrl}
              onChange={(event) => handleChange('companyPictureUrl', event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(event) => handleChange('fullName', event.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">Business Name</Label>
            <Input
              id="companyName"
              value={form.companyName}
              onChange={(event) => handleChange('companyName', event.target.value)}
              placeholder="Your company name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employees"># of Employees</Label>
            <Input
              id="employees"
              value={form.employees}
              onChange={(event) => handleChange('employees', event.target.value)}
              placeholder="e.g. 50 to 99"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={form.industry}
              onChange={(event) => handleChange('industry', event.target.value)}
              placeholder="e.g. Agriculture/Forestry/Fishing/Mining"
            />
          </div>
        </div>

        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save profile'}
        </Button>
      </form>
    </div>
  )
}
