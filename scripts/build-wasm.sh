#!/bin/bash
# やねうら王を つようら王11 mini/micro 用に WebAssembly ビルドする。
# usage: scripts/build-wasm.sh [mini|micro ...]   (省略時は両方)
# 出力: build/wasm-<variant>/yaneuraou.{js,wasm,worker.js}
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VENDOR="$ROOT/vendor"
YANEURAOU_REPO=https://github.com/yaneurao/YaneuraOu.git
YANEURAOU_COMMIT=0f421391ae311df9df57dcfcb2b4a78a1972bdf8  # 9.80git, 2026-10-25
# 本家の script/wasm_build.sh と同じ版。6.x では go 後に探索スレッドの出力が返らなかった。
EMSDK_VERSION=3.1.43

# macOS 標準の bash 3.2 でも動くよう連想配列は使わない。
edition_of() {
  case "$1" in
    mini)  echo YANEURAOU_ENGINE_SFNN_ka2_4096_8_64_progress8 ;;
    micro) echo YANEURAOU_ENGINE_SFNN_ka2_2048_8_64_progress8 ;;
    *) echo "unknown variant: $1" >&2; return 1 ;;
  esac
}
if [ $# -eq 0 ]; then set -- mini micro; fi

mkdir -p "$VENDOR"

# emsdk (EMSDK が設定済みならそれを使う)
if [ -z "${EMSDK:-}" ]; then
  EMSDK="$VENDOR/emsdk"
  [ -d "$EMSDK" ] || git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$EMSDK"
fi
"$EMSDK/emsdk" install "$EMSDK_VERSION"
"$EMSDK/emsdk" activate "$EMSDK_VERSION" >/dev/null
# shellcheck disable=SC1091
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1

# YaneuraOu
if [ ! -d "$VENDOR/YaneuraOu" ]; then
  git clone "$YANEURAOU_REPO" "$VENDOR/YaneuraOu"
fi
git -C "$VENDOR/YaneuraOu" fetch --quiet origin "$YANEURAOU_COMMIT" || true
git -C "$VENDOR/YaneuraOu" checkout --quiet "$YANEURAOU_COMMIT"

PYTHON=$(command -v python3 || command -v python)
JOBS=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)

for v in "$@"; do
  edition=$(edition_of "$v")
  out="$ROOT/build/wasm-$v"
  mkdir -p "$out"
  echo "=== build $v ($edition) -> $out"
  # 別editionのobjが残っているとリンクに失敗するので毎回消す。
  rm -rf "$VENDOR/YaneuraOu/obj"
  make -C "$VENDOR/YaneuraOu/source" -j"$JOBS" tournament \
    COMPILER=em++ TARGET_CPU=WASM PYTHON="$PYTHON" \
    YANEURAOU_EDITION="$edition" TARGET="$out/yaneuraou.js"
  ls -l "$out"
done
