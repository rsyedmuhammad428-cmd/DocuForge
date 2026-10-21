const UNITS = ['bytes', 'KB', 'MB', 'GB'] as const

/** File sizes the way Windows shows them: 1 KB = 1024 bytes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 10 ? 0 : 1)
  return `${text} ${UNITS[unit]}`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
