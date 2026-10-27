# 将棋 棋譜解析Webサイト（ブラウザ完結型）

## 目的
自分の棋譜（KIF/CSA）を貼り付けると、強い将棋AIで解析してくれるWebサイトを作る。
- **無料・回数制限なし**で使えること
- 解析は**利用者のブラウザ内（WebAssembly）**で行い、サーバー費用をほぼゼロにする

## 背景
- 2026年10月14日、評価関数「つようら王11mini / 11micro」がpixivFANBOXで無償公開された（MITライセンス）。
  - 作者の説明では、水匠5よりレーティングで150〜200ほど強い。
  - サイズ：mini 約8.5MB、micro 約4.5MB（水匠5は約63MB）→ ブラウザで読み込むのに向いている。
  - 同梱のやねうら王ビルドはWindows 64bit版だけ。評価関数の形式に合ったビルドが必要。
- 2026年10月時点で、つようら王11を無料で使えるWeb解析サイトは見つからなかった。

## 技術方針（案）
- エンジン：やねうら王（USI）をEmscriptenでWebAssembly化し、Web Worker上で動かす
  - つようら王11の評価関数の形式に合うビルド設定にする（FANBOXの配布ページで確認）
  - まずはシングルスレッドで始める。マルチスレッドにはSharedArrayBufferが必要で、COOP/COEPヘッダーの設定も要る
- 評価関数：まずmicro（軽い）を使う。miniとの切り替えは後で検討
- フロント：棋譜の貼り付け → 一手ずつ解析 → 評価値グラフ＋悪手の表示
- 静的ホスティング（GitHub Pages / Cloudflare Pagesなど）で公開する想定

## 最初にやること（実現可能性の調査）
1. やねうら王をWebAssembly化した既存の例やブランチがあるか調べる
2. つようら王11の評価関数に必要なNNUEの形式とビルドオプションを確認する
3. Emscriptenビルドを試し、ブラウザでUSIの `go` が動くか確認する
4. 速度を測る（1手あたり何秒で、どのくらいの深さまで読めるか）

→ 調査結果は `docs/feasibility.md`。ビルドは `scripts/build-wasm.sh`（emsdk 3.1.43 に固定）。

## 公開
- GitHub Pages（https://ti0614.github.io/kifu-lab/）。main への push で `.github/workflows/pages.yml` がビルドして公開する
- COOP/COEP は `site/coi-serviceworker.js` で付与している
- ページのソースは `site/`（JS は `site/src/`、esbuild でバンドル）。`scripts/build-site.sh` で `_site/` に組み立てる
- 棋譜の読み込みは tsshogi（MIT）。盤面は自前で描画（駒を動かさないので）
- 動作確認：`NODE_PATH=$(npm root -g) node tools/e2e.js <URL>`（サンプル棋譜を最後まで解析する）

## ライセンスの注意
- やねうら王：**GPLv3** → WebAssembly版を配布するなら、ソースコードの公開が必要。サイトのリポジトリもGPLで公開するのが無難
- つようら王11：**MIT** → 二次配布や商用利用も可。著作権表示は残す
- 評価関数ファイルを再配布する場合は、配布元の条件も確認する

## 参考
- ShogiHome（オープンソースのGUI。KIFの解析やUIの参考になる）
- 窓の杜：つようら王11mini/micro公開 https://forest.watch.impress.co.jp/docs/news/2148597.html

## 未決事項（会話で出たもの）
- 評価関数は、公式（FANBOX）の配布物を無改変で再配布している第三者の GitHub Release から取得している（`scripts/fetch-eval-mini.sh`）。SHA-256 はその第三者のページの値で、公式ファイルとは未照合。公式版を入手して照合し、リポジトリに同梱する案がある
- micro は公式からの入手が必要で、まだ動かしていない
- リポジトリのライセンス（GPLv3 にするか）は未決
- Safari（macOS / iOS）での動作確認は未実施
- 公開後に `tools/e2e.js` を GitHub Actions で自動実行する案（未実施）

## 応答について
- 日本語で、簡潔に。
