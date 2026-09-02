import { useEffect, useState } from 'react'
import { Text, useInput } from 'ink'
import { C, CoverFrame, LooperMark } from './loopChrome.js'
import {
  formatGrindPulseLines,
  readAssistantStreamTail,
  readGrindPulse,
  type GrindPulse,
} from '../loop/grindStream.js'
import { formatWatchStatusLine, readWatchView, type WatchStatus } from '../loop/loopWatch.js'

export function WatchView({
  status,
  streamTail = '',
  pulse = null,
  showPulse = false,
}: {
  status: WatchStatus
  streamTail?: string
  pulse?: GrindPulse | null
  showPulse?: boolean
}) {
  const pulseLines = showPulse && pulse ? formatGrindPulseLines(pulse) : []
  const streamLines = streamTail
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
  const emptyHint = status.ended
    ? 'run finished — s for last pulse'
    : '(no tokens yet — s for pid/log pulse)'

  return (
    <CoverFrame>
      <LooperMark
        isActive={!status.ended}
        activeStage={status.ended ? undefined : status.phase}
        idlePipeline={Boolean(status.ended)}
      />
      <Text color={C.terracotta} bold wrap="truncate">
        {formatWatchStatusLine(status)}
      </Text>
      <Text color={C.muted} wrap="truncate">
        {status.ended
          ? `run exited — last ${status.phase} iteration ${status.iteration}/${status.maxIterations}`
          : `watching ${status.phase} — iteration ${status.iteration}/${status.maxIterations}`}
      </Text>
      <Text color={C.ghost} wrap="truncate">
        {showPulse ? 's refresh pulse · esc hide' : 's status'}
      </Text>
      {pulseLines.map((line, index) => (
        <Text key={`pulse-${index}`} color={C.tan} wrap="truncate">
          {line}
        </Text>
      ))}
      {!showPulse && streamLines.length > 0
        ? streamLines.map((line, index) => (
            <Text key={`stream-${index}`} color={C.muted} wrap="truncate">
              {line}
            </Text>
          ))
        : null}
      {!showPulse && streamLines.length === 0 ? (
        <Text color={C.ghost} wrap="truncate">
          {emptyHint}
        </Text>
      ) : null}
    </CoverFrame>
  )
}

/** Live watch root: prefers watch-status.json from `run`, else last log.ndjson. */
export function WatchApp({
  loopDir,
  maxIterations,
  pollMs = 1000,
}: {
  loopDir: string
  maxIterations?: number
  pollMs?: number
}) {
  const [status, setStatus] = useState<WatchStatus | null>(() =>
    readWatchView(loopDir, { maxIterations }),
  )
  const [streamTail, setStreamTail] = useState(() => readAssistantStreamTail(loopDir))
  const [pulse, setPulse] = useState<GrindPulse | null>(null)
  const [showPulse, setShowPulse] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      const next = readWatchView(loopDir, { maxIterations })
      const nextTail = readAssistantStreamTail(loopDir)
      setStreamTail(nextTail)
      if (showPulse) {
        setPulse(readGrindPulse(loopDir, { maxIterations }))
      }
      setStatus((prev) => {
        if (
          prev &&
          next &&
          prev.phase === next.phase &&
          prev.iteration === next.iteration &&
          Math.round(prev.elapsedMs / 1000) === Math.round(next.elapsedMs / 1000) &&
          prev.costUsd === next.costUsd &&
          prev.ended === next.ended
        ) {
          return prev
        }
        return next
      })
    }, pollMs)
    return () => clearInterval(timer)
  }, [loopDir, maxIterations, pollMs, showPulse])

  useInput((input, key) => {
    if (key.escape && showPulse) {
      setShowPulse(false)
      return
    }
    if (input === 's' || input === 'S') {
      setPulse(readGrindPulse(loopDir, { maxIterations }))
      setShowPulse(true)
    }
  })

  if (!status) {
    return (
      <CoverFrame>
        <LooperMark isActive idlePipeline />
        <Text color={C.muted}>waiting for a run…</Text>
        <Text color={C.ghost} wrap="truncate">
          s status
        </Text>
      </CoverFrame>
    )
  }
  return (
    <WatchView
      status={status}
      streamTail={streamTail}
      pulse={pulse}
      showPulse={showPulse}
    />
  )
}
