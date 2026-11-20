# EMBERLINE — Yard 7

A round-based tactical FPS for the make.fun `threejs-fps-01` bounty. Three lanes,
two bomb sites, one dusk-orange industrial yard.

- **Teams:** EMBER (you + 2 bot teammates, attackers) vs ASH (5 bot defenders).
- **Objective:** plant the ember charge at site A (fuel depot) or B (crane yard)
  and defend it until it detonates — or eliminate the whole ASH squad. First to
  3 round wins takes the yard (max 5 rounds).
- **Economy:** kills +$300, round win +$3250, round loss +$1900, plant +$300.
  Buy between rounds with **B**: VK-7 rifle ($2700), Hornet-9 SMG ($1500),
  Boar-12 shotgun ($1700), armour ($650), Flash-9 grenade ($200, **G** to throw).
- **Gunplay:** hitscan, headshots deal 4× damage, spread grows with movement and
  shrinks when crouched or aiming down sights (right mouse). **R** reloads,
  **E** (hold) plants / defuses, **1** primary, **2** pistol.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network: the game is plain static files and loads three.js
from `game/vendor/three/` via an import map. All sound is synthesised with
WebAudio — there are no audio files.

## Screenshots

Deterministic captures, served by the same server:

```sh
node serve.ts
# http://localhost:8080/?shot=start&seed=1
# http://localhost:8080/?shot=play&seed=1
# http://localhost:8080/?shot=plant&seed=1
# http://localhost:8080/?shot=end&seed=1
```

Each renders twice, freezes, and sets `window.__shotReady`.

## Entry

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.
