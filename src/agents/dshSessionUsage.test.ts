import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decompressConcatenatedZstd,
  dshProjectKey,
  listDshSessionLogPaths,
  pickChangedDshSessionLog,
  readDshSessionLogText,
  readDshSessionUsage,
  sessionIdFromDshLogPath,
  snapshotDshSessionLogs,
  sumDshAssistantMessageUsage,
} from './dshSessionUsage.js'

describe('dshProjectKey', () => {
  it('encodes a POSIX cwd the way DSH groups sessions', () => {
    expect(dshProjectKey('/Users/paulzgordan/Projects/agent-loop')).toBe(
      '--Users-paulzgordan-Projects-agent-loop--',
    )
  })
})

describe('sumDshAssistantMessageUsage', () => {
  it('sums assistant/message usage and ignores stream usage chunks', () => {
    const jsonl = [
      '{"type":"session","id":"abc"}',
      '{"type":"chunk","data":{"type":"usage","usage":{"inputTokens":99,"outputTokens":99}}}',
      '{"type":"assistant/message","data":{"usage":{"inputTokens":10,"outputTokens":4,"cacheReadTokens":8,"reasoningTokens":3}}}',
      '{"type":"assistant/message","data":{"usage":{"inputTokens":2,"outputTokens":1,"cacheReadTokens":1,"reasoningTokens":0}}}',
      'not-json',
    ].join('\n')
    expect(sumDshAssistantMessageUsage(jsonl)).toEqual({
      inputTokens: 12,
      outputTokens: 5,
      cacheReadTokens: 9,
      reasoningTokens: 3,
    })
  })
})

describe('dsh session log files', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('decompresses concatenated zstd frames', () => {
    const a = zlib.zstdCompressSync(Buffer.from('{"type":"session"}\n'))
    const b = zlib.zstdCompressSync(
      Buffer.from(
        '{"type":"assistant/message","data":{"usage":{"inputTokens":100,"outputTokens":20,"cacheReadTokens":0,"reasoningTokens":5}}}\n',
      ),
    )
    const decoded = decompressConcatenatedZstd(Buffer.concat([a, b])).toString('utf8')
    expect(decoded).toContain('"type":"session"')
    expect(decoded).toContain('"inputTokens":100')
    expect(sumDshAssistantMessageUsage(decoded).outputTokens).toBe(20)
  })

  it('picks the session log created after a spawn snapshot', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-'))
    const cwd = '/repo/demo'
    const project = path.join(tmpDir, dshProjectKey(cwd))
    const oldDir = path.join(project, 'session-old')
    const newDir = path.join(project, 'session-new-id')
    fs.mkdirSync(oldDir, { recursive: true })
    fs.mkdirSync(newDir, { recursive: true })
    const oldLog = path.join(oldDir, 'session.jsonl')
    const newLog = path.join(newDir, 'session.jsonl')
    fs.writeFileSync(oldLog, '{"type":"session"}\n')
    const before = snapshotDshSessionLogs(tmpDir, cwd)
    fs.writeFileSync(
      newLog,
      '{"type":"assistant/message","data":{"usage":{"inputTokens":50,"outputTokens":10,"reasoningTokens":2}}}\n',
    )
    expect(pickChangedDshSessionLog(before, listDshSessionLogPaths(tmpDir, cwd))).toBe(newLog)
    expect(sessionIdFromDshLogPath(newLog)).toBe('new-id')
    expect(
      pickChangedDshSessionLog(snapshotDshSessionLogs(tmpDir, cwd), listDshSessionLogPaths(tmpDir, cwd)),
    ).toBeUndefined()

    const captured = readDshSessionUsage({
      sessionsRoot: tmpDir,
      cwd,
      before,
      model: 'deepseek-official/deepseek-v4-pro',
      phase: 'review',
    })
    expect(captured?.sessionId).toBe('new-id')
    expect(captured?.usage.runtime).toBe('dsh')
    expect(captured?.usage.inputTokens).toBe(50)
    expect(captured?.usage.outputTokens).toBe(12)
    expect(captured?.usage.costSource).toBe('estimated')
    expect(captured?.usage.listCostUsd).toBeGreaterThan(0)
    expect(captured?.usage.billedCostUsd).toBeUndefined()
  })

  it('picks a pre-existing log that grew (append) instead of ignoring it', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-grow-'))
    const cwd = '/repo/demo'
    const project = path.join(tmpDir, dshProjectKey(cwd))
    const sessionDir = path.join(project, 'session-reused')
    fs.mkdirSync(sessionDir, { recursive: true })
    const logPath = path.join(sessionDir, 'session.jsonl')
    fs.writeFileSync(logPath, '{"type":"session"}\n')
    const before = snapshotDshSessionLogs(tmpDir, cwd)
    fs.appendFileSync(
      logPath,
      '{"type":"assistant/message","data":{"usage":{"inputTokens":8,"outputTokens":3,"reasoningTokens":1}}}\n',
    )
    expect(pickChangedDshSessionLog(before, listDshSessionLogPaths(tmpDir, cwd))).toBe(logPath)
    const captured = readDshSessionUsage({
      sessionsRoot: tmpDir,
      cwd,
      before,
      model: 'deepseek-official/deepseek-v4-flash',
      phase: 'implement',
    })
    expect(captured?.usage.inputTokens).toBe(8)
    expect(captured?.usage.outputTokens).toBe(4)
  })

  it('reads uncompressed jsonl via readDshSessionLogText', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-plain-'))
    const logPath = path.join(tmpDir, 'session.jsonl')
    fs.writeFileSync(logPath, '{"type":"assistant/message","data":{"usage":{"inputTokens":1,"outputTokens":1}}}\n')
    expect(readDshSessionLogText(logPath)).toContain('inputTokens')
  })
})
