---
tags:
  - documentation
  - clueso
  - product-video
  - marketing
---
# Clueso product video recipe (aeogeo + looper)

**Status:** planning / runbook only. Not executed. Needs Clueso MCP (`https://connect.clueso.io/mcp`) + real screen captures of each product.

**Verdict:** best path is **screen capture of the real product → Clueso compositor polish**, not `generate_media`-first. AI fills voice + callouts; the product UI stays true. Clueso is a structured timeline (clips / elements / keyframes), with generative pockets for TTS, stills, and prompt-to-animation — not one-shot generative video.

Date: 2026-09-28. Based on [Clueso MCP setup](https://help.clueso.io/mcp-setup).

## Shared recipe

1. **Script 4–6 beats** (problem → one demo path → payoff). Keep option sets narrow; one persona per cut.
2. **Record the UI**
   - Preferred if on plan: MCP `record_screen` with a scene list (one clip per beat + script).
   - Else: Loom/OBS capture → `upload_file` → `add_clips(kind=video)`.
3. **Structure** — `create_project` (16:9 for site/landing; duplicate later to 9:16 for shorts) → `auto_sync` (or manual `add_sync_point`) so zooms land on real UI changes.
4. **Polish (deterministic)** — `add_elements`: zoom / spotlight on the click path, blur anything private, text callouts. Pull house style with `get_design_guide` first so it does not look like a slide deck. Save as a `create_clueprint` once the first cut is good.
5. **Voice last** — `voiceover_batch` + `set_voice`, then nudge timings (`estimate_duration` before heavy keyframes). Do not generate speech before sync or clips will retime under you.
6. **Export** — `export_project` 1080p; clone + `update_project` aspect `9:16` for social.

Skip generative b-roll for these two products: fake UI confuses buyers. Use `generate_media` only for a cold open / diagram if the product screen is empty.

## Practical order

Ship **looper first** (clearer before/after), reuse the clueprint shell for aeogeo (same voice, brand, export settings). Two projects from one clueprint beats two from-scratch generative videos.

## MCP tools used (cheat sheet)

| Step | Tools |
|------|--------|
| Browse / assets | `find`, `upload_file`, `check_uploads` |
| Project | `create_project`, `get_project`, `update_project`, `duplicate_project` |
| Clips | `add_clips`, `update_clips`, `split_clip`, `get_clip` |
| Polish | `get_design_guide`, `add_elements`, `update_elements`, `get_element_schema` |
| Sync | `auto_sync`, `add_sync_point` |
| Voice / audio | `estimate_duration`, `voiceover_batch`, `set_voice`, `add_audio` |
| Template | `create_clueprint`, `get_clueprint` |
| Out | `export_project` |
| Optional capture | `record_screen` (plan-gated agent) |
| Optional generative | `generate_media` (cold open / diagram only) |

## aeogeo.site

**URL:** https://aeogeo.site (and related dancingteeth AEO surfaces)

**Story:** “ask how you show up in answers → get a concrete next action.”

**Capture:** home → run one real query / skill route → show the resulting skill card or recommendation (not a tour of every nav).

**Callouts:** spotlight the query input + the one output that proves “answer engines,” not SEO blog spam.

**Length:** ~45–75 s. One persona (founder checking ChatGPT / Perplexity visibility).

**Repo note:** live this runbook next to `aeogeo.site` product marketing / docs.

## looper.dancingteeth.net (Agent Looper)

**URL:** https://looper.dancingteeth.net/

**Story:** “frozen goal + check → fresh worker each round until green.”

**Capture:** start a loop (goal + check visible) → one failing round → one green round → stop. Show the harness UI, not abstract agent chat.

**Callouts:** zoom the **goal / check / round** chrome; blur API keys / repo paths if needed.

**Length:** ~60–90 s. One concrete check (tests or a named gate), not “AI that codes.”

**Repo note:** live this runbook next to `agent-loop` docs.

## Non-goals

- Do not fake product UI with generative video.
- Do not tour every nav / feature.
- Do not wire Clueso into CI or Agent Looper harness (marketing runbook only).
- Do not replace `video-transcribe` (speech→text) with Clueso.

## Refs

- https://help.clueso.io/mcp-setup
- https://connect.clueso.io/mcp
- https://aeogeo.site
- https://looper.dancingteeth.net/
