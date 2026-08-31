> HISTORIC (2026-08-30): process record, not current. The demo was recorded; the cycle is closed. References a `cuboid-marketing` repo not attached here. Do not cite as current.

# Handoff: Getting the Demo Video to "Marko Radak Level"

> Written 2026-07-09 as a handoff between Claude sessions. Next session should
> have BOTH repos attached: `iddonaim/cuboid-studio` and `iddonaim/cuboid-marketing`.
> Read this in full before touching any video code.

## What prompted this

Iddo shared a Threads post by Marko Radak (@iammarkoradak) — a polished explainer
video for a markdown app called "Ampersand", which Marko says he made with Claude
Code plus "a couple of specialized agents":
https://www.threads.com/@iammarkoradak/post/Daici-QifHa

The video shows an app UI operating itself: a cursor gliding and clicking on its
own, panels sliding, an agent chat ticking off steps, typography interlude slides
("Your words. / Yours"), captions typeset under the app window, crop marks on a
cream canvas. Iddo's question: how do we get OUR demo video to that level, given
our attempts have been less successful?

## The key insight (agreed diagnosis)

**That video is almost certainly not a screen recording.** It is a motion graphic
rendered from code — most likely Remotion (React → video, rendered frame by
frame) or something equivalent:

- The "app window" is a mock React component with hardcoded, staged content.
- The cursor is an animated graphic on a scripted path — no real mouse, no real app.
- Every click, slide, and checkmark is a keyframe. Nothing runs live: no network,
  no model latency, no dropped frames. That's why it looks flawless.
- This suits Claude Code perfectly because the entire video IS code: Claude can
  write it, render frames, look at them, and refine. Marko's "specialized agents"
  are probably roles like UI-mock builder, motion/timing, and frame-review.

## Where cuboid-studio's existing attempt stands

- `scripts/record-demo-v2.mjs` (and v1): Playwright drives the **live app**,
  records a 960×540 webm, and races a fixed 248.5s ElevenLabs narration using a
  beat clock with "catch-up pacing" (compressing gestures when the app falls
  behind). It fights network latency, real Claude calls in Encode, and WebGL
  frame rate. Fragile by design; quality ceiling is the live app in a headless
  browser.
- `docs/demo/shot-list.md`: manual QuickTime recording plan (8 clips against the
  same narration). Also live-capture.
- Narration scripts live in `docs/demo/voiceover-*.md` / `walkthrough-*.md`.

## The repo that couldn't be inspected

Iddo already has a marketing/video project at
**https://github.com/iddonaim/cuboid-marketing**. The previous session could not
read it — the mid-session "add repo" approval flow malfunctioned (platform
glitch, confirmed not user error). **First task for the next session: audit
cuboid-marketing** and check it against the three ingredients below.

## The three level-up ingredients (the checklist)

1. **Stage the UI, don't run it.** Build mock panels as React components with
   the exact state each shot needs (reading already computed, assembly already
   loaded). Cuboid Studio is React, so real components can be reused with fake
   data. Never wait on a real network call or model call during "filming".
2. **Audio first, picture second.** Lock the ElevenLabs narration, then set
   scene durations in code to match. In Remotion, audio/video sync is exact by
   construction — the beat-clock/catch-up hacks disappear entirely.
3. **Give Claude eyes (the biggest usual gap).** Render single frames at key
   timestamps as PNGs (`npx remotion still`), have Claude inspect and critique
   them, adjust, re-render. Iterate on stills, not on 4-minute recordings.

Plus one bonus for this project specifically: **the 3D shots get better.**
`@remotion/three` renders React Three Fiber scenes deterministically — a camera
orbit around an assembly becomes a scripted animation at a perfect frame rate
in 4K, instead of hoping a headless browser keeps up.

## Tradeoff Iddo has been told about

A code-rendered film is *staged*, not proof the app works live. Industry-normal
for product films (Apple/Linear/Notion do exactly this), but for thesis
credibility the recommended shape is **hybrid**: Remotion for beauty shots,
typography, and captions; one or two genuine live captures where authenticity
matters.

## Suggested first deliverable

A ~15-second proof-of-concept scene: one staged Encode panel, scripted cursor
with easing and a click ripple, one caption, synced to a slice of the existing
narration — so Iddo can judge the look before committing to rebuilding the full
demo this way.

## Collaboration reminders (see CLAUDE.md)

Iddo is not a coder — explain in plain language, name tradeoffs he can decide
on, flag risk honestly, and don't assume he'll notice implications in a diff.
