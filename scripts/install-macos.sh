#!/bin/bash
# Install Agent Usage into the current user's home without changing system tools.
set -euo pipefail
umask 077

if [ "$(uname -s)" != Darwin ]; then
  printf 'This installer is for macOS only.\n' >&2
  exit 1
fi

install_dir=${AGENTUSAGE_INSTALL_DIR:-"$HOME/Library/Application Support/AgentUsage"}
parent_dir=$(dirname "$install_dir")
if [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
  printf 'Installation directory already exists: %s\nExisting files were not changed.\n' "$install_dir" >&2
  exit 1
fi
mkdir -p "$parent_dir"
staging=$(mktemp -d "$parent_dir/.agentusage-install-XXXXXX")
cleanup() { rm -rf "$staging"; }
trap cleanup EXIT

printf 'Downloading Agent Usage…\n'
curl -fL --retry 2 -o "$staging/source.tar.gz" 'https://codeload.github.com/jhosonjames11/agentusage/tar.gz/refs/heads/main'
mkdir "$staging/app"
tar -xzf "$staging/source.tar.gz" -C "$staging/app" --strip-components 1

# Use an existing compatible Node and npm when available. Otherwise install a
# verified, private Node runtime alongside the application.
node_ok=false
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  if node -e 'const [major,minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' >/dev/null 2>&1; then
    node_ok=true
    mkdir -p "$staging/app/.runtime"
    (cd "$(dirname "$(command -v node)")" && pwd -P) > "$staging/app/.runtime/node-path"
  fi
fi
if [ "$node_ok" = false ]; then
  mac_version=$(sw_vers -productVersion)
  IFS=. read -r mac_major mac_minor _ <<< "$mac_version"
  mac_minor=${mac_minor:-0}
  if [ "$mac_major" -lt 13 ] || { [ "$mac_major" -eq 13 ] && [ "$mac_minor" -lt 5 ]; }; then
    printf 'The bundled Node.js requires macOS 13.5 or later. Install a compatible Node.js 22.12+ and npm first.\n' >&2
    exit 1
  fi
  case "$(uname -m)" in
    arm64) arch=arm64; checksum=ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd ;;
    x86_64) arch=x64; checksum=977614af0504c81045e7fd85596dbca0e5f951b96681516dadafedcca8c447f7 ;;
    *) printf 'Unsupported Mac architecture.\n' >&2; exit 1 ;;
  esac
  node_archive="node-v24.22.3-darwin-${arch}.tar.gz"
  printf 'Downloading a private Node.js runtime…\n'
  curl -fL --retry 2 -o "$staging/$node_archive" "https://nodejs.org/dist/v24.22.3/$node_archive"
  (cd "$staging" && printf '%s  %s\n' "$checksum" "$node_archive" | shasum -a 256 -c -)
  mkdir -p "$staging/app/.runtime/node"
  tar -xzf "$staging/$node_archive" -C "$staging/app/.runtime/node" --strip-components 1
  export PATH="$staging/app/.runtime/node/bin:$PATH"
fi

printf 'Installing dependencies and building…\n'
(cd "$staging/app" && npm ci --include=dev && npm run build)
# Reserve the destination atomically; never merge into an existing directory.
if ! mkdir "$install_dir"; then
  printf 'Could not create installation directory: %s\n' "$install_dir" >&2
  exit 1
fi
if ! mv "$staging/app" "$install_dir/app"; then
  rmdir "$install_dir" 2>/dev/null || true
  exit 1
fi
app_dir="$install_dir/app"
if [ -d "$app_dir/.runtime/node/bin" ]; then
  export PATH="$app_dir/.runtime/node/bin:$PATH"
fi
printf 'Installed at: %s\n' "$app_dir"
if [ "${AGENTUSAGE_NO_OPEN:-0}" = 1 ]; then
  (cd "$app_dir" && node scripts/manage.mjs start --no-open)
else
  (cd "$app_dir" && node scripts/manage.mjs start)
fi
