import { describe, expect, it } from 'vitest'
import {
  importOptionalPeer,
  isOptionalPeerModuleNotFound,
  missingOptionalPeerMessage,
} from './optionalPeer.js'

describe('optionalPeer', () => {
  it('formats install hints for one package', () => {
    expect(missingOptionalPeerMessage('cursor', '@cursor/sdk')).toBe(
      'Runtime "cursor" needs @cursor/sdk: pnpm add -D @cursor/sdk',
    )
  })

  it('formats install hints for multiple packages', () => {
    expect(missingOptionalPeerMessage('opencode', ['@opencode-ai/sdk', 'opencode-ai'])).toBe(
      'Runtime "opencode" needs @opencode-ai/sdk + opencode-ai: pnpm add -D @opencode-ai/sdk opencode-ai',
    )
  })

  it('requires the peer specifier in the error message when provided', () => {
    expect(
      isOptionalPeerModuleNotFound(
        Object.assign(new Error('Cannot find package some-transitive-dep'), {
          code: 'ERR_MODULE_NOT_FOUND',
        }),
        '@cursor/sdk',
      ),
    ).toBe(false)
    expect(
      isOptionalPeerModuleNotFound(
        new Error("Cannot find package '@cursor/sdk' imported from /x/y.js"),
        '@cursor/sdk',
      ),
    ).toBe(true)
    expect(isOptionalPeerModuleNotFound({ code: 'ERR_MODULE_NOT_FOUND' }, '@cursor/sdk')).toBe(
      false,
    )
  })

  it('rethrows importOptionalPeer with a friendly message', async () => {
    await expect(
      importOptionalPeer(
        '@dancingteeth/agent-looper-optional-peer-missing-fixture',
        'cursor',
        '@cursor/sdk',
      ),
    ).rejects.toThrow('Runtime "cursor" needs @cursor/sdk:')
  })
})
