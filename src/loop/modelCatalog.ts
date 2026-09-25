/**
 * Runtime ids, model slug constants, and per-provider model-shape validators.
 * Pure data + predicates — no config resolution here (see runtimeSpec.ts / loopAgentConfig.ts).
 */

import {
  CLINE_PASS_LOOP_MODELS,
  OPENCODE_GO_LOOP_MODELS,
} from './modelCatalog.generated.js'

export { CLINE_PASS_LOOP_MODELS, OPENCODE_GO_LOOP_MODELS } from './modelCatalog.generated.js'

export const LOOP_RUNTIME_CURSOR = 'cursor' as const
export const LOOP_RUNTIME_CLINE_PASS = 'cline-pass' as const
/** Cline usage-billing (pay-as-you-go credits). Same SDK/API key as ClinePass. */
export const LOOP_RUNTIME_CLINE = 'cline' as const
/** OpenCode worker (`provider/model` — Go subscription, OpenRouter / Vercel BYOK, Ollama, …). */
export const LOOP_RUNTIME_OPENCODE = 'opencode' as const
/** Pi coding agent (`@earendil-works/pi-coding-agent`) — BYOK `provider/model` (not opencode-go). */
export const LOOP_RUNTIME_PI = 'pi' as const
/** OpenAI Codex (`@openai/codex-sdk`) — Codex CLI model slugs (e.g. gpt-5.6-luna). */
export const LOOP_RUNTIME_CODEX = 'codex' as const
/** DeepSeek Harness worker — spawn `dsh --profile headless` (PATH CLI, no npm dep). */
export const LOOP_RUNTIME_DSH = 'dsh' as const
/** Muse Code (`@muse-code/sdk` + PATH `muse serve`) — Muse Spark slugs (e.g. muse-spark-1.3). */
export const LOOP_RUNTIME_MUSE = 'muse' as const
/** Claude Code — spawn PATH `claude -p` (subscription login; no Agent SDK). */
export const LOOP_RUNTIME_CLAUDE = 'claude' as const

/** Canonical runtime ids — CLI flags, loop.json, and `loopRuntimeSchema` share this list. */
export const LOOP_RUNTIME_VALUES = [
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_CLAUDE,
] as const

export type LoopRuntime = (typeof LOOP_RUNTIME_VALUES)[number]
export type NonCursorLoopRuntime = Exclude<LoopRuntime, typeof LOOP_RUNTIME_CURSOR>

export const CURSOR_LOOP_MODEL = 'composer-2.5' as const
/** Alias — Cursor SDK worker for implement iterations (never Composer Fast). */
export const CURSOR_WORKER_MODEL = CURSOR_LOOP_MODEL
/**
 * Cursor SDK judge for post-loop / review-gate runs.
 * Confirm via `Cursor.models.list()` if your account uses a different id.
 */
export const CURSOR_REVIEW_MODEL = 'grok-4.7' as const

export const CURSOR_REVIEW_MODELS = [
  CURSOR_REVIEW_MODEL,
  'grok-4.6',
  'grok-4.5',
  CURSOR_WORKER_MODEL,
] as const
export type CursorReviewModel = (typeof CURSOR_REVIEW_MODELS)[number]
export type CursorSdkModel = typeof CURSOR_WORKER_MODEL | CursorReviewModel

export type ClinePassLoopModel = (typeof CLINE_PASS_LOOP_MODELS)[number]

export const DEFAULT_CLINE_PASS_LOOP_MODEL: ClinePassLoopModel = 'cline-pass/deepseek-v4.1-flash'
export const DEFAULT_CLINE_PASS_ESCALATE_MODEL: ClinePassLoopModel = 'cline-pass/qwen3.7-plus'

/** Default OpenRouter-style id for Cline credits (usage-billing). https://docs.cline.bot/api/models */
export const DEFAULT_CLINE_CREDITS_LOOP_MODEL = 'deepseek/deepseek-chat'
/** Mid-tier escalate recommendation for credits (Qwen coder — avoid Gemini in the default stack). */
export const DEFAULT_CLINE_CREDITS_ESCALATE_MODEL = 'qwen/qwen3-coder-plus'

/** OpenCode Go / ClinePass model id after the provider prefix. */
const GO_CLINE_PASS_MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/

export type OpencodeGoLoopModel = (typeof OPENCODE_GO_LOOP_MODELS)[number]

export const DEFAULT_OPENCODE_GO_LOOP_MODEL: OpencodeGoLoopModel = 'opencode-go/deepseek-v4.1-flash'
export const DEFAULT_OPENCODE_GO_ESCALATE_MODEL: OpencodeGoLoopModel = 'opencode-go/qwen3.7-plus'
/** Default OpenCode judge — DeepSeek V4 Pro (not Flash; Grok on Go tracks models.dev, currently 4.7). */
export const DEFAULT_OPENCODE_GO_REVIEW_MODEL: OpencodeGoLoopModel = 'opencode-go/deepseek-v4-pro'

