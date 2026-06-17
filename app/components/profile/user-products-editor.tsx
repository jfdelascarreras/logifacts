'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MAX_USER_PRODUCTS,
  emptyProductForm,
  friendlyProductDbError,
  mapUserProductRow,
  parseUserProductForm,
  productToFormFields,
  userProductInputToRow,
  type UserProduct,
  type UserProductFormFields,
  type UserProductRow,
} from '@/lib/products/user-product'
import { createClient } from '@/lib/supabase/client'

type Props = {
  initialProducts: UserProductRow[]
}

function fmtDim(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

export function UserProductsEditor({ initialProducts }: Props) {
  const [products, setProducts] = useState<UserProduct[]>(() =>
    [...initialProducts].map(mapUserProductRow).sort((a, b) => a.name.localeCompare(b.name))
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<UserProductFormFields>(emptyProductForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const atLimit = products.length >= MAX_USER_PRODUCTS
  const dialogTitle = editingId ? 'Edit product' : 'Add product'

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  )

  function openCreateDialog() {
    setEditingId(null)
    setForm(emptyProductForm())
    setError(null)
    setDialogOpen(true)
  }

  function openEditDialog(product: UserProduct) {
    setEditingId(product.id)
    setForm(productToFormFields(product))
    setError(null)
    setDialogOpen(true)
  }

  function updateField(key: keyof UserProductFormFields, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    const parsed = parseUserProductForm(form)
    if (!parsed.ok) {
      setError(parsed.error)
      setSaving(false)
      return
    }

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in.')

      const row = userProductInputToRow(parsed.value)

      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('user_products')
          .update(row)
          .eq('id', editingId)
          .select('id, name, weight_lbs, length_in, width_in, height_in, created_at, updated_at')
          .single()

        if (updateError) throw updateError
        const updated = mapUserProductRow(data as UserProductRow)
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        setMessage('Product updated.')
      } else {
        const { data, error: insertError } = await supabase
          .from('user_products')
          .insert({ ...row, user_id: user.id })
          .select('id, name, weight_lbs, length_in, width_in, height_in, created_at, updated_at')
          .single()

        if (insertError) throw insertError
        const created = mapUserProductRow(data as UserProductRow)
        setProducts((prev) => [...prev, created])
        setMessage('Product added.')
      }

      setDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save product.'
      setError(friendlyProductDbError(msg))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product: UserProduct) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return

    setDeletingId(product.id)
    setError(null)
    setMessage(null)

    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase.from('user_products').delete().eq('id', product.id)
      if (deleteError) throw deleteError
      setProducts((prev) => prev.filter((p) => p.id !== product.id))
      setMessage('Product deleted.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete product.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">My products</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved package profiles for the Shipment Calculator. Each product needs a name, weight (lb), and dimensions
            (in). Up to {MAX_USER_PRODUCTS} products per account.
          </p>
        </div>
        <Button type="button" onClick={openCreateDialog} disabled={atLimit}>
          Add product
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {atLimit ? (
          <p className="text-xs text-muted-foreground">
            Product limit reached ({MAX_USER_PRODUCTS}). Delete a product to add another.
          </p>
        ) : null}

        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved products yet. Add one here, then pick it from the calculator under <strong>My products</strong>.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Weight (lb)</TableHead>
                  <TableHead className="text-right">L (in)</TableHead>
                  <TableHead className="text-right">W (in)</TableHead>
                  <TableHead className="text-right">H (in)</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtDim(product.weightLbs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtDim(product.lengthIn)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtDim(product.widthIn)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtDim(product.heightIn)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(product)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingId === product.id}
                          onClick={() => void handleDelete(product)}
                        >
                          {deletingId === product.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {error && !dialogOpen ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              All fields are required. Names must be unique within your account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Name</Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. Small mailer box"
                maxLength={80}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="product-weight">Weight (lb)</Label>
                <Input
                  id="product-weight"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.weightLbs}
                  onChange={(e) => updateField('weightLbs', e.target.value)}
                />
              </div>
              {([
                { id: 'product-length', key: 'lengthIn' as const, label: 'L (in)' },
                { id: 'product-width', key: 'widthIn' as const, label: 'W (in)' },
                { id: 'product-height', key: 'heightIn' as const, label: 'H (in)' },
              ]).map(({ id, key, label }) => (
                <div key={id} className="space-y-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  <Input
                    id={id}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {error && dialogOpen ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
