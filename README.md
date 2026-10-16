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

- **WASD or arrows**: drive (W speeds up, S brakes)
- **Space**: thrust jump, hold to hover
- **Shift**: suction (grip, ride tunnel walls, survive blasts)
- P pauses, M mutes. Touch buttons appear on phones.

## Events

Police pursuits, roadblocks, tanker blasts, a police chopper dropping mines, missing bridge sections,
an airliner crash, tunnel cave-ins and overpass collapses. Over distance, the standard speed rises
(about 134 mph up to about 220 mph), events come closer together, and more cops and traffic appear.
The rear thrusters fire once, for the 0–60-in-0.59 s launch.

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
- "Ano White" paint, a visor-style tinted canopy, a full-width light bar, and active wings in Track Mode.

This is a fan-made game, not affiliated with Tesla or SpaceX.

## Code map

- `src/track.js`: streamed road and tunnel geometry, plus the `(s, u, h)` to world transform.
- `src/car.js`: Roadster physics (thrust, hover, suction wall-ride).
- `src/events.js`: event director and obstacles.
- `src/police.js`, `src/traffic.js`: AI.
- `src/models.js`, `src/city.js`, `src/fx.js`: visuals.
- `src/audio.js`: WebAudio synth sounds.
- `src/hud.js`, `src/input.js`, `src/leaderboard.js`: UI and leaderboard client.
- `src/main.js`: game loop.
