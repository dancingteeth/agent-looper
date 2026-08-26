---
name: loop-verify
description: Verify cli-setup-detect (runtime probe + dump-before-write).
---

# cli-setup-detect verification

Hard gate: `bash .cursor/loops/cli-setup-detect/verify.sh`

1. Must keep `.cursor/loops/cli-setup-wizard/verify.sh` green
2. Typecheck + setup / detectRuntimes tests
3. `--help` has `--dry-run` and detect wording
4. `--dry-run --answers` prints a dump and writes no files

Do not use `doctor.ts` as the SDK detector. Probe like `src/cli/check.ts`.
