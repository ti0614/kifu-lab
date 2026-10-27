#!/bin/bash
# つようら王11mini の評価関数 (MIT) を eval/mini/ に取得する。
# 公式配布は pixivFANBOX (https://yaneurao.fanbox.cc/posts/12761272)。
# ここでは検証用に、公式アーカイブから無改変で再配布している GitHub Release を使い、SHA-256 を確認する。
# micro は公式配布元から入手して eval/micro/ に nn.bin と progress.bin を置くこと。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=https://github.com/irep-takeshi-maya/shogi-vault-gpl-source/releases/download/tsuyoura11mini-eval-20261003
DIR="$ROOT/eval/mini"
mkdir -p "$DIR"
for f in nn.bin progress.bin LICENSE; do
  curl -fsSL -o "$DIR/$f" "$BASE/$f"
done
cd "$DIR"
# macOS には sha256sum が無いので shasum を使う。
shasum -a 256 -c - <<'SUM'
45323c65135da65d6c2c364eea93a5af6a285c27ebfb07eab4afbe737ef74508  nn.bin
a2d18f0564639c945b5d6469e9b437cd64a526ad4fbcef02ab1d8f547d08e5f1  progress.bin
SUM
