#!/bin/sh
# Hosting platforms (Render, Fly.io, Railway, Docker volumes) usually mount the
# persistent disk owned by root. Give the data folder to the unprivileged "node"
# user, then start the app as that user.
set -e
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then
  if [ "$(stat -c %U "$DATA_DIR")" != "node" ]; then
    chown -R node:node "$DATA_DIR"
  fi
  exec su-exec node "$@"
fi
exec "$@"
