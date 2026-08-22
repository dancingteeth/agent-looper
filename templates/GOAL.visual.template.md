---
tags:
  - documentation
  - agents
  - templates
  - frontend
---
# TW — Visual / taste: {page or UI}

**UUID:** `<taskwarrior-uuid>`

Use when a human will *look* at the result (homepage, landing, mockup, screenshot-as-hero, “make it fancy”). Skip for smokes, harness probes, and docs-only chores. Pair with `design-loop` → **Taste / visual loops**.

## Goal

Ship **{artifact path}** that the named audience would keep open. Shell verify is the floor; leftover look is the judge.

## Rejection → restraints

Ask in their language before freeze (defaults in parentheses). Do not ask where files live.

| Ask | This loop |
| --- | --- |
| Who has to like this? | e.g. the artist named in the prompt |
| What would make them close the tab? | slow / wrong mood / missing or ugly art |
| Where must it run? | this machine, phone, no wifi |

Translate. They will not type CSS:

| Close-the-tab | Freeze as |
| --- | --- |
| Slow / fans spin | No full-viewport `canvas` 2D, no `filter: blur()` wallpaper, CSS motion only; `prefers-reduced-motion` |
| Wrong mood | One-line golden mood from the *file* (e.g. B&W street photo ≠ pastel fairy garden). Do not invent a palette if you cannot see the image — ask, or freeze the file facts you have (dimensions, color vs gray). |
| Missing / ugly art | Copy the reference in; crop UI chrome (carousel arrows, status bars); `alt` must not contradict the file |
| No wifi / file:// | No remote fonts, no remote scripts; content visible without JS |

## Finish line (four parts)

| Part | This loop |
| --- | --- |
| **Outcome** | Openable artifact the audience would not immediately close |
| **Scoreboard** | `verify.sh` exit `0` (facts below) |
| **Permission** | `loop.json` `maxIterations` / `stagnationThreshold` |
| **Budget** | Stop when another pass is not worth it — not “until perfect” |

## Golden (critic, not only `img src`)

Path to the reference image **and** one sentence the critic holds the page against (mood, crop, palette). Worker may still *use* the file as hero art.

## verify.sh (facts only)

Exit `0` only when measurable. Examples — keep only what this loop needs:

- Artifact exists and is a real HTML document
- Hero / golden file is a real image and is referenced
- No `https://` stylesheets or script `src`
- No `getContext("2d")` / full-page canvas if “this Mac must stay usable”
- No `lorem ipsum`; branding string present
- `prefers-reduced-motion` block exists if motion is in scope

Do **not** grep for the word `sparkle` as a quality bar.

## VERIFY.skill.md (worker how-to)

One sparkle/motion layer, not five. Match the golden mood. Crop chrome. Progressive enhancement: copy readable with JS off.

## loop.json (referee)

Do **not** copy `postQualityReview: false` or `reviewGate: false` from `*-smoke` / `example-fix`. Omit those keys (`postQualityReview` defaults to `"auto"`). Set `reviewGate: true` when leftover taste should reopen the worker after verify is green.

The harness judge reads GOAL + diff text, not a screenshot. Freeze the golden mood in this file so a text judge can fail the wrong palette. DSH worker `deepseek-official/deepseek-v4-flash-vision-exp` can `read_image` once the catalog row sets `inputModalities: [text, image]` (see [`docs/dsh-runtime.md`](../docs/dsh-runtime.md)).

## Constraints

- Do **not** edit this `GOAL.md` mid-loop.
- Scope: directories you list here.

## Out of scope

- Deploy, extra pages, backends, “until it looks like Dribbble.”
