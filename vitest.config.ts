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
        // Optional peer runtimes — exercised via mocks in agentRunner / reviewAgentRun;
        // body needs live OpenCode / Pi SDKs and would otherwise sit at 0% and sink globals.
        'src/agents/opencodeAgent.ts',
        'src/agents/piAgent.ts',
      ],
      // Ratchet: thresholds sit ~3–4 points below current coverage (84/73/90/85 as
      // of the stream/taskwarrior/pause test expansion). Raise them as coverage
      // improves; lowering requires a PR discussion. Enforced via `pnpm test:coverage` in CI.
      thresholds: {
        lines: 81,
        branches: 69,
        functions: 87,
        statements: 80,
      },
    },
  },
})
