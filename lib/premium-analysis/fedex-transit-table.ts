/** FedEx Ground business-day transit by domestic zone (2–8). */
export function fedexGroundTransitDays(zone: number): number | null {
  if (!Number.isFinite(zone) || zone <= 0 || zone >= 100) return null
  if (zone <= 2) return 1
  if (zone <= 4) return 2
  if (zone <= 6) return 3
  if (zone <= 8) return 4
  return 5
}
