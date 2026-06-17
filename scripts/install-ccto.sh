#!/bin/sh
set -eu

REPO="${CCTO_GITHUB_REPO:-agicto/codingcto}"
BIN_NAME="${CCTO_BIN_NAME:-ccto}"
INSTALL_DIR="${CCTO_INSTALL_DIR:-}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ccto install: missing required command: $1" >&2
    exit 1
  fi
}

need curl
need tar

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os" in
  darwin) os="darwin" ;;
  linux) os="linux" ;;
  *)
    echo "ccto install: unsupported OS: $os" >&2
    echo "Download manually from https://github.com/$REPO/releases/latest" >&2
    exit 1
    ;;
esac

case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="amd64" ;;
  *)
    echo "ccto install: unsupported architecture: $arch" >&2
    echo "Download manually from https://github.com/$REPO/releases/latest" >&2
    exit 1
    ;;
esac

latest_url="$(curl -fsIL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")"
tag="${latest_url##*/}"
if [ -z "$tag" ] || [ "$tag" = "latest" ]; then
  echo "ccto install: failed to resolve latest release tag" >&2
  exit 1
fi

version="$tag"
version="${version#ccto-v}"
asset="ccto_${version}_${os}_${arch}.tar.gz"
base_url="https://github.com/$REPO/releases/download/$tag"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

echo "Installing ccto $version for $os/$arch"
curl -fsSL "$base_url/$asset" -o "$tmp_dir/$asset"
curl -fsSL "$base_url/checksums.txt" -o "$tmp_dir/checksums.txt"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$tmp_dir" && grep "  $asset\$" checksums.txt | sha256sum -c -)
elif command -v shasum >/dev/null 2>&1; then
  (cd "$tmp_dir" && grep "  $asset\$" checksums.txt | shasum -a 256 -c -)
else
  echo "ccto install: neither sha256sum nor shasum is available" >&2
  exit 1
fi

tar -xzf "$tmp_dir/$asset" -C "$tmp_dir"
chmod +x "$tmp_dir/$BIN_NAME"

if [ -z "$INSTALL_DIR" ]; then
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
    INSTALL_DIR="/usr/local/bin"
  else
    INSTALL_DIR="$HOME/.local/bin"
  fi
fi

mkdir -p "$INSTALL_DIR"
cp "$tmp_dir/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
chmod +x "$INSTALL_DIR/$BIN_NAME"

echo "ccto installed to $INSTALL_DIR/$BIN_NAME"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not on PATH."
    echo "Add it with: export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

"$INSTALL_DIR/$BIN_NAME" --help >/dev/null
echo "Run from a repository checkout with: ccto up"
