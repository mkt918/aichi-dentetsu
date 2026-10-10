/* あいち電鉄 — 用意された盤面を作る（Node 専用）: node tools/genall.js
 * tools/genmap.js を動かし、js/mapdata.js に書き出す。県全体のマップと、地域をしぼった細かいマップ。
 * ONLY=nagoya,chita のようにIDをしぼると、そのマップだけ作り直し、ほかは今の js/mapdata.js のまま残す。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PRESETS = [
  { id: 'full', name: '愛知県', desc: '県の形も駅の位置も、実際の地図と同じ。名古屋の町なかは駅が少なめで、奥三河は遠い。', start: 'nagoya' },
  // 地域をしぼった細かいマップ。spec: 地域ごとに入れる駅の細かさ（lv）。scale: 県全体のマップの何倍の大きさで描くか
  { id: 'nagoya', name: '名古屋市', desc: '名古屋市だけを大きく。大須・覚王山・鶴舞・栄生など、町なかの駅がぐっと増える。', start: 'nagoya', spec: { nagoya: 2 }, scale: 2.6, tries: 40, turns: 14 },
  { id: 'nagoyacenter', name: '名古屋の町なか', desc: '名古屋駅・栄・金山のまわりを大きく。伏見・丸の内・市役所・新栄町・本山など、地下鉄の駅をこまかくめぐる。', start: 'nagoya', spec: { nagoya: 3 }, bbox: [136.85, 35.11, 136.98, 35.21], scale: 5, tries: 40, turns: 14 },
  { id: 'owari', name: '尾張', desc: '尾張の町を細かく。名古屋は大きな駅だけ。七宝焼の甚目寺、航空ミュージアムの豊山など。', start: 'nagoya', spec: { nagoya: 1, owari: 2 }, scale: 1.5, tries: 40, turns: 14 },
  { id: 'chita', name: '知多半島', desc: '知多半島と島を細かく。亀崎・新舞子・小鈴谷・豊浜など、海ぞいの町をめぐる。', start: 'handa', spec: { chita: 2 }, scale: 2.0, tries: 40, turns: 14 },
  { id: 'nishimikawa', name: '西三河', desc: '岡崎・豊田・安城・西尾を細かく。トヨタの本社や鞍ヶ池、佐久島も。', start: 'okazaki', spec: { nishimikawa: 2 }, scale: 1.4, tries: 40, turns: 14 },
  { id: 'higashimikawa', name: '東三河・渥美', desc: '豊橋・豊川・新城から奥三河、渥美半島まで。三河港や本宮山も。', start: 'toyohashi', spec: { higashimikawa: 2, atsumi: 2 }, scale: 1.5, tries: 40, turns: 14 },
];

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const old = {};
if (ONLY) { require('../js/mapdata.js'); (globalThis.Aichi.MAPPRESETS || []).forEach((m) => { old[m.id] = m; }); }
// 盤面のよさ: スタートの駅と「2通り以上の行き方」でつながる駅の数（多いほどよい）。道をくっつけてしまった所があれば減点
function score(rows, start, loose) {
  const K = (x, y) => x + ',' + y, cells = new Map(rows.map((r) => [K(r[0], r[1]), r]));
  const nb = (r) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => K(r[0] + dx, r[1] + dy)).filter((k) => cells.has(k));
  const s0 = rows.find((r) => r[2] === 'S' && r[3] === start);
  if (!s0) return -1e9;
  const tin = {}, low = {}, bridges = new Set(); let tm = 0;
  const stack = [[K(s0[0], s0[1]), null, 0]];
  while (stack.length) { // 橋（1本しかない道）を見つける（くり返しで書いた DFS）
    const fr = stack[stack.length - 1], [v, p] = fr, ns = nb(cells.get(v));
    if (fr[2] === 0) tin[v] = low[v] = ++tm;
    if (fr[2] < ns.length) {
      const u = ns[fr[2]++];
      if (u === p) continue;
      if (tin[u]) low[v] = Math.min(low[v], tin[u]); else stack.push([u, v, 0]);
    } else {
      stack.pop();
      if (p) { low[p] = Math.min(low[p], low[v]); if (low[v] > tin[p]) bridges.add(v + '|' + p).add(p + '|' + v); }
    }
  }
  const seen = new Set([K(s0[0], s0[1])]), q = [K(s0[0], s0[1])];
  while (q.length) { const v = q.shift(); nb(cells.get(v)).forEach((u) => { if (!seen.has(u) && !bridges.has(v + '|' + u)) { seen.add(u); q.push(u); } }); }
  return rows.filter((r) => r[2] === 'S' && seen.has(K(r[0], r[1]))).length - loose * 3;
}
const maps = PRESETS.map((p) => {
  if (ONLY && !ONLY.has(p.id) && old[p.id]) return Object.assign({}, p, { cells: old[p.id].cells });
  const env = Object.assign({}, process.env, { OUT: 'json', START: p.start });
  if (p.spec) env.SPEC = JSON.stringify(p.spec); else delete env.SPEC;
  if (p.bbox) env.BBOX = JSON.stringify(p.bbox); else delete env.BBOX;
  env.MAP_SCALE = String(p.scale || 1);
  env.GEN_MAP = p.id;
  if (p.turns) env.PRIO_TURNS = String(p.turns); else delete env.PRIO_TURNS;
  delete env.MAP;
  // tries: 道を引く順番を少しずつ変えて何通りか作り、いちばんよいものをえらぶ（SEED=0 はゆらさない）
  let best = null;
  for (let seed = 0; seed < (p.tries || 1); seed++) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'genmap.js')], { env: Object.assign({}, env, { SEED: String(seed) }), maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(r.stderr.toString());
    const rows = JSON.parse(r.stdout.toString()), loose = (r.stderr.toString().match(/くっつけた/g) || []).length;
    const sc = score(rows, p.start, loose);
    if (!best || sc > best.sc) best = { rows, sc, seed, note: r.stderr.toString().trim() };
  }
  const st = best.rows.filter((r) => r[2] === 'S').length;
  console.log(p.name, 'マス', best.rows.length, '駅', st, (p.tries ? '（' + p.tries + '通りから SEED=' + best.seed + '、2通り以上で行ける駅 ' + best.sc + '）' : ''), best.note);
  return Object.assign({}, p, { cells: best.rows });
});

const body = maps.map((m) => '    { id: ' + JSON.stringify(m.id) + ', name: ' + JSON.stringify(m.name) + ', desc: ' + JSON.stringify(m.desc) + ', start: ' + JSON.stringify(m.start) + (m.scale ? ', scale: ' + m.scale : '') + ', cells: [\n' +
  m.cells.map((r) => '      ' + JSON.stringify(r)).join(',\n') + ',\n    ] },').join('\n');
const out = '/* あいち電鉄 — 盤面データ（tools/genall.js が作成）。エディターで作った盤面は localStorage に入る。\n' +
  ' * cells: [列, 行, 種類, 駅ID]  種類: S=駅 b=青(+) r=赤(-) y=カード e=イベント t=線路だけ（止まらない）\n' +
  ' * となりあう（上下左右の）マスどうしが、道でつながる。陸の外のマスは海路として描く。start はスタートの駅。 */\n' +
  '(function (root) {\n  \'use strict\';\n  const A = (root.Aichi = root.Aichi || {});\n  A.MAPPRESETS = [\n' + body + '\n  ];\n  A.MAPDATA = A.MAPPRESETS[0].cells;\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'mapdata.js'), out);