/**
 * OpenRouter hosted $0 BYOK slugs (`OPENROUTER_API_KEY`). Valid on OpenCode and Pi.
 * Not minmax. Skip NVIDIA `:free` (prompt logging). Usual named stack: `or-free`.
 */
export const OPENROUTER_FREE_WORKER_MODEL = 'openrouter/minimax/minimax-m3:free'
export const OPENROUTER_FREE_REVIEW_MODEL = 'openrouter/poolside/laguna-s-2.1:free'
export const OPENROUTER_FREE_LOOP_MODELS = [
  OPENROUTER_FREE_WORKER_MODEL,
  OPENROUTER_FREE_REVIEW_MODEL,
] as const

/** Default Pi worker — OpenRouter DeepSeek (same shape as Cline credits). */
export const DEFAULT_PI_LOOP_MODEL = 'openrouter/deepseek/deepseek-chat'
export const DEFAULT_PI_ESCALATE_MODEL = 'openrouter/qwen/qwen3-coder-plus'

/** Default Codex worker — Luna (cheap); escalate to Terra (balanced). Catalog: openai/codex models.json */
export const DEFAULT_CODEX_LOOP_MODEL = 'gpt-5.6-luna'
export const DEFAULT_CODEX_ESCALATE_MODEL = 'gpt-5.6-terra'
/** Default Codex judge — Sol (frontier agentic coding). */
export const DEFAULT_CODEX_REVIEW_MODEL = 'gpt-5.6-sol'
/** Optional Codex model — most capable slug in the CLI catalog. Not the default judge. */
export const CODEX_ASTRA_MODEL = 'gpt-6-astra'

/** Previous DSH Flash. Still accepted; the worker default is 4.1. */
export const DSH_V4_FLASH_LOOP_MODEL = 'deepseek-official/deepseek-v4-flash'
/** Default DSH worker — official DeepSeek 4.1 Flash (`DeepSeek-V41-Flash`, image-capable). */
export const DEFAULT_DSH_LOOP_MODEL = 'deepseek-official/deepseek-flash'
/** Alias of the DSH worker default. */
export const DSH_41_FLASH_LOOP_MODEL = DEFAULT_DSH_LOOP_MODEL
/** Experimental vision Flash. DSH `read_image` works once the catalog row sets `inputModalities: [text, image]`. */
export const DSH_VISION_LOOP_MODEL = 'deepseek-official/deepseek-v4-flash-vision-exp'
export const DEFAULT_DSH_ESCALATE_MODEL = 'deepseek-official/deepseek-v4-pro'
/** Default DSH judge — V4 Pro (same split as Flash worker / Pro judge). */
export const DEFAULT_DSH_REVIEW_MODEL = 'deepseek-official/deepseek-v4-pro'

/** Default Muse worker — Spark 1.3 contributor (CLI login / discounted tokens). */
export const DEFAULT_MUSE_LOOP_MODEL = 'muse-spark-1.3-contributor'
/** Default Muse judge — PAYG Spark 1.3 (same weights as contributor; billing/privacy, not a stronger model). */
export const DEFAULT_MUSE_REVIEW_MODEL = 'muse-spark-1.3'
/** Prior Spark 1.2 slugs the adapter still prices and accepts. */
export const MUSE_SPARK_1_2_LOOP_MODEL = 'muse-spark-1.2-contributor'
export const MUSE_SPARK_1_2_REVIEW_MODEL = 'muse-spark-1.2'
/** Prior Spark slug the adapter still prices and accepts. */
export const MUSE_SPARK_1_1_MODEL = 'muse-spark-1.1'

/** Default Claude Code worker — latest Sonnet alias. */
export const DEFAULT_CLAUDE_LOOP_MODEL = 'sonnet'
export const DEFAULT_CLAUDE_ESCALATE_MODEL = 'opus'
/** Default Claude judge — Opus (stronger than Sonnet worker). Menu also lists `fable`. */
export const DEFAULT_CLAUDE_REVIEW_MODEL = 'opus'
export const CLAUDE_HAIKU_MODEL = 'haiku'
export const CLAUDE_FABLE_MODEL = 'fable'

/** Codex CLI model slug (not provider/model). */
const CODEX_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/

/** Muse Spark model id (not provider/model). */
const MUSE_MODEL_RE = /^muse-spark-[0-9]+(\.[0-9]+)?(-[a-z0-9]+)?$/

/** Claude Code CLI alias or full `claude-…` id (not provider/model). */
const CLAUDE_ALIAS_RE = /^(haiku|sonnet|opus|fable|best|default|opusplan)(\[1m\])?$/
const CLAUDE_FULL_RE = /^claude-[a-zA-Z0-9][a-zA-Z0-9._-]*$/

/** OpenRouter-style `provider/model` (Cline usage-billing / API). */
const CLINE_CREDITS_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

/** OpenCode / Pi `provider/model` shape (BYOK). Go slugs use a separate curated list. */
const OPENCODE_BYOK_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._/:-]*$/

