import fs from 'node:fs'
import { formatErrorChain } from '../agents/errorFormat.js'

/** Append one JSONL record. Serialization or disk errors are logged, not thrown. */
export function appendJsonlLine(filePath: string, value: unknown): void {
  let line: string
  try {
    line = `${JSON.stringify(value)}\n`
  } catch (err) {
    console.error(
      `[agent-loop] warn: failed to serialize log line (${filePath}): ${formatErrorChain(err)}`,
    )
    return
  }
  try {
    fs.appendFileSync(filePath, line, 'utf8')
  } catch (err) {
    console.error(
      `[agent-loop] warn: failed to append log (${filePath}): ${formatErrorChain(err)}`,
    )
  }
}
