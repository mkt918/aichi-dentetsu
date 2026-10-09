/* 盤面の整合性チェック: node test/validate-map.js */
'use strict';
['stations', 'data', 'layout', 'board'].forEach((f) => require('../js/' + f + '.js'));
const A = globalThis.Aichi;
const B = A.Board;
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
function distToPoly(pt, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((pt.x - x1) * dx + (pt.y - y1) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(pt.x - (x1 + t * dx), pt.y - (y1 + t * dy)));
  }
  return best;
}
function segInter(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

// 1. 駅の数・物件の数
const props = A.STATIONS.reduce((s, x) => s + x.props.length, 0);
const cardSt = A.STATIONS.filter((s) => s.card);
note(`駅 ${A.STATIONS.length}（物件駅 ${A.STATIONS.length - cardSt.length} / カード駅 ${cardSt.length} / カード売り場 ${A.STATIONS.filter((s) => s.shop).length}）, 物件 ${props}`);
if (A.STATIONS.length !== 100) warn('駅が100ではない: ' + A.STATIONS.length);
A.STATIONS.forEach((s) => {
  if (s.card && s.props.length) warn(s.name + ': カード駅なのに物件がある');
  if (!s.card && s.props.length < 3) warn(s.name + ': 物件が少なすぎる ' + s.props.length);
});
const few = A.STATIONS.filter((s) => !s.card && s.props.length < 5);
note('5件未満の物件駅: ' + (few.map((s) => s.name + s.props.length).join(' ') || 'なし'));
const names = new Set();
A.STATIONS.forEach((s) => s.props.forEach((p) => {
  if (names.has(p.name)) warn('物件名が重複: ' + p.name);
  names.add(p.name);
  if (!(p.price > 0 && p.rate >= 1)) warn('物件の価格/利回りが不正: ' + p.name);
}));
const cheap = A.STATIONS.flatMap((s) => s.props).filter((p) => p.price <= 1000);
const rich = A.STATIONS.flatMap((s) => s.props).filter((p) => p.price >= 15000);
note(`安い物件(1000万以下) ${cheap.length}件 利回り ${Math.min(...cheap.map((p) => p.rate))}〜${Math.max(...cheap.map((p) => p.rate))}% / 高い物件(1.5億以上) ${rich.length}件 利回り ${Math.min(...rich.map((p) => p.rate))}〜${Math.max(...rich.map((p) => p.rate))}%`);
cheap.forEach((p) => { if (p.rate < 40) warn('安い物件の利回りが低い: ' + p.name + ' ' + p.rate); });

// 2. 駅が県内にあるか／海岸からの距離
A.STATIONS.forEach((s) => {
  if (s.island) return;
  if (!inside(s, A.OUTLINE)) warn(`駅 ${s.name} が県の輪郭の外 (${s.x},${s.y})`);
  else if (distToPoly(s, A.OUTLINE) < 30) note(`(注意) ${s.name} は海岸/県境に近い: ${distToPoly(s, A.OUTLINE).toFixed(0)}px`);
});
A.STATIONS.forEach((s) => { if (s.island && inside(s, A.OUTLINE)) warn(`島の駅 ${s.name} が陸の上`); });

// 3. 駅同士の最小距離
let minD = Infinity;
for (let i = 0; i < A.STATIONS.length; i++) for (let j = i + 1; j < A.STATIONS.length; j++) {
  const d = Math.hypot(A.STATIONS[i].x - A.STATIONS[j].x, A.STATIONS[i].y - A.STATIONS[j].y);
  minD = Math.min(minD, d);
  if (d < 78) warn(`駅が近すぎる: ${A.STATIONS[i].name}-${A.STATIONS[j].name} ${d.toFixed(0)}px`);
}
note('駅どうしの最小距離 ' + minD.toFixed(0) + 'px');
// 地図の大きさ
const xs = A.STATIONS.map((s) => s.x), ys = A.STATIONS.map((s) => s.y);
note(`駅の範囲 x ${Math.min(...xs)}〜${Math.max(...xs)} / y ${Math.min(...ys)}〜${Math.max(...ys)}（世界 ${Math.round(1200 * A.K)}x${Math.round(1000 * A.K)}）`);

// 4. 全ノード間の最小距離（マス同士が重ならないか）
for (let i = 0; i < B.nodes.length; i++) for (let j = i + 1; j < B.nodes.length; j++) {
  const a = B.nodes[i], b = B.nodes[j];
  if (a.adj.includes(b.id)) continue;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const lim = (a.type === 'station' || b.type === 'station') ? 32 : 24;
  if (d < lim) warn(`ノードが近すぎる: ${a.id}(${a.station || a.type}) - ${b.id}(${b.station || b.type}) ${d.toFixed(0)}px`);
}
B.nodes.forEach((a) => a.adj.forEach((id) => {
  const b = B.byId[id];
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (a.id < b.id && d < 26) warn(`隣接マスが詰まりすぎ: ${a.id}-${b.id} ${d.toFixed(0)}px`);
}));

// 5. 路線の交差（曲線を折れ線近似）
function poly(edge) { return edge.chain.map((id) => B.byId[id]); }
for (let i = 0; i < B.edges.length; i++) for (let j = i + 1; j < B.edges.length; j++) {
  const pa = poly(B.edges[i]), pb = poly(B.edges[j]);
  let hit = false;
  for (let a = 0; a < pa.length - 1 && !hit; a++) for (let b = 0; b < pb.length - 1 && !hit; b++) {
    if (segInter(pa[a], pa[a + 1], pb[b], pb[b + 1])) hit = true;
  }
  if (hit) warn(`路線が交差: ${B.edges[i].a}-${B.edges[i].b} × ${B.edges[j].a}-${B.edges[j].b}`);
}
// 駅の上を別の路線が通っていないか
B.edges.forEach((e) => {
  const pts = poly(e);
  A.STATIONS.forEach((s) => {
    if (s.id === e.a || s.id === e.b) return;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(s.x - (a.x + t * dx), s.y - (a.y + t * dy)) < 30) { warn(`路線 ${e.a}-${e.b} が駅 ${s.name} の上を通る`); return; }
    }
  });
});

