export type GoalPreflightResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const ACCEPTANCE_PATTERN =
  /acceptance criteria|success is determined|verifier in `loop\.json`|verifier in loop\.json|exit 0|verify command/i

const CONSTRAINT_PATTERN = /## constraints|## patterns|^constraints:|must not|do not /im

const OUT_OF_SCOPE_PATTERN = /out of scope|out-of-scope/i

const MEASURABLE_VERIFY_PATTERN =
  /verify\.sh|VERIFY\.skill|measurable check|numbered step|step \d/i

export function validateGoalPreflight(goal: string): GoalPreflightResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!goal.trim()) {
    errors.push('GOAL.md is empty.')
    return { ok: false, errors, warnings }
  }

  if (!ACCEPTANCE_PATTERN.test(goal)) {
    errors.push(
      'Missing acceptance criteria — add how success is decided (e.g. "Success is determined only by the verifier in loop.json").',
    )
  }

  if (!CONSTRAINT_PATTERN.test(goal)) {
    warnings.push('No constraints section — add ## Constraints (scope limits, patterns to follow).')
  }

  if (!OUT_OF_SCOPE_PATTERN.test(goal)) {
    warnings.push('No out-of-scope section — add ## Out of scope to prevent agent scope creep.')
  }

  if (!MEASURABLE_VERIFY_PATTERN.test(goal)) {
    warnings.push(
      'No measurable verify checklist referenced — add verify.sh / VERIFY.skill.md pointers (see docs/verification-as-skill.md).',
    )
  }

  if (goal.trim().length < 120) {
    warnings.push('GOAL.md is very short — consider adding references and canonical file paths.')
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function formatPreflightMessage(result: GoalPreflightResult): string {
  const lines: string[] = []
  for (const e of result.errors) lines.push(`  error: ${e}`)
  for (const w of result.warnings) lines.push(`  warn: ${w}`)
  return lines.join('\n')
}
