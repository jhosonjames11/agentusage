#!/bin/zsh
cd "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node(N); do
    export PATH="${candidate:h}:$PATH"
  done
fi
node scripts/manage.mjs stop
