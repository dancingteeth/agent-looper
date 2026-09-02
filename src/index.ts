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
  findRepoRootWithProfile,
  loadLoopDefaultsForDir,
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
  readFailureDomainEntries,
  FAILURE_DOMAINS_FILENAME,
  AGENT_SDK_VERIFY_COMMAND,
} from './loop/loopFailureDomain.js'
export type { FailureDomainEntry, FailureDomainReason, FailureDomainStatus } from './loop/loopFailureDomain.js'

export { isTrivialVerifyCommand, trivialVerifyWarning } from './loop/trivialVerify.js'
export {
  lintVerifyScript,
  formatVerifyScriptLintMessage,
  verifyScriptLintWarning,
} from './loop/verifyScriptLint.js'
export { formatLoopResumeCommand } from './loop/loopResumeCommand.js'

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
  applyLoopDefaults,
  pickLoopDefaults,
  LOOP_JSON_ONLY_KEYS,
} from './loop/loopDefaults.js'

export {
  applyCostPreset,
  resolveCostPreset,
  describeCostPreset,
  isCostPreset,
  COST_PRESET_VALUES,
  COST_PRESET_CUSTOM,
  costPresetStackSchema,
  userCostPresetsCatalogSchema,
} from './loop/costPreset.js'
export type { CostPreset, CostPresetStack } from './loop/costPreset.js'

export {
  detectLoopRuntimes,
  emptyDetection,
  detectionOf,
  isRuntimeDetected,
} from './cli/detectRuntimes.js'
export type { DetectionResult, DetectableRuntime } from './cli/detectRuntimes.js'

export {
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_VALUES,
  resolveLoopAgent,
  resolveReviewAgent,
  resolveReviewModel,
  resolveSecondaryReviewAgent,
  isClineSdkRuntime,
  runtimeHonorsReasoningEffort,
  toPiThinkingLevel,
  isOpencodeRuntime,
  isCodexRuntime,
  isDshRuntime,
  isMuseRuntime,
  parseOpencodeGoModel,
  parseOpencodeModel,
  parseProviderModel,
  isOpencodeLoopModel,
  isPiLoopModel,
  isCodexLoopModel,
  isDshLoopModel,
  isMuseLoopModel,
  isPiRuntime,
  isOpencodeGoModel,
  CLINE_PASS_LOOP_MODELS,
  OPENCODE_GO_LOOP_MODELS,
  CURSOR_WORKER_MODEL,
  CURSOR_REVIEW_MODEL,
  CURSOR_LOOP_MODEL,
  DEFAULT_CLINE_CREDITS_LOOP_MODEL,
  DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
  DEFAULT_OPENCODE_GO_LOOP_MODEL,
  DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_LOOP_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  DEFAULT_CODEX_LOOP_MODEL,
  DEFAULT_CODEX_ESCALATE_MODEL,
  DEFAULT_CODEX_REVIEW_MODEL,
  DEFAULT_DSH_LOOP_MODEL,
  DEFAULT_DSH_ESCALATE_MODEL,
  DEFAULT_DSH_REVIEW_MODEL,
  DEFAULT_MUSE_LOOP_MODEL,
  DEFAULT_MUSE_REVIEW_MODEL,
} from './loop/loopAgentConfig.js'
export type { ResolvedLoopAgent, ResolvedReviewAgent, LoopRuntime } from './loop/loopAgentConfig.js'

export { runVerifyCommand } from './loop/loopVerify.js'
export type { VerifyResult } from './loop/loopVerify.js'

export { buildAgentLoopPrompt } from './loop/loopPrompt.js'
export {
  loadLoopResearchSection,
  RESEARCH_FILENAME,
  resolveLoopResearchRelativePath,
} from './loop/loopResearch.js'
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

export {
  runCursorAgentPrompt,
  resolveCursorSessionTimeoutMs,
  AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV,
} from './agents/cursorAgent.js'
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
  resolvePostLoopReviewAgent,
  listChangedPathsSinceBranchBase,
  gitDiffStatSinceBranchBase,
} from './review/loopPostReview.js'
export type { PostLoopReviewOptions, PostLoopReviewResult } from './review/loopPostReview.js'

