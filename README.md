# ZOM-ZOM

A chaotic, no-nonsense wave shooter in a blocky, foggy small town. It's like CoD Zombies, minus the
easter eggs, door codes and spreadsheets. You run, you shoot, the zombies explode into blocks.

## Run it

```bash
npm install
npm run dev        # then open the printed localhost URL
# or: npm run build && npm run preview
```

Click **PLAY** to lock the mouse. `Esc` pauses. **Settings** (on the menu / pause screen) has volume and
mouse sensitivity, saved in your browser.

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
| `X` | Swap the gun you're standing on for your current one, ride a zipline, or upgrade at a workbench |
| `Space` | Jump. Hold it while falling to open a **parachute** |

## How it plays

- **Waves forever.** Each round has more zombies and faster ones. Runners show up from round 3, glowing
  exploders from round 4, and **juggernauts** from round 5.
- **Supply drop every round** in a different part of town. Follow the red beam, the compass marker or
  the minimap square. It holds rare and crazy guns, a specialty item, grenades, full ammo and health.
  Landing it also draws a horde.
- **Ammo everywhere.** Run through the green ammo boxes to grab them; they respawn. Zombies drop ammo
  and grenades too.
- **Guns (21):** M1 Rifle and .44 Revolver to start, then SMG, Assault Rifle, Burst Rifle, Pump Shotgun,
  Double Barrel, Auto Shotgun, LMG, Sniper Rifle (real scope zoom), plus the fun ones:
  - **Crossbow**: bolts punch through every zombie in a line and stick in walls.
  - **Flamethrower**: sets everything in front of you on fire.
  - **Grenade Launcher**: bouncy grenades that go off when they touch a zombie.
  - **Ricochet SMG**: bullets bounce off walls up to 3 times.
  - **Buzzsaw Launcher**: a sawblade that ricochets around and cuts limbs off.
  - **Black Hole Gun**: opens a singularity that drags the horde in, spins them, then implodes.
  - **Cryo Blaster**: freezes zombies solid; frozen ones take double damage and shatter.
  - Minigun, Rocket Launcher, Ray Gun, Tesla Cannon.

  Beam color shows rarity (blue, purple, orange). Every gun is a detailed block model (rails, sights,
  mags, scopes).
- **Upgrade workbenches** (purple beam and minimap icon: checkpoint tent, junkyard, warehouse): spend
  points on the gun in your hands. **MK II** gives more damage, bigger mags, faster reloads and extra
  pierce. **MK III** goes further and adds a random elemental round: **Inferno** (sets zombies on fire),
  **Volt** (shocks arc to nearby zombies), **Boom** (kills explode) or **Frost** (freezes). Upgraded guns
  get a striped skin and glowing accents. Points you spend still count toward your final score.
- **Ammo is scarce:** about 20 ammo crates across the map (yellow beams), each refilling a minute after
  you take it. Zombies only sometimes drop ammo. Supply drops still refill everything.
- **Explosive barrels:** shoot the red ones and they chain-react.
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

### Places

On top of the town below: a **military checkpoint** on the north road (sandbags, tents, a watchtower,
a workbench), a **junkyard** in the east (crushed-car stacks, shipping containers, a crane, a workbench),
a **park** with a gazebo, a **field hospital** next to the clinic, **burning wrecks** on the roads, power
lines, dumpsters, and a **radio tower** you can climb, with a zipline down to the east houses.

## The town

About 350 m across, roughly a minute to cross on foot. It has a 5-story apartment block, a 3-story
clinic, a general store, a police station, a diner, a church with a steeple, a warehouse, a gas station
with a canopy, houses, a farm (farmhouse, barn with hayloft, silo, crop fields), and a water tower.
Each round has its own atmosphere: dusty orange, cold blue mist, white-out fog, and night (with a
flashlight).

## Look & sound

Blocky geometry, real materials. Each round has its own atmosphere: dusty orange, cold blue mist,
white-out fog, and night (flashlight, street lamps cutting through the fog).

- **PBR textures** (Poly Haven, 1K colour + normal + AO/roughness/metal) on every surface: concrete,
  brick, asphalt, corrugated and rusty metal, weathered wood, tile.
- **GLB props**: barrels, crates, shelving, tables, trash cans, utility boxes, a covered car (Poly Haven)
  and blocky cars (Kenney Car Kit).
- **Height fog** that drifts in banks, **light shafts** raymarched through the sun's shadow map,
  **ambient occlusion** (GTAO), crisp 4K shadows locked to the texel grid, bloom and a gritty grade.
- **Effects**: sprite smoke, fireballs, shockwave rings, scorch marks, bullet holes, muzzle flashes with
  real flash sprites, gun smoke, embers (Kenney Particle Pack).
- **Real sound**: recorded gunshots (with a sub-thump layer and a town echo), zombie moans and growls,
  explosions, footsteps that change with the surface, ricochets, casings, reloads, wind and distant
  moans. Distance muffles sound and adds more reverb. Every sound still has a synthesized fallback.
- If the game can't hold ~45 fps it lowers resolution, then AO, then shadow resolution on its own.

All third-party assets are CC0. Sources are in [CREDITS.md](CREDITS.md). The buildings, guns and zombies
are still built from boxes in code.
