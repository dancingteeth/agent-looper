/**
 * Ink's react-reconciler loads the development bundle whenever
 * NODE_ENV !== "production". That bundle calls performance.measure() on every
 * commit and never clears the buffer. The setup TUI animation then overflows
 * Node's ~1e6-entry cap (MaxPerformanceEntryBufferExceededWarning).
 *
 * @see https://github.com/vadimdemedes/ink/issues/869
 */
export function ensureInkProductionEnv(env: {
  NODE_ENV?: string
} = process.env): void {
  if (env.NODE_ENV === undefined || env.NODE_ENV === '') {
    env.NODE_ENV = 'production'
  }
}

export function clearInkPerformanceBuffer(): void {
  performance.clearMarks()
  performance.clearMeasures()
}

ensureInkProductionEnv()
