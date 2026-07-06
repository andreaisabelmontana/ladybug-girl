# 🐞 Ladybug Girl — Meadow

A lightweight Three.js third-person storybook world starring the Ladybug Girl model.
No build step, no internet needed — Three.js is vendored locally.

**Play it live:** https://andreaisabelmontana.github.io/ladybug-girl-meadow/

## Run it
From this folder:

```powershell
python -m http.server 5250
```

Then open http://localhost:5250 — it's plain HTML + ES modules.

## Controls
Keyboard:
- **W A S D** / **Arrow keys** — walk
- **Shift** — run
- **Space** — hop
- **Mouse drag** — orbit the camera

Touch (appears automatically on touchscreens):
- **Left pad** — walk
- **HOP button** — hop
- **One-finger drag** on the scene — orbit the camera

## The walk (real skeletal animation)
She moves with a proper **walk cycle keyframed onto your AccuRig skeleton**
(`thigh / calf / upperarm` bones) — legs alternate, knees bend, arms counter-swing.
The mesh deforms through *your* skin weights. The engine pins her planted foot to
the ground every frame (lowest of `foot_l/r`, `ball_l/r`), so she stays in contact
with the floor — no float, no bob. There's also an **idle** clip; the game crossfades
idle ⇆ walk based on movement (`AnimationMixer`), and `walk.timeScale` scales up when you run.

Both clips were authored in headless Blender and baked into the GLB.

## Storybook look
- **Cel/toon shading** (`MeshToonMaterial` + a 4-step gradient ramp) → flat illustrated bands
- **Procedural watercolor textures** — soft color washes + paper speckle on ground, foliage, bark
- **Paper-grain overlay + vignette** (in `index.html`) → printed-on-paper feel
- Warm cream sky, soft fog, hemisphere light

(These are generated in-code rather than downloaded, so there's no copyright/licensing
baggage — swap in any CC0 texture pack later if you want.)

## Files
- `index.html` — page, HUD, paper overlay, import map
- `main.js` — the whole game (world, controls, animation mixer)
- `models/ladybug_anim.glb` — rigged + animated character (walk + idle, texture embedded)
- `vendor/` — Three.js r160 + GLTFLoader (local copies)

## Tweaks
Edit the **Tunables** block at the top of `main.js`:
`TARGET_HEIGHT` (her size), `WALK_SPEED`, `RUN_SPEED`, `CAM_DIST`, `CAM_HEIGHT`, `MODEL_FACE_OFF`.
Live in the browser console: `__lb.setFaceOffset(180)`, `__lb.clips()`.

### Swapping in a Mixamo / downloaded walk later
Ready-made clips are skeleton-specific. To use one on this character, upload
`ladybug girl.fbx` to Mixamo (or retarget in Blender), pick a walk, export GLB, and
replace `models/ladybug_anim.glb` — keep the clip named `walk` (and an `idle`) so the
game finds them.

## License
MIT — see [LICENSE](LICENSE).
