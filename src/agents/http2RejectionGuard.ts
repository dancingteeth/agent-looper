import { formatErrorChain, isHttp2StreamTransportError } from './errorFormat.js'

let depth = 0
let rejectionListener: ((reason: unknown) => void) | undefined
let exceptionListener: ((err: unknown) => void) | undefined

function ignoreDetachedHttp2(reason: unknown): boolean {
  if (!isHttp2StreamTransportError(reason)) return false
  console.error(
    `[agent-loop] ignored detached HTTP/2 stream error (continuing): ${formatErrorChain(reason)}`,
  )
  return true
}

function onUnhandledRejection(reason: unknown): void {
  if (ignoreDetachedHttp2(reason)) return
  throw reason
}

function onUncaughtException(err: unknown): void {
  if (ignoreDetachedHttp2(err)) return
  console.error(err)
  process.exit(1)
}

/**
 * While a Cursor SDK run is in flight, swallow detached HTTP/2 stream
 * refusals from background Connect RPCs so they cannot kill the process.
 * Listens for both `unhandledRejection` (promise) and `uncaughtException`
 * (Http2Stream 'error' / onStreamClose). Other failures still kill the process.
 */
export function installHttp2UnhandledRejectionGuard(): () => void {
  if (depth === 0) {
    rejectionListener = onUnhandledRejection
    exceptionListener = onUncaughtException
    process.on('unhandledRejection', rejectionListener)
    process.on('uncaughtException', exceptionListener)
  }
  depth += 1
  let released = false
  return () => {
    if (released) return
    released = true
    depth -= 1
    if (depth === 0) {
      if (rejectionListener) {
        process.off('unhandledRejection', rejectionListener)
        rejectionListener = undefined
      }
      if (exceptionListener) {
        process.off('uncaughtException', exceptionListener)
        exceptionListener = undefined
      }
    }
  }
}
