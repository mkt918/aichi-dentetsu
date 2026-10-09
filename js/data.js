/* あいち電鉄 — データ定義（駅・物件・路線・カード・イベント）
 * 金額の単位はすべて「万円」。駅の元データは stations.js、画面上の座標は layout.js が決める。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});

  /** 世界の拡大率。デザイン空間(1200x1000)を何倍にして使うか */
  const K = 1.8;
  /** 経度・緯度 → デザイン空間（愛知県がちょうど入る投影） */
  const proj = (lon, lat) => [(lon - 136.6) * 900, (35.45 - lat) * 1050];

  // ---- 物件の利回り: 安い物件ほど高く(50%〜)、高い物件ほど低く(1〜3%)。名物度(隠しデータ)が高いほど高い ----
  function rateFor(price, fame) {
    const base = price <= 500 ? 70 : price <= 1000 ? 50 : price <= 2000 ? 30 : price <= 3000 ? 18 : price <= 5000 ? 10 : price <= 8000 ? 5 : price <= 15000 ? 3 : price <= 30000 ? 2 : 1;
    const mul = fame >= 3 ? 1.3 : fame === 2 ? 1 : 0.8;
    const r = Math.max(1, Math.round(base * mul));
    return r >= 10 ? Math.max(10, Math.round(r / 5) * 5) : r; // 10%以上は5%刻み
  }

  // ---- 有名な場所・お店・工場ほど、物件の値段を高くする（元の値段 × 種類 × 名物度） ----
  const ICON_MULT = { castle: 4, factory: 5, airport: 4, tower: 3, shrine: 3, park: 2.5, museum: 2, onsen: 2, sea: 2, train: 2, festival: 1.5, mountain: 1.5, leaf: 1.5, food: 1, craft: 1, pottery: 1, farm: 1, fish: 1, bird: 1 };
  const PRICE_FIXED = { '名古屋城': 2000000 }; // 最高額は200億円（名古屋城）
  function niceRound(p) { const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(p)) - 1)); return Math.round(p / mag) * mag; }
  function finalPrice(name, icon, price, fame) {
    if (PRICE_FIXED[name]) return PRICE_FIXED[name];
    let m = (ICON_MULT[icon] || 1) * (fame >= 3 ? 1.5 : fame === 2 ? 1.2 : 1);
    if (icon === 'food' && fame >= 3) m = 2; // 有名店
    return price < 500 ? price : niceRound(price * m);
  }

  // 地域: nagoya=名古屋 / owari=尾張 / chita=知多 / nishimikawa=西三河 / higashimikawa=東三河 / atsumi=渥美
  const REGION = { nagoya: '名古屋', owari: '尾張', chita: '知多', nishimikawa: '西三河', higashimikawa: '東三河', atsumi: '渥美' };

  const OV = A.OVERRIDES || { pos: {}, edges: null, props: {} };
  // 物件の一覧 [名前, アイコン, 価格, 名物度]。エディターの上書きがあればそれを使う。安い順に並べる
  const itemsOf = (r) => {
    const ov = OV.props && OV.props[r.id];
    const list = ov ? ov.map((it) => it.slice()) : r.items.map((it) => [it[0], it[1], finalPrice(it[0], it[1], it[2], it[3]), it[3]]);
    return list.map((it, i) => ({ it, i })).sort((a, b) => a.it[2] - b.it[2] || a.i - b.i).map((o) => o.it);
  };
  const STATIONS = A.RAW_STATIONS.map((r) => ({
    id: r.id, name: r.name, region: r.region, lon: r.lon, lat: r.lat, desc: r.desc, tag: r.tag || r.desc,
    shop: !!r.shop,     // カード売り場がある
    plain: !!r.plain && !(OV.props && OV.props[r.id] && OV.props[r.id].length), // 地下鉄の駅など。物件もカードもなく、止まると少しおこづかい
    card: !!r.card && !(OV.props && OV.props[r.id] && OV.props[r.id].length), // 物件のないカード駅（止まるとカードがもらえる）
    island: !!r.island, // 島の駅（海の上に置く）
    pin: !!r.pin,       // 位置を動かさない駅
    props: itemsOf(r).map((it, i) => ({ id: r.id + '-' + i, station: r.id, name: it[0], icon: it[1], price: it[2], fame: it[3], rate: rateFor(it[2], it[3]) })),
  }));

  // ---- 路線: 駅の並び（隣どうしを線路でつなぐ）。実在の路線をもとに、わかりやすく作り直したもの ----
  // 1本の路線は、駅を端から順に並べたもの。同じ区間が複数の路線にあれば1本にまとめる。
  const LINES = [
    ['東山線', ['fujigaoka', 'hongo', 'kamiyashiro', 'issha', 'hoshigaoka', 'higashiyama', 'motoyama', 'kakuozan', 'ikeshita', 'imaike', 'chikusa', 'shinsakaemachi', 'sakae', 'fushimi', 'nagoya', 'nakamurakuyakusho', 'takabata']],
    ['名城線', ['ozone', 'nagoyadome', 'sunadabashi', 'chayagasaka', 'jiyugaoka', 'motoyama', 'nagoyadaigaku', 'yagoto', 'mizuho', 'shinzuibashi', 'hotta', 'tenmacho', 'jingunishi', 'kanayama', 'higashibetsuin', 'kamimaezu', 'yabacho', 'sakae', 'hisayaodori', 'nagoyajo', 'meijokoen', 'kurokawa', 'heianzuri', 'ozone']],
    ['鶴舞線', ['kamiotai', 'joshin', 'marunouchi', 'fushimi', 'osu', 'kamimaezu', 'tsurumai', 'arahata', 'kokiso', 'yagoto', 'hirabari', 'akaike']],
    ['桜通線', ['nakamura', 'nakamurakuyakusho', 'nagoya', 'kokusaicenter', 'marunouchi', 'hisayaodori', 'tokugawa', 'imaike', 'kokiso', 'mizuho', 'shinzuibashi', 'tokushige']],
    ['名港線', ['kanayama', 'hibino', 'tokaidori', 'minatoku', 'nagoyakou', 'kinjo']],
    ['あおなみ線', ['kinjo', 'yatomi']],
    ['JR東海道線', ['nagoya', 'kanayama', 'atsuta', 'kasadera', 'oidaka', 'obu', 'kariya', 'anjo', 'okazaki', 'goyu', 'kozakai', 'toyohashi']],
    ['JR中央線', ['ozone', 'kasugai', 'kozoji']],
    ['JR武豊線', ['obu', 'handa', 'taketoyo']],
    ['JR飯田線', ['toyohashi', 'toyokawa', 'shinshiro', 'yuya', 'horaiji', 'toei', 'shitara', 'toyone']],
    ['名鉄瀬戸線', ['imaike', 'ozone', 'moriyama', 'owariasahi', 'seto']],
    ['上飯田線・小牧線', ['heianzuri', 'kamiida', 'ajiyoshi', 'komaki']],
    ['名鉄豊田線', ['akaike', 'toyota']],
    ['JR関西線', ['nagoya', 'kanie', 'yatomi']],
    ['名鉄名古屋本線', ['nagoya', 'kanayama', 'atsuta', 'narumi', 'arimatsu', 'toyoake', 'chiryu', 'anjo', 'nishio', 'isshiki', 'kira', 'gamagori']],
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

  // 道路: [名前, 種類, 駅の並び]。種類 expressway=高速道路 / national=国道 / pref=県道
  const ROADS = [
    ['東名高速道路', 'expressway', ['toyokawa', 'okazaki', 'toyota', 'nagakute', 'yagoto', 'kasugai', 'komaki']],
    ['名神高速道路', 'expressway', ['komaki', 'ichinomiya', 'kisogawa']],
    ['新東名高速道路', 'expressway', ['shinshiro', 'tsukude', 'okazaki']],
    ['伊勢湾岸自動車道', 'expressway', ['toyota', 'toyoake', 'tokai', 'nagoyakou', 'yatomi']],
    ['知多半島道路', 'expressway', ['tokai', 'chita', 'handa', 'mihama', 'utsumi', 'morozaki']],
    ['東海環状自動車道', 'expressway', ['toyota', 'seto']],
    ['国道1号', 'national', ['nagoya', 'atsuta', 'arimatsu', 'toyoake', 'chiryu', 'okazaki', 'goyu', 'toyohashi']],
    ['国道19号', 'national', ['nagoya', 'ozone', 'kasugai', 'kozoji']],
    ['国道22号', 'national', ['nagoya', 'kiyosu', 'inazawa', 'ichinomiya', 'kisogawa']],
    ['国道41号', 'national', ['nagoya', 'komaki', 'inuyama']],
    ['国道153号', 'national', ['nagakute', 'toyota', 'asuke', 'asahi', 'inabu']],
    ['国道151号', 'national', ['toyohashi', 'shinshiro', 'shitara', 'toei']],
    ['県道67号（海部）', 'pref', ['kiyosu', 'ama', 'tsushima', 'yatomi']],
    ['県道（西春）', 'pref', ['kamiotai', 'kitanagoya', 'kiyosu']],
    ['県道（中村）', 'pref', ['takabata', 'nakamura', 'nakamurakuyakusho', 'kokusaicenter']],
    ['県道（城北）', 'pref', ['joshin', 'meijokoen', 'kamiida']],
    ['県道（港）', 'pref', ['minatoku', 'tokaidori']],
    ['県道（東区）', 'pref', ['sunadabashi', 'chayagasaka', 'hoshigaoka']],
    ['県道（天白）', 'pref', ['kamiyashiro', 'fujigaoka']],
    ['県道（瑞穂）', 'pref', ['tsurumai', 'arahata', 'mizuho', 'shinzuibashi']],
    ['県道（千種）', 'pref', ['chikusa', 'kakuozan', 'higashiyama']],
    ['県道（南）', 'pref', ['tenmacho', 'atsuta']],
    ['県道（南西）', 'pref', ['tokushige', 'akaike', 'narumi', 'toyoake']],
    ['国道155号', 'national', ['toyota', 'chiryu', 'kariya', 'takahama', 'hekinan']],
    ['国道259号', 'national', ['toyohashi', 'tahara', 'fukue', 'akabane', 'koiji', 'irago']],
    ['国道23号', 'national', ['yatomi', 'nagoyakou']],
    ['国道23号(蒲郡バイパス)', 'national', ['okazaki', 'kota', 'gamagori', 'mitani', 'kozakai', 'toyohashi']],
    ['国道247号', 'national', ['hekinan', 'handa', 'tokoname']],
    ['県道', 'pref', ['seto', 'kozoji']],
    ['県道', 'pref', ['hirabari', 'nisshin', 'nagakute']],
    ['県道', 'pref', ['isshiki', 'hazu']],
    ['国道257号', 'national', ['shitara', 'tsugu', 'inabu']],
    ['県道', 'pref', ['inuyamayuen', 'konan']],
    ['県道', 'pref', ['daijuji', 'sanage']],
    ['県道', 'pref', ['nishio', 'kota']],
  ];

  /** 路線・特別な区間・道路から、駅と駅の区間の一覧を作る（[駅A, 駅B, {kinds: 種類のならび, sea, bridge}]）。同じ区間は1本にまとめる */
  const EDGES = (() => {
    const map = new Map(), order = [];
    const add = (a, b, opt, kind) => {
      const key = [a, b].sort().join('|');
      let e = map.get(key);
      if (!e) { e = { a, b, opt: {}, kinds: new Set() }; map.set(key, e); order.push(e); }
      e.kinds.add(kind);
      if (opt) Object.assign(e.opt, opt);
    };
    const pairs = (stops, fn) => { for (let i = 0; i < stops.length - 1; i++) fn(stops[i], stops[i + 1]); };
    LINES.forEach(([, stops]) => pairs(stops, (x, y) => add(x, y, null, 'rail')));
    SPECIAL.forEach(([x, y, opt]) => add(x, y, opt, opt.sea ? 'sea' : 'bridge'));
    ROADS.forEach(([, kind, stops]) => pairs(stops, (x, y) => add(x, y, null, kind)));
    return order.map((e) => [e.a, e.b, Object.assign({}, e.opt, { kinds: Array.from(e.kinds) })]);
  })();
  const DEFAULT_EDGES = EDGES.map((e) => e.slice());
  // マップエディターで変えた路線があれば差しかえる（存在しない駅をふくむものは捨てる）
  if (OV.edges && Array.isArray(OV.edges) && OV.edges.length) {
    const ids = new Set(STATIONS.map((s) => s.id));
    const ok = OV.edges.filter((e) => e && ids.has(e[0]) && ids.has(e[1]));
    if (ok.length) { EDGES.length = 0; ok.forEach((e) => EDGES.push([e[0], e[1], Object.assign({ kinds: ['rail'] }, e[2] || {})])); }
  }

  // ---- 地図は四角いグリッドで区切る。駅も道も、グリッドの1マスにぴったり入れる ----
  const GRID = 34;                         // 1マスの大きさ（画面の px）
  const SQUARE_SCALE = (GRID * 0.58) / 19;  // 途中マス（もとの絵は19px）を、1マスの8割に広げる倍率
  const STATION_SCALE = (GRID * 0.9) / 39; // 駅（もとの絵は39px）をほぼ1マスに広げる倍率
  // 途中マスの種類の割合。赤と青は、前の前の版の3倍の数をめやすに、いまは割合で決める
  const SQUARE_MIX = { yellow: 0.09, event: 0.045, red: 0.31 }; // のこりは青

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

  Object.assign(A, { K, proj, rateFor, finalPrice, ICON_MULT, REGION, STATIONS, LINES, ROADS, EDGES, DEFAULT_EDGES, GRID, SQUARE_SCALE, STATION_SCALE, SQUARE_MIX, CARDS, HAND_LIMIT, EVENTS, CHARS, OUTLINE_REAL });
})(typeof globalThis !== 'undefined' ? globalThis : this);
