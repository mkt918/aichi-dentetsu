/* あいち電鉄 — データ定義（駅・物件・路線・カード・イベント）
 * 金額の単位はすべて「万円」。駅の元データは stations.js、画面上の座標は layout.js が決める。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});

  /** 世界の拡大率。デザイン空間(1200x1000)を何倍にして使うか */
  const K = 3.6;
  /** 経度・緯度 → デザイン空間（愛知県がちょうど入る投影） */
  const proj = (lon, lat) => [(lon - 136.6) * 900, (35.45 - lat) * 1050];

  // ---- 物件の利回り: 安い物件ほど高く(50%〜)、高い物件ほど低く(1〜3%)。名物度(隠しデータ)が高いほど高い ----
  function rateFor(price, fame) {
    const base = price <= 500 ? 70 : price <= 1000 ? 50 : price <= 2000 ? 30 : price <= 3000 ? 18 : price <= 5000 ? 10 : price <= 8000 ? 5 : price <= 15000 ? 3 : price <= 30000 ? 2 : 1;
    const mul = fame >= 3 ? 1.3 : fame === 2 ? 1 : 0.8;
    return Math.max(1, Math.round(base * mul));
  }

  // 地域: nagoya=名古屋 / owari=尾張 / chita=知多 / nishimikawa=西三河 / higashimikawa=東三河 / atsumi=渥美
  const REGION = { nagoya: '名古屋', owari: '尾張', chita: '知多', nishimikawa: '西三河', higashimikawa: '東三河', atsumi: '渥美' };

  const STATIONS = A.RAW_STATIONS.map((r) => ({
    id: r.id, name: r.name, region: r.region, lon: r.lon, lat: r.lat, desc: r.desc,
    shop: !!r.shop,     // カード売り場がある
    card: !!r.card,     // 物件のないカード駅（止まるとカードがもらえる）
    island: !!r.island, // 島の駅（海の上に置く）
    pin: !!r.pin,       // 位置を動かさない駅
    props: r.items.map((it, i) => ({ id: r.id + '-' + i, station: r.id, name: it[0], icon: it[1], price: it[2], fame: it[3], rate: rateFor(it[2], it[3]) })),
  }));

  // ---- 路線: 駅の並び（隣どうしを線路でつなぐ）。実在の路線をもとに、わかりやすく作り直したもの ----
  // 1本の路線は、駅を端から順に並べたもの。同じ区間が複数の路線にあれば1本にまとめる。
  const LINES = [
    ['東山線', ['fujigaoka', 'hoshigaoka', 'higashiyama', 'nagoyadaigaku', 'kakuozan', 'imaike', 'sakae', 'fushimi', 'nagoya']],
    ['名城線', ['sakae', 'nagoyajo', 'tokugawa', 'nagoyadome', 'ozone', 'imaike', 'sakae']],
    ['鶴舞線', ['kanayama', 'osu', 'tsurumai', 'yagoto', 'mizuho']],
    ['桜通線', ['nakamura', 'nagoya']],
    ['名港線', ['kanayama', 'nagoyakou', 'kinjo']],
    ['あおなみ線', ['kinjo', 'yatomi']],
    ['JR東海道線', ['nagoya', 'kanayama', 'atsuta', 'obu', 'kariya', 'anjo', 'okazaki', 'goyu', 'kozakai', 'toyohashi']],
    ['JR中央線', ['ozone', 'kasugai', 'kozoji']],
    ['JR武豊線', ['obu', 'handa', 'taketoyo']],
    ['JR飯田線', ['toyohashi', 'toyokawa', 'shinshiro', 'yuya', 'horaiji', 'toei', 'shitara', 'toyone']],
    ['名鉄瀬戸線', ['imaike', 'ozone', 'moriyama', 'seto']],
    ['名鉄名古屋本線', ['nagoya', 'kanayama', 'atsuta', 'arimatsu', 'toyoake', 'chiryu', 'anjo', 'nishio', 'isshiki', 'kira', 'gamagori']],
    ['名鉄常滑線', ['atsuta', 'tokai', 'obu', 'handa', 'tokoname']],
    ['名鉄河和線', ['handa', 'kowa']],
    ['知多半島線', ['kowa', 'mihama', 'utsumi', 'morozaki']],
    ['名鉄知多線', ['tokai', 'chita', 'tokoname']],
    ['リニモ', ['fujigaoka', 'nagakute', 'toyota']],
    ['豊田線', ['toyota', 'sanage', 'obara', 'asuke', 'asahi', 'inabu']],
    ['名鉄犬山線', ['nagoya', 'kitanagoya', 'iwakura', 'konan', 'inuyama', 'inuyamayuen']],
    ['小牧線', ['inuyama', 'komaki', 'kasugai']],
    ['明治村線', ['inuyama', 'meijimura', 'komaki']],
    ['尾西線', ['nagoya', 'ama', 'inazawa', 'ichinomiya', 'kisogawa']],
    ['清洲線', ['nagoya', 'kiyosu', 'inazawa']],
    ['津島線', ['inazawa', 'tsushima', 'aisai', 'yatomi']],
    ['碧南線', ['kariya', 'takahama', 'hekinan']],
    ['岡崎線', ['okazaki', 'daijuji', 'matsudaira', 'toyota']],
    ['幸田線', ['kira', 'kota', 'okazaki']],
    ['八丁線', ['okazaki', 'hatcho']],
    ['西浦線', ['gamagori', 'katahara', 'nishiura']],
    ['三谷線', ['gamagori', 'mitani', 'kozakai']],
    ['豊橋線', ['toyohashi', 'yoshidajo', 'nonhoi']],
    ['二川線', ['toyohashi', 'futagawa']],
    ['御油線', ['goyu', 'toyokawa']],
    ['新城線', ['shinshiro', 'tsukude', 'asuke']],
    ['渥美線', ['tahara', 'fukue', 'akabane', 'koiji', 'irago']],
  ];

  // 線路の並びでは結べないもの（橋・海路）。opt: bridge=橋 / sea=フェリー / n=途中マス数の指定
  const SPECIAL = [
    ['tokoname', 'centrair', { bridge: true }],
    ['handa', 'hekinan', { bridge: true }],
    ['toyohashi', 'tahara', { bridge: true }],
    ['morozaki', 'shinojima', { sea: true, n: 2 }],
    ['shinojima', 'himaka', { sea: true, n: 1 }],
    ['himaka', 'irago', { sea: true, n: 3 }],
    ['isshiki', 'sakushima', { sea: true, n: 2 }],
  ];

  /** 路線と特別な区間から、隣どうしの区間の一覧を作る（[駅A, 駅B, オプション]） */
  const EDGES = (() => {
    const seen = new Set(), out = [];
    const add = (a, b, opt) => {
      const key = [a, b].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(opt ? [a, b, opt] : [a, b]);
    };
    LINES.forEach(([, stops]) => { for (let i = 0; i < stops.length - 1; i++) add(stops[i], stops[i + 1]); });
    SPECIAL.forEach(([a, b, opt]) => add(a, b, opt));
    return out;
  })();

  // ---- 途中マスの数（種類ごと）。赤と青は、前の版の3倍。黄と紫は前の版と同じ数 ----
  const SQUARE_QUOTA = { yellow: 38, event: 19, red: 132, blue: 231 }; // 合計420

  // ---- カード ----
  // kind: dice(サイコロ変更) / warp / target(相手指定) / self / money / sale / buyout / stay
  const CARDS = {
    express:    { name: '急行カード',       desc: 'サイコロを2個ふる。', weight: 16, kind: 'dice', dice: 2, tone: 'accent', price: 600 },
    limited:    { name: '特急カード',       desc: 'サイコロを3個ふる。', weight: 9, kind: 'dice', dice: 3, tone: 'accent-2', price: 1500 },
    shinkansen: { name: '新幹線カード',     desc: 'サイコロを4個ふる。', weight: 4, kind: 'dice', dice: 4, tone: 'accent-3', price: 4000 },
    six:        { name: 'ろくカード',       desc: 'サイコロの目が必ず6になる。', weight: 6, kind: 'dice', dice: 1, fixed: 6, tone: 'mint', price: 800 },
    warp:       { name: 'ワープカード',     desc: '好きな駅へ一瞬で移動する。', weight: 3, kind: 'warp', tone: 'lavender', price: 5000 },
    stop:       { name: '足止めカード',     desc: 'ライバル1人を、次の番だけ1マスしか進めなくする。', weight: 8, kind: 'target', tone: 'accent-3', price: 1200 },
    harai:      { name: 'お祓いカード',     desc: '貧乏神を追い払う。次の目的地到着まで現れない。', weight: 7, kind: 'self', tone: 'mint', price: 2500 },
    bonus:      { name: 'ご祝儀カード',     desc: 'すぐにお金がもらえる。', weight: 10, kind: 'money', tone: 'accent', price: 0 },
    sale:       { name: '半額セールカード', desc: 'この番に買う物件・増資がぜんぶ半額になる。', weight: 8, kind: 'sale', tone: 'accent-2', price: 1500 },
    buyout:     { name: '買収カード',       desc: '今いる駅のライバルの物件を、2倍の値段で買い取る。', weight: 6, kind: 'buyout', tone: 'accent-3', price: 2500 },
    stay:       { name: '足踏みカード',     desc: 'サイコロをふらず、いまの駅にとどまる。物件を買ったり増資したりできる。', weight: 9, kind: 'stay', tone: 'mint', price: 500 },
  };
  const HAND_LIMIT = 6;

  // ---- ランダムイベント（紫マス） ----
  const EVENTS = [
    { id: 'shachi',   text: '金のシャチホコがキラリ! 観光客が押し寄せた。',        money: 800 },
    { id: 'miso',     text: '味噌煮込みうどんで元気100倍! 仕事がはかどった。',    money: 400 },
    { id: 'ghibli',   text: 'ジブリパーク帰りのお客さんがお土産を買ってくれた。', money: 600 },
    { id: 'tebasaki', text: '手羽先パーティーで大盛り上がり。みんながお祝いをくれた。', takeEach: 200 },
    { id: 'toyota',   text: 'トヨタ工場見学でお土産をもらった。',                  card: 1 },
    { id: 'cochin',   text: '名古屋コーチンの卵を拾った! ごほうびにカードをもらった。', card: 1 },
    { id: 'typhoon',  text: '台風が接近! 屋根の修理にお金がかかった。',          money: -600 },
    { id: 'meshi',    text: '名古屋めしを食べすぎた。胃薬代がかかった。',        money: -300 },
    { id: 'rain',     text: '雨でイベントが中止に…。',                              money: -500 },
    { id: 'lost',     text: '道に迷って遠回り。タクシー代がかかった。',          money: -250 },
    { id: 'uiro',     text: 'ういろうを落としてしまった。カードを1枚なくした。',  loseCard: 1, money: -200 },
    { id: 'okozukai', text: 'おこづかいをみんなに配ることになった。',            giveEach: 150 },
  ];

  // ---- キャラクター（駒） ----
  const CHARS = [
    { id: 'shachi',  name: 'シャチ',     tone: 'accent-2', color: 'var(--color-accent-2)', desc: '名古屋城の金のシャチホコ' },
    { id: 'neko',    name: '招き猫',     tone: 'accent',   color: 'var(--color-accent)',   desc: '常滑の招き猫' },
    { id: 'ebi',     name: 'エビフライ', tone: 'accent-3', color: 'var(--color-accent-3)', desc: '名古屋めしの定番' },
    { id: 'cochin',  name: 'コーチン',   tone: 'mint',     color: 'var(--color-mint)',     desc: '名古屋コーチン' },
  ];

  // ---- 愛知県の輪郭（時計回り。実際の位置に近い投影空間）。layout.js が駅の移動に合わせてゆがませる ----
  const OUTLINE_REAL = [
    [250, 45], [320, 22], [430, 30], [520, 85], [640, 120], [760, 125], [860, 95], [960, 150],
    [1045, 250], [1105, 370], [1130, 470], [1085, 560], [1000, 625], [935, 700], [905, 790],
    // 渥美半島 南岸 (西へ)
    [820, 830], [720, 870], [620, 910], [520, 945], [430, 968], [370, 962], [335, 935], [330, 915], [350, 885],
    // 渥美半島 北岸 (東へ) = 三河湾の南側
    [400, 860], [480, 835], [550, 808], [610, 800], [675, 800], [712, 790], [722, 768],
    // 三河湾の北岸 (西へ)
    [702, 752], [655, 752], [590, 735], [535, 745], [480, 758], [425, 748], [392, 712], [378, 674],
    // 知多半島 東岸 (南へ)
    [355, 700], [350, 760], [338, 815], [318, 865], [295, 900], [280, 912],
    // 知多半島 西岸 (北へ)
    [245, 900], [225, 860], [215, 800], [200, 740], [180, 690], [165, 650], [160, 600], [172, 545], [170, 490], [160, 455],
    // 伊勢湾奥・木曽川河口
    [130, 432], [90, 440],
    // 北西の県境 (木曽川)
    [58, 380], [58, 285], [85, 200], [125, 130], [175, 80],
  ];

  Object.assign(A, { K, proj, rateFor, REGION, STATIONS, LINES, EDGES, SQUARE_QUOTA, CARDS, HAND_LIMIT, EVENTS, CHARS, OUTLINE_REAL });
})(typeof globalThis !== 'undefined' ? globalThis : this);
