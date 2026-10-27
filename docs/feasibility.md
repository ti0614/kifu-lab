# 実現可能性調査（2026-10-27）

結論：**実現できる。** やねうら王の本家には WebAssembly ビルドが既にあり、つようら王11mini を読み込んでブラウザ（Chromium）で `go` → `bestmove` まで動いた。WASM 版の探索はネイティブ版と同じ結果を返す（下記）。

## 1. やねうら王をWASM化した既存の例

| 例 | 状況 |
| --- | --- |
| 本家 [yaneurao/YaneuraOu](https://github.com/yaneurao/YaneuraOu) | `source/Makefile` に `TARGET_CPU=WASM` / `COMPILER=em++` がある。`script/wasm_build.js` / `wasm_build.sh` あり（Docker の `emscripten/emsdk:3.1.43`） |
| npm `@mizarjp/yaneuraou.*` | 本家のビルドを npm で配布したもの（halfkp / k-p / material など）。最新は 7.6.3-alpha。**SFNN（つようら王11の形式）は含まれない** |
| [shielune/YaneuraOu#74](https://github.com/shielune/YaneuraOu/pull/74) | 第三者のフォーク。つようら王11 mini/micro の WASM ビルドあり |

→ フォークは使わず、**本家を固定コミットでビルドする**ことにした（`scripts/build-wasm.sh`）。

## 2. つようら王11の評価関数の形式とビルドオプション

| | mini | micro |
| --- | --- | --- |
| `YANEURAOU_EDITION` | `YANEURAOU_ENGINE_SFNN_ka2_4096_8_64_progress8` | `YANEURAOU_ENGINE_SFNN_ka2_2048_8_64_progress8` |
| ファイル | `nn.bin` + `progress.bin`（どちらも EvalDir に置く） | 同左 |
| FV_SCALE | 24（SFNN の既定値は別なので、明示して指定する） | 24 |

- 配布物はやねうら王 9.80git（master `c1b80eaa`）でビルドされたもの。今回は本家 master `0f421391`（9.80git, 2026-10-25）でビルドし、ネイティブ版と WASM 版の両方で mini を正しく読み込めた。
- 評価関数の型ごとに別ビルドが必要。micro 用のビルドに mini の nn.bin を渡すと `hash mismatch` → `FileCloseError` で拒否される（確認済み）。
- 検証には、公式アーカイブから無改変で再配布されている mini（[GitHub Release](https://github.com/irep-takeshi-maya/shogi-vault-gpl-source/releases/tag/tsuyoura11mini-eval-20261003)、SHA-256 確認付き）を使った。**micro は公式（FANBOX）からの入手が必要で、今回はまだ動かしていない。**

## 3. Emscripten ビルドとブラウザでの動作

- 環境は Linux x86_64（クラウドコンテナ）。M1 Mac ではまだ試していない（手順は下記）。
- **emsdk は 3.1.43 に固定**（本家と同じ）。最新の 6.0.13 でもビルドは通るが、`go` を送っても探索スレッドの出力が返らなかった。原因は調べていない。
- 本家の `wasm_pre.js` にあるコマンドキュー（`postMessage`）は動かなかったので、`ccall("usi_command", ...)` を直接呼んでいる。出力は `addMessageListener` で受け取る（`print` オプションは `wasm_pre.js` に上書きされる）。
- 本家の WASM ビルドは **pthread 前提**で、Threads=1 でも SharedArrayBuffer が必要。つまり **COOP/COEP ヘッダーが必須**。
  - Cloudflare Pages：`_headers` で設定できる
  - GitHub Pages：ヘッダーを設定できない → coi-serviceworker のような回避策が要る
  - pthread なしのビルドは、エンジン本体が `std::thread` を前提にしているため改造が必要。今は手を付けない方がよい
- サイズ（brotli 圧縮後）：wasm 約 197KB、mini の nn.bin 約 4.9MB、progress.bin 約 0.25MB。生のサイズは wasm 752KB、nn.bin 7.7MB。

## 4. 速度

計測環境：同じコンテナの CPU（AVX2/AVX-512 対応の x86、4コア）。USI_Hash=256MB、評価関数は mini、`go movetime`。
ネイティブ版は `TARGET_CPU=AVX2` の clang ビルド。WASM 版は Node.js 22 で計測し、Chromium でもほぼ同じ NPS だった。

| 局面 | 時間 | WASM 1T | ネイティブ 1T | WASM 4T | ネイティブ 4T |
| --- | --- | --- | --- | --- | --- |
| 初期局面 | 1秒 | 深さ18 / 165k nps | 19 / 313k | 18 / 468k | 19 / 1.26M |
| 初期局面 | 3秒 | 21 / 153k | 23 / 305k | 23 / 587k | 28 / 1.35M |
| 中盤（21手目） | 1秒 | 14 / 153k | 15 / 297k | 16 / 535k | 19 / 1.11M |
| 中盤（21手目） | 3秒 | 16 / 136k | 20 / 287k | 19 / 568k | 20 / 1.05M |
| 終盤（bench3） | 3秒 | 13 / 97k | 12 / 206k | 13 / 445k | 13 / 810k |

- WASM のシングルスレッドはネイティブの約 **50%**。4スレッドにするとシングルの約 3.5 倍になる。
- 同じ条件ではネイティブ版と探索結果が完全に一致した（初期局面 depth16 のノード数 93715、読み筋も同じ）。WASM の SIMD 変換で評価値がずれていないことの確認になる。
- 棋譜解析の目安：1手1秒・4スレッドで中盤は深さ15〜19。120手の棋譜なら約2分で終わる。

## 再現手順（M1 Mac でも同じ）

```sh
scripts/build-wasm.sh          # vendor/ に emsdk 3.1.43 と YaneuraOu を入れてビルド → build/wasm-{mini,micro}/
scripts/fetch-eval-mini.sh     # eval/mini/ に nn.bin, progress.bin（SHA-256 確認付き）
# micro は FANBOX から入手し、eval/micro/ に nn.bin と progress.bin を置く

node poc/server.js             # COOP/COEP 付きサーバー → http://localhost:8080/poc/
node tools/bench.js wasm build/wasm-mini eval/mini 1 1000,3000    # Node で計測
NODE_PATH=$(npm root -g) node tools/browser_test.js "http://localhost:8080/poc/?auto=1&threads=4"   # headless Chromium
```

## 次にやること

1. M1 Mac の Safari / Chrome で `poc/` を開いて NPS を測る（Safari の SharedArrayBuffer と WASM SIMD の確認も兼ねる）
2. micro を入手して、mini と速度・評価を比べる
3. Web Worker の上に USI ラッパーを作る（KIF/CSA の解析 → `position` → `go movetime` を1手ずつ）
4. ホスティング先を決める（COOP/COEP の都合で Cloudflare Pages が有力）
5. ライセンス：WASM 版は GPLv3 なので、このリポジトリも GPLv3 で公開する方針を決める。評価関数の MIT 表示（eval/mini/LICENSE）を同梱する
