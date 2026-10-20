# Weapon animation: principles for our stickers

Working rules for animating guns in 512×512, 60 fps, ≤ 3 s Telegram stickers (180 frames).
Numbers are starting values to tune by eye; "f" = frame at 60 fps (16.7 ms). Collected 2026-10-20
from game-feel and VFX practice (see sources) and applied in `stickers/pistol/variants/make.py`.

## Constraints that shape everything
- No expressions, masks, effects, star shapes, repeaters, time remap in Telegram stickers: every
  "random" per-shot variation is baked into keys (lists of values per start in `motion.json`), a
  flash star is a plain path, glow/blur are faked with nested flat shapes.
- 64 KB: few reusable parts (8 shells, 8 puffs, 2 flashes) taking turns (`each: true`).
- Chat shows stickers at ~160–200 px: thick shapes, 2–3 flat colours per effect, the pose must read
  without effects, effects overlap the gun instead of spreading to the canvas edges.

## A shot
- No anticipation on the shot itself — a windup makes it soft. One anticipation before the burst:
  6–10 f squeeze (muzzle dips 2–4°, slight squash along the barrel), snapping into shot 1.
- Recoil extreme on the fire frame (attack 1 f): muzzle up 10–16° (hero 20–25°), back 4–8 % of
  the gun length, slightly up.
- Hold the extreme 1–2 f on ordinary shots; 3–6 f "hit-stop" only on the final / hero shot.
- Recover with an ease out and an overshoot of 2–3° past rest (`backOut`), 8–12 f; hero 20–30 f.
- Slide: fully back on the fire frame, forward in 2–3 f with a small overshoot; its kick must be
  no longer than the shortest gap between shots (kicks on one part add up).
- Squash the gun ~7–12 % along the barrel on the fire frame, a little taller, back in 4 f.
- Trigger: 2 f before the shot.
- Flash: 1 f full, 1 f shrunk (55–60 %), gone by f+2. Vary rotation ±15°, scale ±15 %, alternate
  2–3 shapes.
- The whole-gun light frame is an impact frame: first and hero shot only — on every shot of a fast
  burst it strobes.

## Rhythm (aggressive, dynamic)
- Uneven phrases, not even spacing: shot → double tap (6 f) → gap → accelerating string
  (spacing 8 → 6 → 5 → 4 f) → hero shot → long recovery.
- Fire faster than recovery finishes and recoil stacks: the muzzle climbs 25–35° over the string,
  then comes down once.
- Per shot: recoil ±25 %, offset 2–4 px, small y jitter — the shake of a sticker that has no camera.
- 0.3–0.5 s of calm around the burst makes it read harder; the loop starts and ends at rest.

## Shells
- Appear 1–2 f after the shot from the port, fly 20–35 f (here 48 f, falling off the canvas), up
  and back 60–80°.
- Every shell its own arc: angle ±10°, height ±20 %, spin direction and speed, tumble end over end
  (x squeezed to 30 % once per half-turn; `tumble`). Enough shells that none is reused in the air.

## Smoke and secondary effects
- Puffs: grow 30 → 100–140 %, drift up 30–60 px (a little along the barrel), fade over the last
  70 %; 0.5–0.9 s; all gone before the loop end.
- Port puff: small (60 %), 15 f.
- Shock ring: 30 → 200 %, 12 f, first and hero shot only.
- Sparks / speed lines: 6–10 f, outward with an ease out, shrinking to 0.

## Loop layout used for `tempo-burst`
| frames | beat |
|---|---|
| 0–22 | rest, turn towards the viewer begins |
| 22–34 | anticipation |
| 34 / 46, 52 | shot, double tap |
| 66, 74, 80, 85, 89 | accelerating string, muzzle climbs |
| 100 | hero shot: biggest recoil, 4 f hold, light frame, ring |
| 100–150 | long recovery with overshoot, smoke rises, shells leave the frame |
| 150–180 | turn back to rest |

## Sources
- Telegram: core.telegram.org/animated_stickers, core.telegram.org/import-stickers
- Recoil recovery / stacking: discussions.unity.com (FPS weapon recoil recovery), forum.playcanvas.com
- Game feel, hit-stop, shake: wayline.io/learn/game-feel; Jan Willem Nijman, "The Art of Screenshake"
- Muzzle flash timing: aejuice.com (muzzle flash in After Effects), dvinfo.net muzzle-flash thread,
  realtimevfx.com "Weapon visual effects"
