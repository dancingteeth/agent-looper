export function loopScaffoldGuidance(agentLoopBinary: string, rawInput: string): string {
  const nameHint = rawInput.trim()
  const nameLine = nameHint
    ? `Suggested loop name from your input: \`${nameHint}\`.`
    : 'Pick a short kebab-case loop name (for example `fix-auth-flow`).'

  return [
    '# loop-scaffold — Agent Looper bundle',
    '',
    'This command scaffolds a **GOAL.md + verify.sh + loop.json** bundle. Shell `verify` remains the finish line — not DSH `/loop` or `/goal`.',
    '',
    nameLine,
    '',
    '## Steps',
    '',
    `1. Confirm \`@dancingteeth/agent-looper\` is installed (\`pnpm exec ${agentLoopBinary} --help\`). If missing, invoke the **install-agent-looper** skill.`,
    '2. Choose `.cursor/loops/<name>/` **under this session’s workspace** (`pwd`). Pasting another repo path does not change cwd — open `dsh web` from that repo instead.',
    '3. Copy harness templates (`GOAL.template.md`, `verify.example.sh`, `loop.json.example`) or run `pnpm exec agent-loop-init` if the repo has no profile yet.',
    '4. Fill **GOAL.md**: goal, acceptance criteria, constraints, out of scope. Freeze when done.',
    '5. Write **verify.sh** that exits `0` only on real success; keep it repo-local.',
    '6. Set **loop.json** `verify` to that script; choose `runtime` / optional `reviewGate`.',
    '7. Optionally point `plugins` at portable Agent Plugins packages.',
    `8. After freeze, start the grind with bash \`run_in_background: true\` (not foreground — ~60s timeout): \`pnpm exec ${agentLoopBinary} run .cursor/loops/<name>\`. Then \`job_output\` / \`job_kill\`. Load skill **run-loop-in-dsh**. Bare \`doppler run --\` still needs --project/--config if you wrap the command.`,
    '',
    'Do not implement the product or dump secrets. Do not foreground-bash `agent-loop run`.',
  ].join('\n')
}
