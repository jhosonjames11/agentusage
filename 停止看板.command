#!/bin/zsh
cd "${0:A:h}" || exit 1
if [[ -x "$PWD/.runtime/node/bin/node" ]]; then
  export PATH="$PWD/.runtime/node/bin:$PATH"
elif [[ -r "$PWD/.runtime/node-path" ]]; then
  IFS= read -r node_dir < "$PWD/.runtime/node-path"
  [[ -x "$node_dir/node" ]] && export PATH="$node_dir:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node(N); do
    export PATH="${candidate:h}:$PATH"
  done
fi
node scripts/manage.mjs stop
