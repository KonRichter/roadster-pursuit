# Roadster Pursuit

A *Split/Second: Velocity*-style escape game in the browser. You drive the 2nd-generation Tesla Roadster
and use its **suction fans** and **cold-gas thrusters** to survive scripted disasters and police roadblocks.

Live at **https://game.konstantinrichter.de**

## Run locally

```sh
python3 server/leaderboard.py --port 8000 --static . --db leaderboard.sqlite
# open http://localhost:8000  (game + leaderboard API)
```

Three.js (r160) loads from jsDelivr. There is no build step, and the server uses only the Python standard library.

## Controls

- **A / D or ← →**: steer. Speed is automatic and rises over time.
- **Space**: thrust jump. Hold it to fly while pressure lasts.
- **Shift**: suction (grip, ride tunnel walls, survive blasts).
- P pauses, M mutes. Touch buttons appear on phones.

## Events

Police pursuits, a falling radio tower, roadblocks, tanker blasts, missing bridge sections, tunnel cave-ins, overpass collapses,
a **head-over loop** (the highway does a full barrel roll; hold suction or fall off),
and a police chopper that drops mines. When the chopper swoops low, thrust-fly into it to bring it down.
Over distance, the standard speed rises (about 134 mph up to about 220 mph), events come closer together,
and more cops and traffic appear. The rear thrusters fire once, for the 0–60-in-0.81 s launch.
The pressure and suction tanks are small, so use them wisely. You have 3 lives (hearts).

## Leaderboard & deployment

- `server/leaderboard.py`: `GET /api/leaderboard`, `POST /api/scores`, SQLite table `scores`,
  best run per nickname, an 8 s cooldown per IP, and basic plausibility checks.
- On the VPS: nginx serves `/var/www/roadster-pursuit` and proxies `/api/` to the systemd unit
  `roadster-leaderboard` (127.0.0.1:3010). The database is `~/roadster-data/leaderboard.sqlite`.
- Deploy with `./deploy/deploy.sh` (rsync + systemd + nginx; TLS via certbot).

## Based on the Oct 15, 2026 reveal

- Fan-based suction of up to 2 G. The reveal showed the car driving up an inverted ramp and holding itself upside down.
- SpaceX-developed cold-gas thrusters fed by ultra-high-pressure air tanks. They did kickflips, flipped over other cars and landed.
- Trims: Performance (<1.6 s 0–60), Thrust (rear thrusters, <0.9 s), Rocket (perimeter thrusters, <0.59 s, 230+ mph).
- 0–60 in 0.81 s shown on the reveal stream.
- "Ano White" paint, a visor-style tinted canopy, a full-width light bar, and active wings in Track Mode.

This is a fan-made game, not affiliated with Tesla or SpaceX.

## Code map

- `src/track.js`: streamed road and tunnel geometry, plus the `(s, u, h)` to world transform.
- `src/car.js`: Roadster physics (thrust, hover, suction wall-ride).
- `src/events.js`: event director and obstacles.
- `src/police.js`, `src/traffic.js`: AI.
- `src/models.js`, `src/city.js`, `src/fx.js`: visuals. The Roadster body and canopy are lofted from keyframed cross-sections.
- `src/audio.js`: WebAudio synth sounds.
- `src/hud.js`, `src/input.js`, `src/leaderboard.js`: UI and leaderboard client.
- `src/main.js`: game loop.
