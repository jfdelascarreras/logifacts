"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === "dark"

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label="Toggle theme"
        className="pointer-events-none opacity-60"
      >
        <Moon aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  )
}
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === "dark"

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label="Toggle theme"
        className="pointer-events-none opacity-60"
      >
        <Moon aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  )
}
