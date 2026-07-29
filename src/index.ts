export { detectDefaultBranch, defaultBranchRefExists } from './context/defaultBranch.js'
export { validateRepoProfile, formatRepoProfileCheck } from './context/repoProfileDoctor.js'
export type { RepoProfileCheck } from './context/repoProfileDoctor.js'
export type { InnerAgentStatus } from './agents/innerAgentStatus.js'
export { CLINE_INNER_MAX_ITERATIONS } from './agents/innerAgentStatus.js'

export { resolveRepoContext, resolveTaskwarriorProject } from './context/repoContext.js'
export type { RepoContext, ResolveRepoContextOptions } from './context/repoContext.js'
export type { RepoProfile } from './context/repoProfile.js'
export {
  loadRepoProfile,
  repoProfileSchema,
  REPO_PROFILE_RELATIVE_PATH,
} from './context/repoProfile.js'

export { runAgentLoop, deriveLoopRunStatus } from './loop/agentLoop.js'
export type {
  AgentLoopResult,
  AgentLoopOptions,
  LoopIterationLog,
  LoopRunStatus,
} from './loop/agentLoop.js'

export {
  runLoopBatch,
  loadLoopBatchConfig,
  parseLoopBatchConfig,
  loopBatchConfigSchema,
  batchLoopEntrySchema,
  normalizeBatchLoopEntry,
} from './loop/loopBatch.js'
export type {
  LoopBatchResult,
  RunLoopBatchOptions,
  LoopBatchConfig,
  BatchLoopEntry,
} from './loop/loopBatch.js'

export { runMetaLoop, metaLoopConfigSchema } from './loop/loopMeta.js'
export { batchLoopConfig, batchLoopConfig as metaBatchLoopConfig } from './loop/loopBatchConfig.js'
export type { MetaLoopConfig, MetaLoopResult } from './loop/loopMeta.js'

export { LOOP_MODE_FORWARD, LOOP_MODE_REVERSE, loopModeSchema } from './loop/loopMode.js'
export type { LoopMode } from './loop/loopMode.js'

export {
  appendFailureDomain,
  failureDomainsPath,
  logFailureDomainFromVerify,
  FAILURE_DOMAINS_FILENAME,
} from './loop/loopFailureDomain.js'
export type { FailureDomainEntry, FailureDomainReason, FailureDomainStatus } from './loop/loopFailureDomain.js'

export { isTrivialVerifyCommand, trivialVerifyWarning } from './loop/trivialVerify.js'

export {
  guidePacketsFromReview,
  guidePacketFromBlocker,
  formatGuidePacketsForPrompt,
} from './review/guidePackets.js'
export type { GuidePacket } from './review/guidePackets.js'

export {
  writeFailureContext,
  readFailureContext,
  failureContextPath,
  FAILURE_CONTEXT_FILENAME,
} from './loop/loopFailureContext.js'

export { pauseForContinue } from './loop/loopPause.js'

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
  LOOP_RUNTIME_CLINE,
  resolveLoopAgent,
  resolveReviewModel,
  resolveSecondaryReviewAgent,
  isClineSdkRuntime,
  CLINE_PASS_LOOP_MODELS,
  CURSOR_WORKER_MODEL,
  CURSOR_REVIEW_MODEL,
  CURSOR_LOOP_MODEL,
  DEFAULT_CLINE_CREDITS_LOOP_MODEL,
  DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
} from './loop/loopAgentConfig.js'

export { runVerifyCommand } from './loop/loopVerify.js'
export type { VerifyResult } from './loop/loopVerify.js'

export { buildAgentLoopPrompt } from './loop/loopPrompt.js'
export { detectStagnation } from './loop/loopStagnation.js'
export { validateGoalPreflight } from './loop/loopPreflight.js'
export { inferLoopReviewRisk, resolvePostQualityReview, resolveShouldRunQualityReview } from './loop/loopRisk.js'
export type { LoopReviewRisk, LoopRiskInferenceContext, PostQualityReviewSetting } from './loop/loopRisk.js'
export {
  DEFAULT_LOOP_RISK_KEYWORDS,
  LOOP_RISK_INFERENCE_SECTION,
  buildRiskTriageStepFromKeywords,
  inferLoopReviewRiskWithProfile,
  keywordsToRiskPattern,
  parseLoopRiskKeywordsFromReviewsMd,
  resolveLoopRiskKeywords,
} from './loop/loopRiskProfile.js'
export type { LoopRiskKeywords, LoopRiskProfileOverride } from './loop/loopRiskProfile.js'

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
  resolveReviewOutputPath,
  listChangedPathsSinceBranchBase,
  gitDiffStatSinceBranchBase,
} from './review/loopPostReview.js'
export type { PostLoopReviewOptions, PostLoopReviewResult } from './review/loopPostReview.js'

