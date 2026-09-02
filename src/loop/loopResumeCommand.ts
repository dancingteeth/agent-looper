/** Wrap `agent-loop run` with Doppler when this process was started via `doppler run`. */
export function formatLoopResumeCommand(
  bundleLabel: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const inner = `agent-loop run ${bundleLabel}`
  const project = env.DOPPLER_PROJECT?.trim()
  const config = env.DOPPLER_CONFIG?.trim()
  if (!project || !config) return inner
  return `doppler run --project ${shellSingleQuote(project)} --config ${shellSingleQuote(config)} -- ${inner}`
}

function shellSingleQuote(value: string): string {
  if (/^[A-Za-z0-9._-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}
