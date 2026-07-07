import type { InnerAgentStatus } from './innerAgentStatus.js'
import type { LoopUsageRecord } from '../usage/loopUsage.js'

export type AgentRunResult = {
  text: string
  usage?: LoopUsageRecord
  innerAgent?: InnerAgentStatus
}