export {
  applyReproduceBeforeReportFilter,
  applyAgentReproduceKeepList,
  extractFileCitations,
  pathIsInChangedSet,
  blockerMatchKey,
  gatingBlockerMergeKey,
  mergePrimarySecondaryReviews,
  formatSecondaryMergeFooter,
} from './review/reviewReproduce.js'

export { buildReproduceCandidatesPrompt } from './review/reviewPrompt.js'

export {
  parseReviewMarkdown,
  parseBlockerItem,
  formatBlockerLine,
  isBlockingBlocker,
  blockingBlockers,
  warningBlockers,
  reviewVerdictAllowsCompletion,
  reviewGateBlockers,
  reviewGateBlocksCompletion,
  BLOCKER_IMPACT_TAGS,
  UNPARSEABLE_VERDICT_BLOCKER,
} from './review/reviewVerdict.js'
export type {
  ParsedReview,
  ParsedBlocker,
  ReviewRisk,
  ReviewVerdict,
  BlockerSeverity,
  BlockerImpact,
  BlockerImpactTag,
} from './review/reviewVerdict.js'

export {
  discoverLoopBundles,
  collectLoopArtifacts,
  isLoopBundleDir,
  runMetaReview,
  resolveMetaReviewOutputPath,
  extractHitlFollowUpBullets,
  parseTaskAddDescription,
  createHitlTasksFromFollowUps,
  extractMarkdownSection,
} from './review/metaReview.js'
export type { MetaReviewOptions, MetaReviewResult } from './review/metaReview.js'

export {
  buildMetaReviewPrompt,
  loadMetaReviewPromptBrief,
  resolveMetaReviewPromptPath,
  META_REVIEW_PROMPT_RELATIVE,
} from './review/metaReviewPrompt.js'

export {
  addUsageRecord,
  createUsageRecord,
  emptyUsageSummary,
  estimateCostUsd,
  formatUsageSummaryLine,
  logUsageSummary,
  mergeUsageSummaries,
  MODEL_PRICING_PER_MILLION,
  summarizeUsageRecords,
} from './usage/loopUsage.js'
export type { AgentRunPhase, LoopUsageRecord, LoopUsageSummary } from './usage/loopUsage.js'

export {
  checkModelPricingDrift,
  collectModelPricingDriftIssues,
  formatModelPricingDriftReport,
  requiredLoopPricingModels,
} from './usage/modelPricingDrift.js'
export type { ModelPricingDriftIssue } from './usage/modelPricingDrift.js'

export {
  assertShellConfigTrusted,
  collectShellCommandWarnings,
  formatTrustConfigRequiredError,
  isShellConfigTrusted,
  isTrustConfigRequired,
  warnShellCommandsFromConfig,
  AGENT_LOOP_TRUST_CONFIG_ENV,
  AGENT_LOOP_REQUIRE_TRUST_CONFIG_ENV,
} from './loop/loopShellTrust.js'
export type { ShellCommandWarning, ShellTrustInput } from './loop/loopShellTrust.js'

export { assertLoopModelAllowed, assertCursorSdkModelAllowed, isBannedCursorLoopModel } from './usage/modelPolicy.js'

export {
  sendLoopTelegramReport,
  sendLoopTelegramReviewAttachment,
  sendTelegramMessage,
  sendTelegramDocument,
  resolveTelegramCredentials,
  shouldSendTelegramNotify,
  shouldAttachTelegramReview,
  describeTelegramSkipReason,
  TELEGRAM_BOT_TOKEN_ENV,
  TELEGRAM_BOT_TOKEN_FALLBACK_ENV,
  TELEGRAM_CHAT_ID_ENV,
} from './integrations/telegramNotify.js'

export {
  loopExtensionFieldsSchema,
  siblingRepoSchema,
  verifyLogModeSchema,
  detectExternalVerifierPaths,
  validateLoopExtensionPreflight,
  formatLoopExtensionPreflight,
  persistVerifyOutput,
  runPostVerifierExtensionHooks,
} from './loop/loopExtensions.js'
export type {
  SiblingRepoRef,
  VerifyLogMode,
  VerifyLogRefs,
  LoopExtensionPreflightResult,
} from './loop/loopExtensions.js'

export {
  formatLoopCompletionReport,
  formatBatchCompletionReport,
} from './loop/loopReport.js'

export {
  RUN_REPORT_FILENAME,
  TRANSCRIPT_FILENAME,
  buildRunReportMarkdown,
  writeRunReportArtifacts,
  readLoopLogEntries,
  readTranscriptEvents,
  reconstructAgentLoopResultFromLog,
} from './loop/loopRunReport.js'
