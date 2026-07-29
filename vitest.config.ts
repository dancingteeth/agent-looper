import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // CLI entrypoints are side-effecting wiring on import — their logic lives
        // in tested modules (runArgs, runBatchArgs, initGitignore, shared) and the
        // meta-review e2e spawns dist/ as a subprocess (not instrumentable).
        'src/cli/run.ts',
        'src/cli/run-batch.ts',
        'src/cli/init.ts',
        'src/cli/check.ts',
        'src/cli/doctor.ts',
        'src/cli/export-run.ts',
        'src/cli/review-run.ts',
        'src/cli/review-preview.ts',
        'src/cli/meta-review.ts',
      ],
      // Ratchet: thresholds sit ~3 points below current coverage (78/65/86/79 as
      // of the coverage-gate introduction). Raise them as coverage improves;
      // lowering requires a PR discussion. Enforced via `pnpm test:coverage` in CI.
      thresholds: {
        lines: 75,
        branches: 62,
        functions: 84,
        statements: 76,
      },
    },
  },
})
