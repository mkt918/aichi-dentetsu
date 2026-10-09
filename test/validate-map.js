/* 盤面の整合性チェック: node test/validate-map.js */
'use strict';
['stations', 'overrides', 'data', 'layout', 'board'].forEach((f) => require('../js/' + f + '.js'));
const A = globalThis.Aichi;
const B = A.Board, G = A.GRID;
let problems = 0;
const warn = (m) => { problems++; console.log('✗ ' + m); };
const note = (m) => console.log('  ' + m);

function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// 1. 駅・物件
const all = A.STATIONS.flatMap((s) => s.props);
const cardSt = A.STATIONS.filter((s) => s.card);
const plainSt = A.STATIONS.filter((s) => s.plain), propSt = A.STATIONS.filter((s) => !s.card && !s.plain);
note(`駅 ${A.STATIONS.length}（物件駅 ${propSt.length} / カード駅 ${cardSt.length} / 通過駅(地下鉄など) ${plainSt.length} / カード売り場 ${A.STATIONS.filter((s) => s.shop).length}）, 物件 ${all.length}`);
if (propSt.length !== 88 || cardSt.length !== 12) warn('物件駅88・カード駅12のはず');
if (A.STATIONS.length < 100) warn('駅が100未満: ' + A.STATIONS.length);
A.STATIONS.forEach((s) => {
  if (s.card && s.props.length) warn(s.name + ': カード駅なのに物件がある');
  if (!s.card && !s.plain && s.props.length < 3) warn(s.name + ': 物件が少なすぎる ' + s.props.length);
  s.props.forEach((p, i) => { if (i && p.price < s.props[i - 1].price) warn(s.name + ': 物件が安い順になっていない'); });
});
note('5件未満の物件駅: ' + (A.STATIONS.filter((s) => !s.card && !s.plain && s.props.length < 5).map((s) => s.name + s.props.length).join(' ') || 'なし'));
const names = new Set();
all.forEach((p) => {
  if (names.has(p.name)) warn('物件名が重複: ' + p.name);
  names.add(p.name);
  if (!(p.price > 0 && p.rate >= 1)) warn('物件の価格/利回りが不正: ' + p.name);
  if (p.rate >= 10 && p.rate % 5) warn('利回りが5%刻みでない: ' + p.name + ' ' + p.rate);
});
const top = all.reduce((a, b) => (b.price > a.price ? b : a));
note('最高額の物件: ' + top.name + ' ' + top.price + '万円');
if (top.name !== '名古屋城' || top.price !== 2000000) warn('最高額は名古屋城 200億円のはず: ' + top.name + ' ' + top.price);
const cheap = all.filter((p) => p.price <= 1000), rich = all.filter((p) => p.price >= 15000);
note(`安い物件(1000万以下) ${cheap.length}件 利回り ${Math.min(...cheap.map((p) => p.rate))}〜${Math.max(...cheap.map((p) => p.rate))}% / 高い物件(1.5億以上) ${rich.length}件 利回り ${Math.min(...rich.map((p) => p.rate))}〜${Math.max(...rich.map((p) => p.rate))}%`);
cheap.forEach((p) => { if (p.rate < 40) warn('安い物件の利回りが低い: ' + p.name + ' ' + p.rate); });

// 2. グリッド: 駅もマスも、マスの中心に乗る。となりあうマスは上下左右だけ（斜めなし）
B.nodes.forEach((n) => {
  if (n.x !== n.cx * G || n.y !== n.cy * G) warn('グリッドからずれている: ' + n.id);
  n.adj.forEach((id) => {
    const m = B.byId[id];
    if (Math.abs(m.cx - n.cx) + Math.abs(m.cy - n.cy) !== 1) warn(`斜め・飛びのつながり: ${n.id}-${id}`);
  });
});
let minGap = Infinity;
for (let i = 0; i < A.STATIONS.length; i++) for (let j = i + 1; j < A.STATIONS.length; j++) {
  const a = A.STATIONS[i], b = A.STATIONS[j];
  const d = Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
  minGap = Math.min(minGap, d);
  if (d < 3) warn(`駅が近すぎる(あいだに2マス欲しい): ${a.name}-${b.name}`);
}
note('駅どうしの最小のきょり ' + minGap + 'マス（グリッド）');

