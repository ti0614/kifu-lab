# kifu-lab

将棋の棋譜を貼り付けると、強い将棋AIがブラウザの中で解析する Web サイトです。

**https://ti0614.github.io/kifu-lab/**

- 無料、登録不要、回数制限なし
- 解析は利用者のブラウザ内（WebAssembly）で行います。棋譜はどこにも送信しません
- エンジン：[やねうら王](https://github.com/yaneurao/YaneuraOu) + 評価関数「つようら王11mini」

## 使い方

1. 棋譜を貼り付けるか、ファイルを選びます（KIF・KI2・CSA・JKF・USI。Shift_JIS のファイルも可）
2. 1手あたりの思考時間（0.5〜10秒）を選びます
3. 「解析を始める」を押します。終わった手から結果が表示されます

解析画面では、次のものが見られます。

- 盤面と持ち駒
- 評価値と形勢
- 指した手の判定（悪手・疑問手・最善手）
- 最善手と読み筋
- 先手・後手ごとの集計
- 評価値グラフ（クリックでその局面へ）

局面はキーボードの ← → でも移動できます。

判定は、指した側から見た評価値の損失が300以上なら悪手、150以上なら疑問手です。

### 初回について

- 初回は評価関数（約8.7MB）をダウンロードします。2回目からはブラウザに保存したものを使います
- 最初にアクセスしたとき、ページが1回自動でリロードされます（下の「対応ブラウザ」を参照）

## 対応ブラウザ

エンジンはマルチスレッドで動くため、SharedArrayBuffer が必要です。動作を確認したのは Chromium（headless）だけで、Safari と Firefox はまだ試していません。

GitHub Pages では SharedArrayBuffer に必要なヘッダー（COOP/COEP）を設定できません。そこで [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) を使い、Service Worker でヘッダーを付けています。Service Worker が使えない環境では動きません。たとえば、一部のプライベートウィンドウやアプリ内ブラウザです。

## 開発

```sh
npm ci                         # tsshogi と esbuild
scripts/build-wasm.sh mini     # やねうら王を WebAssembly にビルド（emsdk 3.1.43 と YaneuraOu を vendor/ に取得）
scripts/fetch-eval-mini.sh     # 評価関数を eval/mini/ に取得（SHA-256 を確認）
scripts/build-site.sh          # 公開用のサイトを _site/ に組み立て
node tools/server.js           # COOP/COEP 付きのローカルサーバー → http://localhost:8080/
```

動作確認（headless Chromium でサンプル棋譜を最後まで解析します。Playwright が必要）:

```sh
NODE_PATH=$(npm root -g) node tools/e2e.js http://localhost:8080/
```

main に push すると、`.github/workflows/pages.yml` がビルドして GitHub Pages に公開します。

### 構成

| パス | 内容 |
| --- | --- |
| `site/` | 公開ページ（`index.html`、`style.css`、`src/` の JS） |
| `site/src/engine.js` | WebAssembly 版やねうら王のラッパー（USI） |
| `site/src/kifu.js` | 棋譜の読み込みと、悪手などの判定 |
| `scripts/` | ビルド用のスクリプト |
| `tools/` | ベンチマーク、ローカルサーバー、e2e テスト |
| `docs/feasibility.md` | 実現可能性の調査結果と速度の計測 |

やねうら王は本家の固定コミットを、そのまま（改変なしで）ビルドしています。評価関数の形式は `SFNN_ka2_4096_8_64_progress8` です。ビルドのオプションと速度の計測結果は [docs/feasibility.md](docs/feasibility.md) を参照してください。

## ライセンス

このリポジトリは [GNU General Public License v3.0](LICENSE) です。

公開サイトには、次のものを同梱しています。

| もの | ライセンス |
| --- | --- |
| [やねうら王](https://github.com/yaneurao/YaneuraOu)（WebAssembly 版。ソースと手順は `scripts/build-wasm.sh`） | GPLv3 |
| 評価関数「つようら王11mini」（`nn.bin`、`progress.bin`） | MIT（[配布元の告知](https://yaneuraou.yaneu.com/2026/10/14/tsuyou-11-mini-micro-released-under-mit-license/)） |
| [tsshogi](https://github.com/sunfish-shogi/tsshogi) | MIT |
| [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) | MIT |
