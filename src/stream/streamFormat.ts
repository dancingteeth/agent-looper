export function truncateStreamValue(value: unknown, max = 200): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