// 駅と駅のあいだに、線路の見えるマスが2つ以上ある
B.edges.forEach((e) => { if (e.chain.length < 4) warn(`駅のあいだが近すぎる: ${e.a}-${e.b}`); });

// 3. 県内にあるか（島・橋・海路は除く）
A.STATIONS.forEach((s) => {
  if (s.island) { if (inside(s, A.OUTLINE)) warn(`島の駅 ${s.name} が陸の上`); return; }
  if (!inside(s, A.OUTLINE)) warn(`駅 ${s.name} が県の輪郭の外 (${s.x},${s.y})`);
});
let water = 0;
B.nodes.filter((n) => n.type !== 'station').forEach((n) => {
  if (!inside(n, A.OUTLINE)) { const e = B.edges[n.edge]; if (!(e.sea || e.bridge)) { water++; if (water <= 5) warn(`マス ${n.id}(${e.a}-${e.b}) が海上 (${n.x},${n.y})`); } }
});
if (water > 5) warn('海上のマス ほか ' + (water - 5) + ' 個');
const xs = A.STATIONS.map((s) => s.x), ys = A.STATIONS.map((s) => s.y);
note(`駅の範囲 グリッド ${Math.round((Math.max(...xs) - Math.min(...xs)) / G)}×${Math.round((Math.max(...ys) - Math.min(...ys)) / G)}マス`);

// 4. つながり・距離・マスの数
const d0 = B.distFrom('nagoya');
const unreachable = B.nodes.filter((n) => d0[n.id] === undefined);
if (unreachable.length) warn('到達できないノード: ' + unreachable.length + '個');
const types = {};
B.nodes.forEach((n) => { types[n.type] = (types[n.type] || 0) + 1; });
note(`ノード ${B.nodes.length} ${JSON.stringify(types)} 道 ${B.links.length}区間 / 犬山からの最大距離 ${Math.max(...Object.values(B.distFrom('inuyama')))}マス / 名古屋→豊橋 ${d0.toyohashi}マス / 名古屋→伊良湖 ${d0.irago}マス`);
const kinds = {};
B.links.forEach((l) => { kinds[l.kind] = (kinds[l.kind] || 0) + 1; });
note('道の種類 ' + JSON.stringify(kinds));
const deg = {}; A.EDGES.forEach((e) => { deg[e[0]] = (deg[e[0]] || 0) + 1; deg[e[1]] = (deg[e[1]] || 0) + 1; });
A.STATIONS.forEach((s) => { if (!deg[s.id]) warn('路線につながっていない駅: ' + s.name); });

// 5. 行き方が複数ある駅（橋＝切るとつながらなくなる道、をのぞいた輪の中にある駅）が7割以上
{
  const tin = {}, low = {}, bridges = new Set(); let t = 0;
  (function dfs(v, p) {
    tin[v] = low[v] = ++t;
    for (const u of B.byId[v].adj) {
      if (u === p) continue;
      if (tin[u]) low[v] = Math.min(low[v], tin[u]);
      else { dfs(u, v); low[v] = Math.min(low[v], low[u]); if (low[u] > tin[v]) bridges.add(v < u ? v + '|' + u : u + '|' + v); }
    }
  })('nagoya', null);
  const comp = {}; let c = 0;
  B.nodes.forEach((n) => {
    if (comp[n.id] !== undefined) return;
    const q = [n.id]; comp[n.id] = c;
    for (let i = 0; i < q.length; i++) for (const u of B.byId[q[i]].adj) {
      const k = q[i] < u ? q[i] + '|' + u : u + '|' + q[i];
      if (bridges.has(k) || comp[u] !== undefined) continue;
      comp[u] = c; q.push(u);
    }
    c++;
  });
  const multi = A.STATIONS.filter((s) => comp[s.id] === comp.nagoya).length;
  note(`2通り以上の行き方がある駅 ${multi}/${A.STATIONS.length}`);
  if (multi < A.STATIONS.length * 0.7) warn('行き方が複数ある駅が7割に届かない: ' + multi);
}

// 6. ラベル
const bad = A.STATIONS.filter((s) => B.labels[s.id].score >= 60).map((s) => s.name + ':' + B.labels[s.id].score.toFixed(0));
note('駅名ラベルがほかの駅や海岸とぶつかる駅: ' + (bad.join(' ') || 'なし'));

console.log(problems ? `\n問題 ${problems} 件` : '\n盤面チェック OK');
process.exitCode = problems ? 1 : 0;
