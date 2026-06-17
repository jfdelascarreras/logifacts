export const MAX_USER_PRODUCTS = 25

export type UserProduct = {
  id: string
  name: string
  weightLbs: number
  lengthIn: number
  widthIn: number
  heightIn: number
  createdAt: string
  updatedAt: string
}

export type UserProductRow = {
  id: string
  name: string
  weight_lbs: number | string
  length_in: number | string
  width_in: number | string
  height_in: number | string
  created_at: string
  updated_at: string
}

export type UserProductInput = {
  name: string
  weightLbs: number
  lengthIn: number
  widthIn: number
  heightIn: number
}

export type UserProductFormFields = {
  name: string
  weightLbs: string
  lengthIn: string
  widthIn: string
  heightIn: string
}

export function mapUserProductRow(row: UserProductRow): UserProduct {
  return {
    id: row.id,
    name: row.name,
    weightLbs: Number(row.weight_lbs),
    lengthIn: Number(row.length_in),
    widthIn: Number(row.width_in),
    heightIn: Number(row.height_in),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function emptyProductForm(): UserProductFormFields {
  return { name: '', weightLbs: '', lengthIn: '', widthIn: '', heightIn: '' }
}

export function productToFormFields(product: UserProduct): UserProductFormFields {
  return {
    name: product.name,
    weightLbs: String(product.weightLbs),
    lengthIn: String(product.lengthIn),
    widthIn: String(product.widthIn),
    heightIn: String(product.heightIn),
  }
}

export function productToDimensionStrings(product: UserProduct): {
  weightLbs: string
  length: string
  width: string
  height: string
} {
  return {
    weightLbs: String(product.weightLbs),
    length: String(product.lengthIn),
    width: String(product.widthIn),
    height: String(product.heightIn),
  }
}

function parsePositive(value: string, label: string): number | string {
  const trimmed = value.trim()
  if (!trimmed) return `${label} is required.`
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return `${label} must be a positive number.`
  return n
}

export function parseUserProductForm(fields: UserProductFormFields): {
  ok: true
  value: UserProductInput
} | {
  ok: false
  error: string
} {
  const name = fields.name.trim()
  if (!name) return { ok: false, error: 'Product name is required.' }
  if (name.length > 80) return { ok: false, error: 'Product name must be 80 characters or fewer.' }

  const weight = parsePositive(fields.weightLbs, 'Weight')
  if (typeof weight === 'string') return { ok: false, error: weight }
  const lengthIn = parsePositive(fields.lengthIn, 'Length')
  if (typeof lengthIn === 'string') return { ok: false, error: lengthIn }
  const widthIn = parsePositive(fields.widthIn, 'Width')
  if (typeof widthIn === 'string') return { ok: false, error: widthIn }
  const heightIn = parsePositive(fields.heightIn, 'Height')
  if (typeof heightIn === 'string') return { ok: false, error: heightIn }

  return {
    ok: true,
    value: { name, weightLbs: weight, lengthIn, widthIn, heightIn },
  }
}

export function userProductInputToRow(input: UserProductInput) {
  return {
    name: input.name,
    weight_lbs: input.weightLbs,
    length_in: input.lengthIn,
    width_in: input.widthIn,
    height_in: input.heightIn,
  }
}

export function friendlyProductDbError(message: string): string {
  if (message.includes('user_products_name_user_unique')) {
    return 'You already have a product with that name.'
  }
  if (message.includes('product_limit_reached')) {
    return `You can save up to ${MAX_USER_PRODUCTS} products. Delete one to add another.`
  }
  return message
}
