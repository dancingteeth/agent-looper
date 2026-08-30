## DSH (this session)

This chat **freezes the bundle**, then starts the harness as a **background bash job** (skill `run-loop-in-dsh`). Do not implement the product yourself.

Load this skill to freeze. After freeze, load `run-loop-in-dsh` (not all four). Write GOAL + verify + loop.json. **Do not foreground-bash `agent-loop run`** — the companion guard blocks foreground grind (~60s bash timeout). Use bash `run_in_background: true` instead.

Freeze in **this** workspace (`pwd`). Pasting another repo path does not retarget `dsh web`.
