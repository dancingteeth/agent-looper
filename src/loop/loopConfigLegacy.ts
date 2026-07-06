/** Map legacy loop.json / loop-batch.json field `syncPostgres` → `syncOnSuccess`. */
export function migrateLegacySyncPostgres(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !('syncPostgres' in raw)) {
    return raw
  }

  const record = raw as Record<string, unknown>
  const { syncPostgres, ...rest } = record
  if (typeof syncPostgres === 'boolean' && !('syncOnSuccess' in rest)) {
    return { ...rest, syncOnSuccess: syncPostgres }
  }

  return raw
}
