import { cn } from '@/lib/utils'

/** Shared layout + typography for Premium Analysis (economic working-paper aesthetic). */
export const paper = {
  root: 'premium-paper text-foreground',
  page: 'mx-auto flex w-full max-w-[42rem] flex-col gap-10 sm:max-w-[48rem] lg:max-w-[52rem]',

  /** Document title block */
  docTitle: 'font-serif text-[1.65rem] font-normal leading-tight tracking-tight text-foreground sm:text-[1.85rem]',
  docSubtitle: 'mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground',
  docMeta: 'mt-2 text-xs leading-relaxed text-muted-foreground',

  /** Numbered sections (§1, §2, …) */
  section: 'border border-border bg-card',
  sectionHeader: 'border-b border-border px-4 py-3 sm:px-5',
  sectionBody: 'px-4 py-4 sm:px-5',
  sectionTitle: 'font-serif text-base font-semibold text-foreground',
  sectionNumber: 'mr-1 text-muted-foreground',
  sectionDesc: 'mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground',

  /** Tables */
  tableWrap: 'overflow-x-auto border border-border',
  table: 'w-full border-collapse text-sm',
  tableHead: 'border-b-2 border-foreground/15 text-xs text-muted-foreground',
  th: 'px-3 py-2 font-medium',
  thRight: 'px-3 py-2 text-right font-medium',
  td: 'border-b border-border/70 px-3 py-2 tabular-nums text-foreground',
  tdRight: 'border-b border-border/70 px-3 py-2 text-right tabular-nums text-foreground',
  tdLabel: 'border-b border-border/70 px-3 py-2 font-medium text-foreground',
  tfoot: 'border-t-2 border-foreground/15 bg-muted/20 font-semibold',

  /** Figures & captions */
  figureTitle: 'font-serif text-sm font-semibold text-foreground',
  figureNote: 'mt-2 text-xs italic leading-relaxed text-muted-foreground',
  figureBox: 'border border-border bg-background p-3',

  /** KPI summary (Table 1 style) */
  kpiLabel: 'text-xs uppercase tracking-wide text-muted-foreground',

  /** Tabs */
  tabList: 'flex gap-0 border-b border-foreground/20',
  tab: 'border-b-2 border-transparent px-4 py-2 font-serif text-sm text-muted-foreground transition-colors hover:text-foreground',
  tabActive: 'border-foreground text-foreground',

  /** Controls — sans for legibility on small UI */
  control: 'font-sans flex h-8 rounded-none border border-input bg-background px-2 text-xs shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  btnOutline:
    'rounded-none border border-border bg-background font-sans text-foreground shadow-none hover:bg-muted/40',
  btnPrimary: 'rounded-none bg-primary font-sans text-primary-foreground shadow-none hover:bg-primary/90',
  monthChip:
    'relative flex min-h-10 cursor-pointer select-none items-center justify-center rounded-none border px-2 py-2 text-center text-xs font-medium leading-tight transition-colors motion-reduce:transition-none',
  monthChipSelected: 'border-foreground bg-muted/50 text-foreground',
  monthChipIdle: 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',

  /** Alerts — flat, no glow */
  alert: 'border border-border bg-muted/30 px-4 py-3 text-sm',
  alertError: 'border-destructive/40 bg-destructive/5 text-destructive',

  /** Bar / chart primitives */
  barTrack: 'relative h-3 min-w-0 flex-1 overflow-hidden bg-muted/40',
  barFill: 'h-full transition-[width] duration-300 motion-reduce:transition-none',
} as const

export function paperSectionClass(extra?: string) {
  return cn(paper.section, extra)
}

export function paperTableHeadCell(right = false) {
  return cn(paper.th, right && 'text-right')
}

export function paperTableCell(right = false, label = false) {
  if (label) return paper.tdLabel
  return cn(paper.td, right && 'text-right')
}