/** Reasoning-effort dial (`low`…`xhigh` | `none`). Honored per runtime via `runtimeHonorsReasoningEffort`. */
export const LOOP_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'none'] as const
export type LoopReasoningEffort = (typeof LOOP_REASONING_EFFORTS)[number]

/** Pi `thinkingLevel` values we map onto. Unset and `none` are both `off` — no hidden default. */
export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Map loop.json `reasoningEffort` onto Pi thinking. Omit/`none` → off (do not leak the SDK default). */
export function toPiThinkingLevel(effort: LoopReasoningEffort | undefined): PiThinkingLevel {
  switch (effort) {
    case undefined:
    case 'none':
      return 'off'
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return effort
    default: {
      const _exhaustive: never = effort
      return _exhaustive
    }
  }
}

export function isCursorReviewModel(model: string): model is CursorReviewModel {
  return (CURSOR_REVIEW_MODELS as readonly string[]).includes(model)
}

export function isCursorSdkModel(model: string): model is CursorSdkModel {
  return model === CURSOR_WORKER_MODEL || isCursorReviewModel(model)
}

export function isOpencodeGoModelShape(model: string): boolean {
  if (!model.startsWith('opencode-go/')) return false
  const id = model.slice('opencode-go/'.length)
  return id.length > 0 && GO_CLINE_PASS_MODEL_ID_RE.test(id)
}

export function isClinePassModelShape(model: string): boolean {
  if (!model.startsWith('cline-pass/')) return false
  const id = model.slice('cline-pass/'.length)
  return id.length > 0 && GO_CLINE_PASS_MODEL_ID_RE.test(id)
}

export function isClinePassModel(model: string): model is ClinePassLoopModel {
  return (CLINE_PASS_LOOP_MODELS as readonly string[]).includes(model)
}

export function isOpencodeGoModel(model: string): model is OpencodeGoLoopModel {
  return (OPENCODE_GO_LOOP_MODELS as readonly string[]).includes(model)
}

export function isClineCreditsModelShape(model: string): boolean {
  return CLINE_CREDITS_MODEL_RE.test(model) && !model.startsWith('cline-pass/')
}

/** Split `provider/model` (OpenCode / Pi) for the SDK prompt body. */
export function parseProviderModel(model: string): {
  providerID: string
  modelID: string
} {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(
      `Invalid provider/model "${model}". Expected provider/model ` +
        `(e.g. "${DEFAULT_OPENCODE_GO_LOOP_MODEL}" or "openrouter/deepseek/deepseek-chat"). ` +
        `See https://opencode.ai/docs/providers/`,
    )
  }
  return {
    providerID: model.slice(0, slash),
    modelID: model.slice(slash + 1),
  }
}

/** @deprecated Use {@link parseProviderModel}. */
export const parseOpencodeModel = parseProviderModel

/** @deprecated Use {@link parseProviderModel}. */
export const parseOpencodeGoModel = parseProviderModel

export function isOpencodeLoopModelShape(model: string): boolean {
  if (!OPENCODE_BYOK_MODEL_RE.test(model)) return false
  if (model.startsWith('cline-pass/')) return false
  return true
}

/** Valid `loop.json` model for runtime `pi` (BYOK; excludes opencode-go gateway slugs). */
export function isPiLoopModel(model: string): boolean {
  if (!isOpencodeLoopModelShape(model)) return false
  if (model.startsWith('opencode-go/') || model.startsWith('cline-pass/')) return false
  return true
}

/** Valid `loop.json` model for runtime `codex` (Codex CLI slug). */
export function isCodexLoopModel(model: string): boolean {
  if (!CODEX_MODEL_RE.test(model)) return false
  if (model.includes('/')) return false
  if (model.toLowerCase().includes('fast')) return false
  return true
}

/** Valid `loop.json` model for runtime `dsh` (`provider/model` for headless agent-default-model). */
export function isDshLoopModel(model: string): boolean {
  if (!isOpencodeLoopModelShape(model)) return false
  if (model.startsWith('opencode-go/') || model.startsWith('cline-pass/')) return false
  return true
}

/** Valid `loop.json` model for runtime `muse` (Muse Spark slug). */
export function isMuseLoopModel(model: string): boolean {
  if (!MUSE_MODEL_RE.test(model)) return false
  if (model.includes('/')) return false
  if (model.toLowerCase().includes('fast')) return false
  return true
}

/** Valid `loop.json` model for runtime `claude` (Claude Code alias or `claude-…` id). */
export function isClaudeLoopModel(model: string): boolean {
  if (model.includes('/')) return false
  if (model.toLowerCase().includes('fast')) return false
  return CLAUDE_ALIAS_RE.test(model) || CLAUDE_FULL_RE.test(model)
}

/** Valid `loop.json` model for runtime `opencode`. */
export function isOpencodeLoopModel(model: string): boolean {
  if (!isOpencodeLoopModelShape(model)) return false
  const { providerID } = parseProviderModel(model)
  if (providerID === 'opencode-go') return isOpencodeGoModelShape(model)
  return true
}
