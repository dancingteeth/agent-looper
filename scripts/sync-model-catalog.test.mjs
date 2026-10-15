import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  buildGeneratedBodies,
  diffGenerated,
  transformModelsDevApi,
} from './sync-model-catalog.mjs'

const FIXTURE = {
  'opencode-go': {
    models: {
      hy3: { id: 'hy3', status: null, cost: { input: 0.14, output: 0.58, cache_read: 0.01 } },
      'no-cost': { id: 'no-cost', status: null, cost: null },
      retired: { id: 'retired', status: 'deprecated', cost: { input: 1, output: 2 } },
      zebra: { id: 'zebra', status: 'active', cost: { input: 0.2, output: 0.4 } },
      alpha: { id: 'alpha', status: null, cost: { input: 0.1, output: 0.2, cache_write: 0.3 } },
    },
  },
  'cline-pass': {
    models: {
      'cline-pass/qwen3.7-max': {
        id: 'qwen3.7-max',
        status: null,
        cost: { input: 0.25, output: 0.5 },
      },
      'bare-id': { id: 'bare-id', status: 'stable', cost: { input: 0.3, output: 0.6 } },
    },
  },
}

describe('transformModelsDevApi', () => {
  it('prefixes cline-pass keys, skips null cost and bad status, sorts slugs', () => {
    const { goSlugs, clineSlugs, pricing } = transformModelsDevApi(FIXTURE)
    assert.deepEqual(goSlugs, ['opencode-go/alpha', 'opencode-go/hy3', 'opencode-go/zebra'])
    assert.deepEqual(clineSlugs, ['cline-pass/bare-id', 'cline-pass/qwen3.7-max'])
    assert.equal(pricing['opencode-go/hy3'].cacheRead, 0.01)
    assert.equal(pricing['opencode-go/alpha'].cacheWrite, 0.3)
    assert.equal(pricing['opencode-go/no-cost'], undefined)
    assert.equal(pricing['opencode-go/retired'], undefined)
    assert.equal(pricing['cline-pass/bare-id'].input, 0.3)
  })
})

describe('buildGeneratedBodies', () => {
  it('emits const arrays and pricing record', () => {
    const bodies = buildGeneratedBodies(FIXTURE)
    assert.match(bodies.catalog, /export const OPENCODE_GO_LOOP_MODELS/)
    assert.match(bodies.catalog, /'opencode-go\/hy3'/)
    assert.match(bodies.pricingFile, /GENERATED_MODEL_PRICING/)
    assert.match(bodies.pricingFile, /cacheRead: 0.01/)
  })
})

describe('diffGenerated', () => {
  it('reports slug and price differences', () => {
    const a = buildGeneratedBodies(FIXTURE)
    const b = buildGeneratedBodies({
      ...FIXTURE,
      'opencode-go': {
        models: {
          ...FIXTURE['opencode-go'].models,
          newone: { id: 'newone', status: null, cost: { input: 9, output: 9 } },
        },
      },
    })
    const issues = diffGenerated(
      { catalog: a.catalog, pricing: a.pricingFile },
      { ...b, catalog: b.catalog, pricingFile: b.pricingFile },
    )
    assert.ok(issues.some((line) => line.includes('opencode-go added: opencode-go/newone')))
  })
})

describe('--check committed files', () => {
  it('matches when regenerated from live fixture snapshot', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const catalog = readFileSync(join(root, 'src/loop/modelCatalog.generated.ts'), 'utf8')
    const pricing = readFileSync(join(root, 'src/usage/modelPricing.generated.ts'), 'utf8')
    const bodies = buildGeneratedBodies(JSON.parse(process.env.MODELS_DEV_FIXTURE ?? '{}'))
    if (!process.env.MODELS_DEV_FIXTURE) {
      assert.ok(catalog.length > 0)
      assert.ok(pricing.length > 0)
      return
    }
    const issues = diffGenerated({ catalog, pricing }, bodies)
    assert.deepEqual(issues, [])
  })
})