export { runReviewAgentPrompt } from './review/reviewAgentRun.js'

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
  lastPhaseCostUsd,
  nextCallFitsBudget,
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
  preflightTelegramNotify,
  shouldPreflightTelegram,
  wantsTelegramFailureNotify,
  TELEGRAM_BOT_TOKEN_ENV,
  TELEGRAM_BOT_TOKEN_FALLBACK_ENV,
  TELEGRAM_CHAT_ID_ENV,
} from './integrations/telegramNotify.js'
export type { TelegramPreflightResult } from './integrations/telegramNotify.js'

export {
  maybeCreateIncompleteLoopHitl,
  buildLoopFailureHitlDescription,
} from './integrations/loopFailureVisibility.js'

export {
  LOOP_COMPLETION_SIGNAL_PREFIX,
  LOOP_NO_COMPLETION_SIGNAL_ENV,
  emitLoopCompletionSignal,
  exitWithLoopCompletionSignal,
  formatLoopCompletionSignalLine,
  runReportSignalPath,
  shouldEmitLoopCompletionSignal,
} from './integrations/loopCompletionSignal.js'
export type { LoopCompletionSignalPayload } from './integrations/loopCompletionSignal.js'

export {
  resolveNotifyCommand,
  runLoopNotifyCommand,
  NOTIFY_COMMAND_TIMEOUT_MS,
} from './integrations/loopNotifyCommand.js'
export type {
  LoopNotifyCommandKind,
  RunLoopNotifyCommandInput,
} from './integrations/loopNotifyCommand.js'

export {
  LOOP_EXPORTS_DIRNAME,
  writeLoopExportPack,
  readLoopExportPackArtifacts,
  resolveLoopExportDir,
  resolveExistingExportPackRels,
} from './integrations/loopExportPack.js'
export type { LoopExportMeta, WriteLoopExportPackResult } from './integrations/loopExportPack.js'

export {
  sendNotifyWebhook,
  postLoopPrComment,
  formatLoopPrCommentBody,
  redactWebhookUrlForLog,
  NOTIFY_WEBHOOK_URL_ENV,
  NOTIFY_WEBHOOK_TIMEOUT_MS,
  NOTIFY_PR_NUMBER_ENV,
} from './integrations/loopNotifyChannels.js'
export type { NotifyWebhookPayload, NotifyWebhookSettings } from './integrations/loopNotifyChannels.js'

export {
  postLoopCompletionChannels,
} from './integrations/loopCompletionChannels.js'

export {
  loopExtensionFieldsSchema,
  siblingRepoSchema,
  verifyLogModeSchema,
  skillDisclosureSchema,
  SKILL_DISCLOSURE_INDEX,
  SKILL_DISCLOSURE_INLINE,
  detectExternalVerifierPaths,
  validateLoopExtensionPreflight,
  formatLoopExtensionPreflight,
  persistVerifyOutput,
  runPostVerifierExtensionHooks,
  VERIFY_SIDECAR_DIR,
} from './loop/loopExtensions.js'
export type {
  SiblingRepoRef,
  VerifyLogMode,
  SkillDisclosure,
  VerifyLogRefs,
  VerifySidecarStem,
  LoopExtensionPreflightResult,
} from './loop/loopExtensions.js'

export {
  AGENT_PLUGINS_PLUGIN_SCHEMA_ID,
  parseAgentPluginManifest,
  discoverAgentPluginSkillPaths,
  loadAgentPlugin,
  loadConfiguredAgentPlugins,
} from './plugins/agentPluginsLoad.js'
export type { AgentPluginManifest, LoadedAgentPlugin } from './plugins/agentPluginsLoad.js'

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
export {
  buildLoopRunScoreboard,
  formatScoreboardMarkdown,
  formatScoreboardTelegramLine,
  isAgentSdkVerify,
} from './loop/loopRunScoreboard.js'
