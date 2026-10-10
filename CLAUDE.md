# あいち電鉄（18_momotetu）

愛知県オンリーの桃鉄風すごろく。プレーン HTML/CSS/JS（ビルドなし）。詳細は README.md。

## 守ること

- **ルール変更は `js/logic.js` / `js/ai.js` / `js/data.js` / `js/stations.js` / `js/board.js` / `js/layout.js` で行い、DOM を触らない**（Node でテストできる状態を保つ）。画面側は `js/app.js`。
- スクリプトは **classic script**（ES Modules にしない）。`file://` で `index.html` を開いて動くことが前提。各ファイルは `Aichi` 名前空間（`globalThis.Aichi`）に公開する。読みこみ順は `stations → stationtext → overrides → mapdata → data → layout → board → logic → ai → art → audio → ui → mapview → app`。
- 色・余白・角丸は `css/tokens.css` の変数のみ。SVG の中でも `var(--…)` を使い、色のベタ書きをしない。
- ゲームの状態（`state`）は JSON にできる値だけで持つ（セーブのため）。関数・DOM・Map/Set を入れない。セーブの形を変えたら `app.js` の `SAVE_KEY` の版を上げる。
- 盤面は `js/mapdata.js` の `A.MAPPRESETS`（用意されたマップ。cells は [列, 行, 種類, 駅ID] の一覧。S=駅 b/r/y/e=止まるマス t=線路だけ。start はスタート駅）と、エディターで作った自作マップ（`OVERRIDES.maps`）。遊ぶマップは `OVERRIDES.mapId`（変えたら読みこみ直す）。用意されたマップは県全体の「愛知県」（id `full`）と、地域をしぼった細かいマップ（nagoya / owari / chita / nishimikawa / higashimikawa）。駅（`js/stations.js`）も県の輪郭（`js/data.js` の OUTLINE_LONLAT）も実際の経度・緯度で、ゆがめずに同じ倍率で置く（`A.proj`）。倍率はマップごと（preset の `scale`。data.js が遊ぶマップを決めてから投影する）。駅の `lv: 2` は細かいマップだけの駅（`lv: 3` は名古屋の町なかだけ。preset の `bbox` で範囲をしぼる）、物件の5つ目は本来の駅（その駅がマップにあればそちらの物件になる）。路線の途中の駅がマップになければとばしてつなぐので、県全体のマップを変えないよう、lv2 の駅は路線のもとからとなりどうしの駅のあいだに入れる。盤面に置かれていない駅はゲームから外れる。用意されたマップを作り直すのは `node tools/genall.js`（駅は1つの駅から4方向まで・道はくっつけない）。盤面や駅を変えたら必ず `node test/validate-map.js`（`MAP=nagoya` などで各マップ）、ルール/AIを変えたら `node test/simulate.js 200` を通す。
- 物件の利回りは手で書かず、価格と名物度（隠しデータ）から `rateFor` で決める（安いほど高く、高いほど低く）。

## 確認方法

- ルール: `node test/simulate.js 200`（Lv1 < Lv2 < Lv3 の勝率の階段が崩れていないか見る）。
- 画面: 静的サーバーで `index.html` を開き、`Aichi.app.quickStart({...cfg}, seed)` でCPUだけのゲームを `Aichi.UI.rt.speed = 0` で最後まで流してコンソールエラーを見る。
  `document.visibilityState` が `hidden` のタブでは `requestAnimationFrame` が止まるので、Playwright など描画される環境で確かめる。
- 路線図（ヨンナナ路線図）は個人・友人同士での利用に限られる無料版。駅名と位置関係を参考にするだけにして、図やデータそのものは取りこまない。
