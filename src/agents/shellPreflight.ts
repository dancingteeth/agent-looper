import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function assertPosixShell(): Promise<void> {
  try {
    await execFileAsync('sh', ['-c', 'echo agent-loop-shell-ok'], { encoding: 'utf8' })
  } catch {
    throw new Error(
      'Shell preflight failed (sh unavailable). Agent loops require a working POSIX shell.',
    )
  }
}
