#!/bin/sh

case "$1" in
  "i")
    docker compose run --rm lgtm i
    docker compose up
    ;;
  "b")
    docker compose exec lgtm bash
    ;;
  "c")
  docker compose exec lgtm bun run check
  ;;
  *)
    echo "i b c"
    ;;
esac