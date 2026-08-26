import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { C, LooperMark } from './loopChrome.js'
import { formatWatchStatusLine, readWatchView, type WatchStatus } from '../loop/loopWatch.js'

export function WatchView({ status }: { status: WatchStatus }) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={C.terracotta} paddingX={1} paddingY={0}>
        <LooperMark
          isActive={!status.ended}
          activeStage={status.ended ? undefined : status.phase}
          idlePipeline={Boolean(status.ended)}
        />
        <Text color={C.terracotta} bold>
          {formatWatchStatusLine(status)}
        </Text>
        <Text color={C.muted}>
          {status.ended
            ? `run exited — last ${status.phase} iteration ${status.iteration}/${status.maxIterations}`
            : `watching ${status.phase} — iteration ${status.iteration}/${status.maxIterations}`}
        </Text>
      </Box>
    </Box>
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

  useEffect(() => {
    const timer = setInterval(() => {
      const next = readWatchView(loopDir, { maxIterations })
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
  }, [loopDir, maxIterations, pollMs])

  if (!status) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box flexDirection="column" borderStyle="round" borderColor={C.terracotta} paddingX={1} paddingY={0}>
          <LooperMark isActive idlePipeline />
          <Text color={C.muted}>waiting for a run…</Text>
        </Box>
      </Box>
    )
  }
  return <WatchView status={status} />
}
