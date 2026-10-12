# ZOM-ZOM

A chaotic, no-nonsense wave shooter in a blocky, foggy small town. It's like CoD Zombies, minus the
easter eggs, door codes and spreadsheets. You run, you shoot, the zombies explode into blocks.

## Run it

```bash
npm install
npm run dev        # then open the printed localhost URL
# or: npm run build && npm run preview
```

Click **PLAY** to lock the mouse. `Esc` pauses.

## Controls

| Key | Action |
| --- | --- |
| `WASD` | Run (you're always sprinting) |
| Mouse / `LMB` / `RMB` | Aim / shoot / aim down sights |
| `Q`, mouse wheel, `1`–`4` | Switch guns (you carry up to 4) |
| `R` | Reload (it also reloads automatically when empty) |
| `V` | Baseball bat (always on you, doesn't use a gun slot) |
| `G` | Throw grenade |
| `E` | Use your specialty item |
| `F` | Instant concrete wall (3 charges, 1 recharges every 20s, so 3 per minute) |
| `X` | Swap the gun you're standing on for your current one, or ride a zipline |
| `Space` | Jump. Hold it while falling to open a **parachute** |

## How it plays

- **Waves forever.** Each round has more zombies and faster ones. Runners show up from round 3, glowing
  exploders from round 4, and **juggernauts** from round 5.
- **Supply drop every round** in a different part of town. Follow the red beam, the compass marker or
  the minimap square. It holds rare and crazy guns, a specialty item, grenades, full ammo and health.
  Landing it also draws a horde.
- **Ammo everywhere.** Run through the green ammo boxes to grab them; they respawn. Zombies drop ammo
  and grenades too.
- **Guns:** M1 Rifle and .44 Revolver to start, then SMG, Assault Rifle, Pump and Auto Shotgun, LMG,
  and the crazy ones: Minigun, Rocket Launcher, Ray Gun, Tesla Cannon. Beam color shows rarity
  (blue, purple, orange).
- **Specialty items (E):** Grappling Hook (you start with it), Jetpack, Skateboard, Sentry Turret,
  Zombie Bait (a screaming speaker that pulls the horde, then explodes).
- **Getting around:** stairs in the multi-story buildings, ladders (diner, warehouse, barn, gas
  station canopy, water tower), ziplines between rooftops, and parachutes for jumping off them.
- **Scoring:** kills, +50 for headshots, bat kills and explosive kills, and a combo multiplier for
  chaining kills fast.

### No cheesing

- Zombies spawn all around you, including **ahead of where you're running**, and some of them lead
  their target, so running in circles doesn't work.
- Zombies take the stairs up after you, and **climb walls** to reach roofs.
- If nothing can reach you on a perch for 20s, zombies climb up onto it.
- Stay in one small area too long and **"they smell you"**: spawns get faster, closer and full of runners.

## The town

About 350 m across, roughly a minute to cross on foot. It has a 5-story apartment block, a 3-story
clinic, a general store, a police station, a diner, a church with a steeple, a warehouse, a gas station
with a canopy, houses, a farm (farmhouse, barn with hayloft, silo, crop fields), and a water tower.
Each round has its own atmosphere: dusty orange, cold blue mist, white-out fog, and night (with a
flashlight).

## Assets

- Brick, wood, crate, grass and tile textures come from the
  [three.js example textures](https://github.com/mrdoob/three.js/tree/dev/examples/textures),
  downscaled for a chunky look.
- Everything else is generated in code: the pixel textures, all models (blocky zombies, guns, town),
  and all sound effects (synthesized live with WebAudio).
