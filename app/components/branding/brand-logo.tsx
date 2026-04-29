import Image from 'next/image'

import { cn } from '@/lib/utils'

type BrandLogoProps = {
  className?: string
  priority?: boolean
}

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <>
      <Image
        src="/branding/logo-primary-fullcolor.png"
        alt="LogiFacts logo"
        width={1024}
        height={416}
        priority={priority}
        className={cn('h-auto w-[180px] dark:hidden sm:w-[240px]', className)}
      />
      <Image
        src="/branding/logo-primary-reverse.png"
        alt="LogiFacts logo"
        width={1024}
        height={416}
        priority={priority}
        className={cn('hidden h-auto w-[180px] dark:block sm:w-[240px]', className)}
      />
    </>
  )
}
