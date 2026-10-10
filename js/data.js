/* あいち電鉄 — データ定義（駅・物件・路線・カード・イベント）
 * 金額の単位はすべて「万円」。駅の元データは stations.js、画面上の座標は layout.js が決める。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});

  /** 世界の拡大率。デザイン空間を何倍にして画面の px にするか */
  const K = 2.0;
  // 経度・緯度 → デザイン空間（K倍する前）。経度は緯度35度の縮みを入れて、実際の縦横比にする。SCALE で全体を大きくする
  const SCALE = 1.8;
  const proj = (lon, lat) => [(lon - 136.6) * 860 * SCALE, (35.45 - lat) * 1050 * SCALE];

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
    // 高い物件ほど、さらに高く（値段の差を大きくする）。元の値段が3000万をこえると、ぐっと上がる
    if (price > 3000) m *= Math.pow(price / 3000, 0.7);
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

  // ---- 路線: 実際の鉄道の並び（間の駅はぬいてある）。同じ区間が複数の路線にあれば1本にまとめる ----
  const LINES = [
    ['東山線', ['nakamura', 'nagoya', 'sakae', 'imaike', 'higashiyama', 'fujigaoka']],
    ['名城線', ['sakae', 'nagoyajo', 'ozone']],
    ['名城線(東)', ['higashiyama', 'yagoto', 'kanayama']],
    ['名港線', ['kanayama', 'nagoyakou']],
    ['桜通線', ['yagoto', 'tokushige']],
    ['あおなみ線', ['nagoya', 'kinjo']],
    ['JR東海道線', ['kisogawa', 'ichinomiya', 'inazawa', 'kiyosu', 'nagoya', 'kanayama', 'atsuta', 'arimatsu', 'obu', 'kariya', 'anjo', 'okazaki', 'kota', 'gamagori', 'mitani', 'kozakai', 'toyohashi', 'futagawa']],
    ['名鉄名古屋本線', ['atsuta', 'arimatsu', 'toyoake', 'chiryu', 'anjo', 'okazaki', 'fujikawa', 'goyu', 'kozakai']],
    ['JR中央線', ['kanayama', 'imaike', 'ozone', 'kachigawa', 'kozoji']],
    ['名鉄瀬戸線', ['sakae', 'ozone', 'obata', 'asahi', 'seto']],
    ['名鉄犬山線', ['nagoya', 'nishiharu', 'iwakura', 'konan', 'inuyama']],
    ['名鉄小牧線', ['nagoyajo', 'kachigawa', 'komaki', 'inuyama']],
    ['名鉄津島線・尾西線', ['kiyosu', 'tsushima', 'yatomi']],
    ['名鉄尾西線', ['tsushima', 'ichinomiya']],
    ['JR関西線', ['nakamura', 'kanie', 'yatomi']],
    ['リニモ', ['fujigaoka', 'nagakute']],
    ['愛知環状鉄道', ['okazaki', 'toyota', 'seto', 'kozoji']],
    ['名鉄豊田線', ['yagoto', 'nisshin', 'miyoshi', 'toyota']],
    ['名鉄三河線', ['sanage', 'toyota', 'chiryu', 'kariya', 'takahama', 'hekinan']],
    ['名鉄常滑線', ['atsuta', 'tokai', 'chita', 'tokoname']],
    ['名鉄河和線', ['tokai', 'agui', 'handa', 'taketoyo', 'kowa']],
    ['名鉄知多新線', ['taketoyo', 'noma', 'utsumi']],
    ['JR武豊線', ['obu', 'handa']],
    ['名鉄西尾線・蒲郡線', ['anjo', 'nishio', 'kira', 'hazu', 'katahara', 'gamagori']],
    ['西浦半島', ['katahara', 'nishiura']],
    ['名鉄豊川線', ['goyu', 'toyokawa']],
    ['JR飯田線', ['toyohashi', 'toyokawa', 'shinshiro', 'nagashino', 'horaiji', 'toei']],
    ['豊鉄渥美線', ['toyohashi', 'tahara']],
  ];
  // 線路の並びでは結べないもの（橋・海路）。opt: bridge=橋 / sea=フェリー / prio=盤面を作るとき先に引く
  const SPECIAL = [
    ['tokoname', 'centrair', { bridge: true }],
    ['handa', 'hekinan', { bridge: true }],
    // 実際の航路: 師崎・河和〜日間賀島・篠島、篠島〜伊良湖、一色〜佐久島
    ['morozaki', 'himaka', { sea: true }],
    ['morozaki', 'shinojima', { sea: true }],
    ['kowa', 'himaka', { sea: true }],
    ['himaka', 'shinojima', { sea: true }],
    ['shinojima', 'irago', { sea: true }],
    ['isshiki', 'sakushima', { sea: true }],
    ['sakushima', 'himaka', { sea: true }],
  ];
  // 盤面を作るとき先に引く道（地方どうしをつなぐ骨組み。あとから引くと、ほかの道にふさがれやすい）
  [['okazaki', 'fujikawa'], ['fujikawa', 'goyu'], ['goyu', 'toyokawa'], ['toyokawa', 'shinshiro'], ['okazaki', 'tsukude'], ['tsukude', 'shinshiro'],
    ['kota', 'gamagori'], ['anjo', 'okazaki'], ['kariya', 'anjo'], ['toyohashi', 'toyokawa'], ['shinshiro', 'nagashino'], ['toyota', 'okazaki'],
    ['toyohashi', 'tahara'], ['kira', 'hazu'], ['hazu', 'katahara'], ['katahara', 'gamagori'], ['tokai', 'chita'], ['chita', 'tokoname'],
    ['kariya', 'takahama'], ['takahama', 'hekinan'], ['asuke', 'tsukude'], ['asuke', 'inabu'],
  ].forEach(([a, b]) => SPECIAL.push([a, b, { prio: 1 }]));
  // 渥美半島は細いので、先に引く順番まで決める（北の道 田原〜福江〜伊良湖と、太平洋ぞいの道 二川〜赤羽根を先に）
  [['tahara', 'fukue', 4], ['fukue', 'irago', 3], ['tahara', 'akabane', 3], ['futagawa', 'akabane', 2]].forEach(([a, b, p]) => SPECIAL.push([a, b, { prio: p }]));
  // 道路: [名前, 種類, 駅の並び]。種類 expressway=高速道路 / national=国道 / pref=県道（盤面では線路として引く）
  const ROADS = [
    ['伊勢湾岸道', 'expressway', ['yatomi', 'kinjo', 'nagoyakou', 'tokai']],
    ['名神高速', 'expressway', ['komaki', 'ichinomiya']],
    ['知多半島道路', 'expressway', ['obu', 'agui']],
    ['南知多道路', 'expressway', ['kowa', 'morozaki']],
    ['国道247号', 'national', ['tokoname', 'noma', 'utsumi', 'morozaki']],
    ['国道41号', 'national', ['nishiharu', 'komaki']],
    ['国道155号', 'national', ['kisogawa', 'konan']],
    ['国道155号(瀬戸)', 'national', ['meijimura', 'kozoji']],
    ['国道155号(豊田)', 'national', ['seto', 'sanage']],
    ['県道（犬山）', 'pref', ['inuyama', 'meijimura']],
    ['国道153号', 'national', ['toyota', 'matsudaira', 'asuke', 'inabu']],
    ['国道419号', 'national', ['sanage', 'obara', 'asuke']],
    ['国道257号', 'national', ['inabu', 'tsugu', 'shitara', 'horaiji']],
    ['県道（茶臼山）', 'pref', ['inabu', 'chausu', 'toyone', 'toei']],
    ['国道473号', 'national', ['shitara', 'toei']],
    ['県道（津具）', 'pref', ['tsugu', 'chausu']],
    ['国道301号', 'national', ['okazaki', 'tsukude', 'shinshiro']],
    ['県道（作手）', 'pref', ['asuke', 'tsukude']],
    ['国道1号', 'national', ['fujikawa', 'goyu']],
    ['県道（西尾）', 'pref', ['hekinan', 'isshiki', 'kira']],
    ['県道（一色）', 'pref', ['nishio', 'isshiki']],
    ['県道（幸田）', 'pref', ['nishio', 'kota', 'hazu']],
    ['国道259号', 'national', ['toyohashi', 'tahara', 'fukue', 'irago']],
    ['国道42号', 'national', ['futagawa', 'akabane']],
    ['県道（二川）', 'pref', ['futagawa', 'tahara']],
    ['県道（田原）', 'pref', ['tahara', 'akabane']],
    ['県道（長久手）', 'pref', ['nagakute', 'seto']],
    ['県道（長久手南）', 'pref', ['nagakute', 'nisshin']],
    ['県道（尾張旭）', 'pref', ['asahi', 'nagakute']],
    ['県道（大府）', 'pref', ['obu', 'toyoake']],
    ['県道（刈谷）', 'pref', ['kariya', 'obu']],
    ['県道（徳重）', 'pref', ['tokushige', 'arimatsu']],
    ['県道（蟹江）', 'pref', ['kanie', 'kiyosu']],
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
    // 道の種類は「線路」と「海路」の2つだけ（高速・国道・県道・橋も線路として引く）
    return order.map((e) => [e.a, e.b, Object.assign({}, e.opt, { kinds: e.opt.sea ? ['sea'] : ['rail'] })]);
  })();
  const DEFAULT_EDGES = EDGES.map((e) => e.slice());
  // マップエディターで変えた路線があれば差しかえる（存在しない駅をふくむものは捨てる）
  if (OV.edges && Array.isArray(OV.edges) && OV.edges.length) {
    const ids = new Set(STATIONS.map((s) => s.id));
    const ok = OV.edges.filter((e) => e && ids.has(e[0]) && ids.has(e[1]));
    if (ok.length) { EDGES.length = 0; ok.forEach((e) => { const o = e[2] || {}; EDGES.push([e[0], e[1], Object.assign({}, o, { kinds: o.sea ? ['sea'] : ['rail'] })]); }); }
  }

  // ---- 地図は四角いグリッドで区切る。駅も道も、グリッドの1マスにぴったり入れる ----
  const GRID = 34;                         // 1マスの大きさ（画面の px）
  const SQUARE_SCALE = (GRID * 0.7) / 19;   // 止まるマス（もとの絵は19px）を、1マスの7割の大きさにする倍率
  const STATION_SCALE = (GRID * 0.9) / 39; // 駅（もとの絵は39px）をほぼ1マスに広げる倍率
  // 途中マスの種類の割合。赤と青は、前の前の版の3倍の数をめやすに、いまは割合で決める
  const SQUARE_MIX = { yellow: 0.09, event: 0.045, red: 0.31 }; // のこりは青

  // ---- カード ----
  // kind: dice(サイコロ変更) / warp / target(相手指定) / self / money / sale / buyout / stay
  const CARDS = {
    express:    { name: '急行カード',       desc: 'サイコロを3個ふる。', weight: 16, kind: 'dice', dice: 3, tone: 'accent', price: 600 },
    limited:    { name: '特急カード',       desc: 'サイコロを4個ふる。', weight: 9, kind: 'dice', dice: 4, tone: 'accent-2', price: 1500 },
    shinkansen: { name: '新幹線カード',     desc: 'サイコロを5個ふる。', weight: 4, kind: 'dice', dice: 5, tone: 'accent-3', price: 4000 },
    six:        { name: 'ろくカード',       desc: 'サイコロ2個の目が、どちらも必ず6になる（12マス）。', weight: 6, kind: 'dice', dice: 2, fixed: 6, tone: 'mint', price: 800 },
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

  // ---- 愛知県の輪郭（経度・緯度。木曽川の河口から時計回り）。BORDER_END までが陸の県境、そのあとが海岸 ----
  const OUTLINE_LONLAT = [
    // 木曽川（三重・岐阜との境）を北へ
    [136.735, 35.030], [136.700, 35.075], [136.690, 35.130], [136.682, 35.200], [136.690, 35.250], [136.712, 35.300], [136.760, 35.352], [136.830, 35.373], [136.900, 35.393], [136.950, 35.420],
    // 岐阜・長野との境を東へ
    [137.030, 35.410], [137.050, 35.360], [137.080, 35.320], [137.130, 35.290], [137.200, 35.272], [137.270, 35.275], [137.350, 35.290], [137.430, 35.300], [137.520, 35.282], [137.590, 35.242], [137.660, 35.252], [137.740, 35.212], [137.820, 35.152],
    // 静岡との境を南へ
    [137.840, 35.090], [137.780, 35.030], [137.720, 34.970], [137.640, 34.900], [137.580, 34.830], [137.520, 34.770], [137.480, 34.700], [137.460, 34.662],
    // 太平洋の海岸（渥美半島の南）を西へ
    [137.380, 34.646], [137.280, 34.625], [137.190, 34.603], [137.100, 34.588], [137.030, 34.574], [136.990, 34.576], [136.978, 34.590],
    // 渥美半島の北（三河湾）を東へ
    [137.010, 34.612], [137.060, 34.630], [137.110, 34.650], [137.180, 34.664], [137.230, 34.690], [137.270, 34.700], [137.320, 34.718], [137.352, 34.752], [137.342, 34.790],
    // 三河湾の北岸を西へ
    [137.290, 34.802], [137.250, 34.814], [137.212, 34.814], [137.190, 34.790], [137.195, 34.752], [137.160, 34.774], [137.100, 34.786], [137.060, 34.798], [137.020, 34.798], [136.985, 34.830],
    // 衣浦湾の東岸を北へ、西岸（知多半島の東）を南へ
    [136.992, 34.880], [136.985, 34.930], [136.975, 34.985], [136.955, 34.962], [136.946, 34.900], [136.936, 34.850], [136.962, 34.790], [136.967, 34.740], [136.987, 34.700],
    // 知多半島の西岸を北へ
    [136.950, 34.688], [136.910, 34.703], [136.870, 34.733], [136.852, 34.770], [136.836, 34.820], [136.825, 34.880], [136.840, 34.930], [136.858, 34.990], [136.878, 35.030],
    // 名古屋港
    [136.868, 35.062], [136.880, 35.088], [136.864, 35.072], [136.858, 35.030], [136.838, 35.028], [136.800, 35.044], [136.768, 35.030],
  ];
  const BORDER_END = 30; // ここ（静岡県との境が海に出るところ）までが陸の県境

  Object.assign(A, { K, proj, rateFor, finalPrice, ICON_MULT, REGION, STATIONS, LINES, ROADS, EDGES, DEFAULT_EDGES, GRID, SQUARE_SCALE, STATION_SCALE, SQUARE_MIX, CARDS, HAND_LIMIT, EVENTS, CHARS, OUTLINE_LONLAT, BORDER_END });
})(typeof globalThis !== 'undefined' ? globalThis : this);
