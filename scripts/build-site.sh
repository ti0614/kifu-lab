#!/bin/bash
# 公開用の静的サイトを _site/ に組み立てる（GitHub Pages のワークフローからも使う）。
# 事前に npm ci、scripts/build-wasm.sh mini、scripts/fetch-eval-mini.sh を実行しておくこと。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/_site"
rm -rf "$OUT"
mkdir -p "$OUT/build/wasm-mini" "$OUT/eval/mini"
cp "$ROOT"/site/{index.html,style.css,coi-serviceworker.js,sample.kif} "$OUT/"
(cd "$ROOT" && npm run --silent build:js)
cp "$ROOT"/build/wasm-mini/yaneuraou.{js,wasm,worker.js} "$OUT/build/wasm-mini/"
cp "$ROOT"/eval/mini/{nn.bin,progress.bin,LICENSE} "$OUT/eval/mini/"
# Jekyll の処理を止める（_ で始まるファイルなどを除外させない）
touch "$OUT/.nojekyll"
find "$OUT" -type f | sort
