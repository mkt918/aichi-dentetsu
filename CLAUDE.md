# あいち電鉄（18_momotetu）

愛知県オンリーの桃鉄風すごろく。プレーン HTML/CSS/JS（ビルドなし）。詳細は README.md。

## 守ること

- **ルール変更は `js/logic.js` / `js/ai.js` / `js/data.js` / `js/stations.js` / `js/board.js` / `js/layout.js` で行い、DOM を触らない**（Node でテストできる状態を保つ）。画面側は `js/app.js`。
- スクリプトは **classic script**（ES Modules にしない）。`file://` で `index.html` を開いて動くことが前提。各ファイルは `Aichi` 名前空間（`globalThis.Aichi`）に公開する。読みこみ順は `stations → data → layout → board → logic → ai → art → audio → ui → mapview → app`。
- 色・余白・角丸は `css/tokens.css` の変数のみ。SVG の中でも `var(--…)` を使い、色のベタ書きをしない。
- ゲームの状態（`state`）は JSON にできる値だけで持つ（セーブのため）。関数・DOM・Map/Set を入れない。セーブの形を変えたら `app.js` の `SAVE_KEY` の版を上げる。
- 駅の画面座標は `layout.js` が自動で決める（`stations.js` には経度・緯度だけ書く）。路線は `data.js` の `LINES`（駅の並び）と `SPECIAL`（橋・海路）で書き、隣どうしの区間を `EDGES` が作る。道は `ROADS`（高速・国道・県道）もふくめ、`board.js` が四角いグリッド（`GRID`）の上に、上下左右だけの経路として引く（斜めなし）。途中マスの数は地図の大きさ `K` と `GRID` で決まる（変えたら `validate-map` と `routes` を見る）。エディターの保存は `overrides.js` 経由で読みこむ。盤面や駅を変えたら必ず `node test/validate-map.js`、ルール/AIを変えたら `node test/simulate.js 200` を通す。
- 物件の利回りは手で書かず、価格と名物度（隠しデータ）から `rateFor` で決める（安いほど高く、高いほど低く）。

## 確認方法

- ルール: `node test/simulate.js 200`（Lv1 < Lv2 < Lv3 の勝率の階段が崩れていないか見る）。
- 画面: 静的サーバーで `index.html` を開き、`Aichi.app.quickStart({...cfg}, seed)` でCPUだけのゲームを `Aichi.UI.rt.speed = 0` で最後まで流してコンソールエラーを見る。
  `document.visibilityState` が `hidden` のタブでは `requestAnimationFrame` が止まるので、Playwright など描画される環境で確かめる。
- 路線図（ヨンナナ路線図）は個人・友人同士での利用に限られる無料版。駅名と位置関係を参考にするだけにして、図やデータそのものは取りこまない。
