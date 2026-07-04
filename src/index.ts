export type { RepoContext, ResolveRepoContextOptions } from './context/repoContext.js'
export { resolveRepoContext, resolveTaskwarriorProject } from './context/repoContext.js'
export type { RepoProfile } from './context/repoProfile.js'
export {
  loadRepoProfile,
  repoProfileSchema,
  REPO_PROFILE_RELATIVE_PATH,
} from './context/repoProfile.js'

export { runAgentLoop } from './loop/agentLoop.js'
export type { AgentLoopResult, AgentLoopOptions, LoopIterationLog } from './loop/agentLoop.js'

export { runLoopBatch } from './loop/loopBatch.js'
export type { LoopBatchResult, RunLoopBatchOptions } from './loop/loopBatch.js'

export {
  loadLoopBundle,
  mergeLoopConfig,
  parseLoopConfig,
  resolveLoopDir,
  loopConfigSchema,
} from './loop/loopConfig.js'
export type { LoopConfig, LoadedLoopBundle } from './loop/loopConfig.js'

export {
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_CLINE_PASS,
  resolveLoopAgent,
  CLINE_PASS_LOOP_MODELS,
} from './loop/loopAgentConfig.js'

export { runVerifyCommand } from './loop/loopVerify.js'
export type { VerifyResult } from './loop/loopVerify.js'

export { buildAgentLoopPrompt } from './loop/loopPrompt.js'
export { detectStagnation } from './loop/loopStagnation.js'
export { validateGoalPreflight } from './loop/loopPreflight.js'
export { inferLoopReviewRisk, resolvePostQualityReview } from './loop/loopRisk.js'
export type { LoopReviewRisk, PostQualityReviewSetting } from './loop/loopRisk.js'

export { runCursorAgentPrompt } from './agents/cursorAgent.js'
export type { CursorAgentRunOptions } from './agents/cursorAgent.js'

export {
  buildQualityReviewPrompt,
  buildRiskTriagePreamble,
  buildThermoNuclearReviewPrompt,
  buildReviewOutputFormatReminder,
  loadReviewsMd,
  REVIEWS_MD,
} from './review/reviewPrompt.js'

export {
  buildPostLoopQualityReviewPrompt,
  runPostLoopQualityReview,
} from './review/loopPostReview.js'
