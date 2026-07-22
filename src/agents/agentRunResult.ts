import type { InnerAgentStatus } from './innerAgentStatus.js'
import type { LoopUsageRecord } from '../usage/loopUsage.js'
import type { AgentSessionRef, TranscriptEvent } from '../stream/streamCollect.js'

export type AgentRunResult = {
  text: string
  usage?: LoopUsageRecord
  innerAgent?: InnerAgentStatus
  sessionRef?: AgentSessionRef
  toolSummary?: Record<string, number>
  transcriptEvents?: TranscriptEvent[]
}
