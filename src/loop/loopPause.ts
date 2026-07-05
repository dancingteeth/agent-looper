import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export async function pauseForContinue(iteration: number, maxIterations: number): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error('[agent-loop] pause skipped — stdin is not a TTY')
    return
  }

  const rl = readline.createInterface({ input, output })
  try {
    await rl.question(
      `[agent-loop] iteration ${iteration}/${maxIterations} complete — Press Enter for next iteration (Ctrl+C to stop)... `,
    )
  } finally {
    rl.close()
  }
}
