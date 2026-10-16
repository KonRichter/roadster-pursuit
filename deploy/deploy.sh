#!/usr/bin/env bash
# Deploy Roadster Pursuit to the Hetzner VPS (ssh alias "hetzner").
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${HOST:-hetzner}

rsync -az --delete index.html styles.css src "$HOST":/var/www/roadster-pursuit/
rsync -az server deploy "$HOST":apps/roadster-pursuit/
ssh "$HOST" 'set -e
  mkdir -p ~/roadster-data
  sudo install -m 644 ~/apps/roadster-pursuit/deploy/roadster-leaderboard.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now roadster-leaderboard
  sudo systemctl restart roadster-leaderboard
  if [ ! -e /etc/nginx/sites-enabled/game.konstantinrichter.de ]; then
    sudo install -m 644 ~/apps/roadster-pursuit/deploy/nginx-game.conf /etc/nginx/sites-available/game.konstantinrichter.de
    sudo ln -s /etc/nginx/sites-available/game.konstantinrichter.de /etc/nginx/sites-enabled/
  fi
  sudo nginx -t && sudo systemctl reload nginx'
echo "Deployed."
