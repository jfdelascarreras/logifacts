/**
 * Premium Analysis — **server-side** calculation domain (API routes, compute pipeline).
 *
 * Client components must NOT import this barrel — it pulls in `node:fs` via fuel rerate.
 * Use `@/lib/premium-analysis/analysis-summary` or `@/lib/premium-analysis/agents-types` in UI.
 *
 * Shared invoice primitives (CSV layout, parsers, mapping) live in `@/lib/invoices`.
 */
export * from './agents-types'
export * from './agents-outputs'
export * from './analysis-summary'
export * from './analyze-parse-cache'
export * from './anomaly-detection'
export * from './carrier-mix'
export * from './compute'
export * from './contract-compliance'
export * from './exporter'
export * from './ingest-adapters'
export * from './period-averages-matrix'
export * from './period-matrix-exporter'
export * from './savings-estimator'
export * from './action-prioritization'
export * from './spec-categories'
export { persistPremiumAnalysisCache } from './persist-cache'
