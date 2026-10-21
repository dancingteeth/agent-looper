import { describe, expect, it } from 'vitest'
import {
  importOptionalPeer,
  isOptionalPeerModuleNotFound,
  missingOptionalPeerMessage,
  optionalPeerBasePackage,
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

  it('strips subpath export specifiers to the base package name', () => {
    expect(optionalPeerBasePackage('@earendil-works/pi-ai/compat')).toBe(
      '@earendil-works/pi-ai',
    )
    expect(optionalPeerBasePackage('@cursor/sdk')).toBe('@cursor/sdk')
  })

  it('matches Node quoted missing-package errors to the peer base, not substrings', () => {
    expect(
      isOptionalPeerModuleNotFound(
        new Error("Cannot find package 'some-transitive-dep' imported from /x/y.js"),
        '@cursor/sdk',
      ),
    ).toBe(false)
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

  it('treats a missing Pi peer as the base package when importing a subpath', () => {
    expect(
      isOptionalPeerModuleNotFound(
        new Error(
          "Cannot find package '@earendil-works/pi-ai' imported from /x/piAgent.js",
        ),
        '@earendil-works/pi-ai/compat',
      ),
    ).toBe(true)
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
