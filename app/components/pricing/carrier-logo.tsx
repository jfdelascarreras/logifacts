import Image from 'next/image'
import type { StaticImageData } from 'next/image'

import fedexLogo from '@/lib/pricing/FedEx.png'
import { cn } from '@/lib/utils'

export type CarrierLogoId = 'ups' | 'fedex'

const LOGO_SRC: Record<CarrierLogoId, string | StaticImageData> = {
  ups: '/carriers/ups.svg',
  fedex: fedexLogo,
}

const SIZE_CLASS = {
  sm: 'h-4 w-auto',
  md: 'h-6 w-auto',
  lg: 'h-8 w-auto',
} as const

const SIZE_PX = {
  sm: 16,
  md: 24,
  lg: 32,
} as const

export function normalizeCarrierLogoId(carrier: string): CarrierLogoId | null {
  const key = carrier.trim().toLowerCase()
  if (key === 'ups') return 'ups'
  if (key === 'fedex') return 'fedex'
  return null
}

type Props = {
  carrier: CarrierLogoId | string
  size?: keyof typeof SIZE_CLASS
  className?: string
  /** Screen-reader label when the logo replaces visible carrier text */
  label?: string
}

export function CarrierLogo({ carrier, size = 'md', className, label }: Props) {
  const id = typeof carrier === 'string' && (carrier === 'ups' || carrier === 'fedex')
    ? carrier
    : normalizeCarrierLogoId(carrier)

  if (!id) return null

  const alt = label ?? (id === 'ups' ? 'UPS' : 'FedEx')
  const px = SIZE_PX[size]
  const src = LOGO_SRC[id]

  return (
    <Image
      src={src}
      alt={alt}
      width={id === 'ups' ? Math.round(px * 0.84) : Math.round(px * 2.8)}
      height={px}
      className={cn('object-contain object-left', SIZE_CLASS[size], className)}
      unoptimized={id === 'ups'}
    />
  )
}
