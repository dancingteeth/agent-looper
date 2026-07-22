import type { SDKMessage } from '@cursor/sdk'
import type { StreamCollector } from './streamCollect.js'
import { truncateStreamValue as truncate } from './streamFormat.js'

export async function printRunStream(
  stream: AsyncGenerator<SDKMessage, void>,
  options: { verbose: boolean; assistantOutput?: 'stdout' | 'none'; collector?: StreamCollector },
): Promise<void> {
  const assistantOutput = options.assistantOutput ?? 'stdout'
  for await (const event of stream) {
    switch (event.type) {
      case 'system':
        if (options.verbose) {
          console.error(
            `[agent-loop:cursor] system run=${event.run_id} model=${JSON.stringify(event.model ?? null)} tools=${event.tools?.length ?? 0}`,
          )
        }
        options.collector?.recordStatus(`system run=${event.run_id}`)
        break
      case 'request':
        console.error(`[agent-loop:cursor] request_id=${event.request_id}`)
        break
      case 'status':
        console.error(
          `[agent-loop:cursor] ${event.status}${event.message ? `: ${event.message}` : ''}`,
        )
        if (event.message) {
          options.collector?.recordStatus(event.message)
        }
        break
      case 'thinking':
        if (options.verbose) {
          console.error(
            `[agent-loop:cursor] thinking (${event.thinking_duration_ms ?? '?'}ms): ${truncate(event.text, 120)}`,
          )
        }
        options.collector?.recordThinking(event.text, event.thinking_duration_ms)
        break
      case 'task':
        if (options.verbose && event.text) {
          console.error(`[agent-loop:cursor] task ${event.status ?? ''}: ${event.text}`)
        }
        break
      case 'tool_call':
        if (event.status === 'running') {
          console.error(
            `[agent-loop:cursor] tool ▶ ${event.name}${options.verbose ? ` ${truncate(event.args)}` : ''}`,
          )
          options.collector?.recordToolStart(
            event.name,
            options.verbose ? truncate(event.args, 200) : undefined,
          )
        } else if (event.status === 'completed') {
          console.error(
            `[agent-loop:cursor] tool ✓ ${event.name}${options.verbose ? ` → ${truncate(event.result)}` : ''}`,
          )
          options.collector?.recordToolEnd(
            event.name,
            true,
            options.verbose ? truncate(event.result, 200) : undefined,
          )
        } else {
          console.error(
            `[agent-loop:cursor] tool ✗ ${event.name}${options.verbose ? ` → ${truncate(event.result)}` : ''}`,
          )
          options.collector?.recordToolEnd(
            event.name,
            false,
            options.verbose ? truncate(event.result, 200) : undefined,
          )
        }
        break
      case 'assistant':
        for (const block of event.message.content) {
          if (block.type === 'text') {
            if (assistantOutput === 'stdout') {
              process.stdout.write(block.text)
            }
          } else if (options.verbose) {
            console.error(`[agent-loop:cursor] tool plan: ${block.name} ${truncate(block.input)}`)
          }
        }
        break
      case 'user':
        if (options.verbose) {
          const text = event.message.content.map((c) => c.text).join('')
          console.error(`[agent-loop:cursor] user: ${truncate(text, 120)}`)
        }
        break
      default:
        break
    }
  }
}
