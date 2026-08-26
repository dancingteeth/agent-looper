/**
 * Format unknown thrown values so bare Node `fetch failed` TypeErrors retain
 * cause/code/syscall instead of collapsing to a useless one-word message.
 */
export function formatErrorChain(err: unknown, maxDepth = 6): string {
  const parts: string[] = []
  let current: unknown = err

  for (let depth = 0; depth < maxDepth && current != null; depth++) {
    if (current instanceof Error) {
      const bits: string[] = []
      const msg = current.message?.trim() || current.name || 'Error'
      bits.push(msg)
      const enriched = current as Error & {
        code?: string | number
        errno?: number
        syscall?: string
        cause?: unknown
      }
      if (enriched.code !== undefined && enriched.code !== '') {
        bits.push(`code=${enriched.code}`)
      }
      if (enriched.errno !== undefined) {
        bits.push(`errno=${enriched.errno}`)
      }
      if (enriched.syscall) {
        bits.push(`syscall=${enriched.syscall}`)
      }
      parts.push(bits.join(' '))
      current = enriched.cause
      continue
    }

    if (typeof current === 'object' && current !== null) {
      const obj = current as { message?: unknown; code?: unknown; cause?: unknown }
      if (typeof obj.message === 'string' && obj.message.trim()) {
        const bits = [obj.message.trim()]
        if (obj.code !== undefined && obj.code !== '') bits.push(`code=${String(obj.code)}`)
        parts.push(bits.join(' '))
        current = obj.cause
        continue
      }
      try {
        parts.push(JSON.stringify(current))
      } catch {
        parts.push(String(current))
      }
      break
    }

    parts.push(String(current))
    break
  }

  return parts.filter(Boolean).join(' ← ') || String(err)
}

/** Provider/transport failures (vs auth, validation, or long agent timeouts). */
const HTTP2_STREAM_TRANSPORT_PATTERN = /NGHTTP2_[A-Z_]+|ERR_HTTP2_STREAM_ERROR/i

const TRANSPORT_ERROR_PATTERN =
  /\bfetch failed\b|\bECONNRESET\b|\bETIMEDOUT\b|\bEAI_AGAIN\b|socket hang up|\bUND_ERR_|\bECONNREFUSED\b|\bENOTFOUND\b|\bCERT_|\bSSL\b|\[layer=transport\]|\bstalled after\b|NGHTTP2_[A-Z_]+|ERR_HTTP2_STREAM_ERROR/i

export function isTransportErrorMessage(message: string): boolean {
  return TRANSPORT_ERROR_PATTERN.test(message)
}

export function isTransportAgentError(err: unknown): boolean {
  return isTransportErrorMessage(formatErrorChain(err))
}

/**
 * Connect-ES puts the NGHTTP2 text on `rawMessage` when `message` is empty.
 * Walk `cause` the same way {@link formatErrorChain} does.
 */
function http2ErrorHaystack(err: unknown, maxDepth = 6): string {
  const parts = [formatErrorChain(err)]
  let current: unknown = err
  for (let depth = 0; depth < maxDepth && current != null; depth++) {
    if (typeof current !== 'object') break
    const record = current as { rawMessage?: unknown; cause?: unknown }
    if (typeof record.rawMessage === 'string' && record.rawMessage.trim()) {
      parts.push(record.rawMessage.trim())
    }
    current = record.cause
  }
  return parts.join(' ')
}

/**
 * Detached Cursor SDK RPCs (team-repo / shouldBlockRead) can refuse an HTTP/2
 * stream and reject a promise nobody awaited — Node then dies with
 * `triggerUncaughtException`. Narrower than {@link isTransportAgentError}.
 */
export function isHttp2StreamTransportError(err: unknown): boolean {
  return HTTP2_STREAM_TRANSPORT_PATTERN.test(http2ErrorHaystack(err))
}