// 6. 路線の中点が陸の上か（海路・橋は除く）
B.nodes.filter((n) => n.type !== 'station').forEach((n) => {
  const e = B.edges[n.edge];
  if (!inside(n, A.OUTLINE) && !e.sea && !e.bridge) warn(`マス ${n.id}(${e.a}-${e.b}) が海上 (${n.x},${n.y})`);
});

// 7. 連結性・距離
const d0 = B.distFrom('nagoya');
const unreachable = B.nodes.filter((n) => d0[n.id] === undefined);
if (unreachable.length) warn('到達できないノード: ' + unreachable.map((n) => n.id).join(','));
const far = Math.max(...Object.values(B.distFrom('inuyama')));
const types = {};
B.nodes.forEach((n) => { types[n.type] = (types[n.type] || 0) + 1; });
note(`ノード ${B.nodes.length} ${JSON.stringify(types)} 路線 ${B.edges.length} / 犬山からの最大距離 ${far}マス / 名古屋→豊橋 ${d0.toyohashi}マス / 名古屋→伊良湖 ${d0.irago}マス`);
const deg = {}; B.edges.forEach((e) => { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
const hub = Object.keys(deg).sort((a, b) => deg[b] - deg[a]).slice(0, 5).map((k) => k + ':' + deg[k]).join(' ');
note('つながりの多い駅 ' + hub);
A.STATIONS.forEach((s) => { if (!deg[s.id]) warn('路線につながっていない駅: ' + s.name); });

// 8. ラベル
const bad = A.STATIONS.filter((s) => B.labels[s.id].score >= 5).map((s) => s.name + ':' + B.labels[s.id].score.toFixed(0));
note('駅名ラベルが重なりぎみの駅: ' + (bad.join(' ') || 'なし'));

console.log(problems ? `\n問題 ${problems} 件` : '\n盤面チェック OK');
process.exitCode = problems ? 1 : 0;
