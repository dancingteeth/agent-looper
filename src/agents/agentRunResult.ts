import type { LoopUsageRecord } from '../usage/loopUsage.js'

export type AgentRunResult = {
  text: string
  usage?: LoopUsageRecord
}
