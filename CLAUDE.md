# 将棋 棋譜解析Webサイト（ブラウザ完結型）

## 目的
自分の棋譜（KIF/CSA）を貼り付けると、強い将棋AIで解析してくれるWebサイトを作る。
- **無料・回数制限なし**で使えること
- 解析は**利用者のブラウザ内（WebAssembly）**で行い、サーバー費用をほぼゼロにする

## 背景
- 開発者の環境：M1 Mac。ShogiHome＋やねうら王＋水匠5で、ローカル解析環境はすでにある。
- 2026年10月14日、評価関数「つようら王11mini / 11micro」がpixivFANBOXで無償公開された（MITライセンス）。
  - 開発者の説明では、水匠5よりレーティングで150〜200ほど強い。
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
3. M1 Mac上でEmscriptenビルドを試し、ブラウザでUSIの `go` が動くか確認する
4. 速度を測る（1手あたり何秒で、どのくらいの深さまで読めるか）

→ 調査結果は `docs/feasibility.md`。ビルドは `scripts/build-wasm.sh`（emsdk 3.1.43 に固定）。

## 公開
- GitHub Pages（https://ti0614.github.io/kifu-lab/）。main への push で `.github/workflows/pages.yml` がビルドして公開する
- COOP/COEP は `site/coi-serviceworker.js` で付与している
- ページのソースは `site/`。`scripts/build-site.sh` で `_site/` に組み立てる

## ライセンスの注意
- やねうら王：**GPLv3** → WebAssembly版を配布するなら、ソースコードの公開が必要。サイトのリポジトリもGPLで公開するのが無難
- つようら王11：**MIT** → 二次配布や商用利用も可。著作権表示は残す
- 評価関数ファイルを再配布する場合は、配布元の条件も確認する

## 参考
- ShogiHome（オープンソースのGUI。KIFの解析やUIの参考になる）
- 窓の杜：つようら王11mini/micro公開 https://forest.watch.impress.co.jp/docs/news/2148597.html

## 開発者について
- 元SE（金融系、7〜8年）。説明は簡潔でよい。
- 応答は日本語で。
