/** Short always-on routing. Keep this prefix-stable and free of `{{…}}` (DSH interpolates those). */
export const AGENT_LOOPER_PROMPT_NAME = 'plugin:agent-looper'
export const AGENT_LOOPER_PROMPT_ORDER = 80

export const agentLooperPromptSection = [
  'Agent Looper companion is loaded. Do not inspect ~/.local/dsh-cli or this plugin source.',
  'Load at most one matching skill (usually design-loop, then run-loop-in-dsh). Do not load all four.',
  'This chat freezes GOAL.md + verify.sh + loop.json. Do not implement the product, SSH-walk production, rsync trees, or test-deploy — that is the Agent Looper worker.',
  'Never dump secrets: no cat ~/.doppler.yaml, no doppler secrets, no OpenCode auth.json, no ~/.dsh/.credentials.yaml, no DOPPLER_TOKEN= from disk. Bare `doppler run --` needs --project and --config (or export KEY=). Use `agent-loop --help`, not --version.',
  'Human command: /loop-scaffold. DSH /loop and /goal are not the finish line.',
  'Freeze the bundle in this session workspace (pwd). Pasting another repo path does not change cwd.',
  'After freeze, start the grind with bash `run_in_background: true` (`agent-loop run …`). Foreground bash times out. Track the job id; use job_output / job_kill. Do not start a second grind while one is running.',
  'Do not copy this GUI\'s opencode-go model into loop.json. Native DeepSeek grind is `runtime: dsh` (omit model, or deepseek-official/…).',
].join('\n')
