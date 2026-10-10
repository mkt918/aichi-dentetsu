/* 盤面の整合性チェック: node test/validate-map.js */
'use strict';
['stations', 'stationtext', 'overrides', 'mapdata', 'data', 'layout', 'board'].forEach((f) => require('../js/' + f + '.js'));
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
if (cardSt.length || plainSt.length) warn('カード駅・通過駅は無くしたはず');
const FULL = A.MAP_INFO.id === 'full', ST0 = A.START_STATION;
note('盤面: ' + A.MAP_INFO.name + '（スタート ' + ST0 + '）');
if (FULL && (A.STATIONS.length < 80 || A.STATIONS.length > 200)) warn('駅は80〜200のはず: ' + A.STATIONS.length);
A.STATIONS.forEach((s) => {
  if (s.card && s.props.length) warn(s.name + ': カード駅なのに物件がある');
  if (!s.card && !s.plain && s.props.length < 3) warn(s.name + ': 物件が少なすぎる ' + s.props.length);
  s.props.forEach((p, i) => { if (i && p.price < s.props[i - 1].price) warn(s.name + ': 物件が安い順になっていない'); });
});
note('5件未満の物件駅: ' + (A.STATIONS.filter((s) => !s.card && !s.plain && s.props.length < 5).map((s) => s.name + s.props.length).join(' ') || 'なし'));
const names = {}; // 同じ駅の中の同じ名前はよい（みかん畑を3つ、など）。ほかの駅と同じ名前はだめ
all.forEach((p) => {
  if (names[p.name] && names[p.name] !== p.station) warn('物件名がほかの駅と重複: ' + p.name);
  names[p.name] = p.station;
  if (!(p.price > 0 && p.rate >= 1)) warn('物件の価格/利回りが不正: ' + p.name);
  if (p.rate >= 10 && p.rate % 5) warn('利回りが5%刻みでない: ' + p.name + ' ' + p.rate);
});
const top = all.reduce((a, b) => (b.price > a.price ? b : a));
note('最高額の物件: ' + top.name + ' ' + top.price + '万円');
if (FULL && (top.name !== '名古屋城' || top.price !== 2000000)) warn('最高額は名古屋城 200億円のはず: ' + top.name + ' ' + top.price);
const cheap = all.filter((p) => p.price <= 1000), rich = all.filter((p) => p.price >= 15000);
note(`安い物件(1000万以下) ${cheap.length}件 利回り ${Math.min(...cheap.map((p) => p.rate))}〜${Math.max(...cheap.map((p) => p.rate))}% / 高い物件(1.5億以上) ${rich.length}件 利回り ${Math.min(...rich.map((p) => p.rate))}〜${Math.max(...rich.map((p) => p.rate))}%`);
cheap.forEach((p) => { if (p.rate < 40) warn('安い物件の利回りが低い: ' + p.name + ' ' + p.rate); });

// 2. グリッド: 駅もマスも、マスの中心に乗る。となりあうマスは上下左右だけ（斜めなし）
B.nodes.forEach((n) => {
  if (n.x !== n.cx * G || n.y !== n.cy * G) warn('グリッドからずれている: ' + n.id);
  n.adj.forEach((id) => {
    const m = B.byId[id];
    const lk = B.links.find((l) => (l.a === n.id && l.b === id) || (l.b === n.id && l.a === id));
    if (!lk) warn(`道のないつながり: ${n.id}-${id}`);
    else for (let i = 0; i + 1 < lk.pts.length; i++) { const d = Math.abs(lk.pts[i + 1][0] - lk.pts[i][0]) + Math.abs(lk.pts[i + 1][1] - lk.pts[i][1]); if (d !== G) warn(`斜め・飛びのつながり: ${n.id}-${id}`); }
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

// 駅から出る道は4本まで、駅どうしが直接となりあわない
A.STATIONS.forEach((s) => { const n = B.byId[s.id]; if (n.adj.length > 4) warn('道が5本以上ある駅: ' + s.name); n.adj.forEach((id) => { if (B.byId[id].type === 'station' && B.links.find((l) => (l.a === s.id && l.b === id) || (l.b === s.id && l.a === id)).pts.length < 3) warn(`駅どうしが直接となりあう: ${s.name}-${B.byId[id].station}`); }); });
// 駅のまわり8マス（ななめもふくむ）に止まるマスを置かない（分かれ道・行き止まりのマスはしかたないので注意だけ）
A.STATIONS.forEach((s) => B.nodes.forEach((n) => {
  if (n.type === 'station' || Math.max(Math.abs(n.cx - s.cx), Math.abs(n.cy - s.cy)) > 1) return;
  (n.adj.length === 2 ? warn : note)(`駅のすぐとなりに止まるマス: ${s.name} (${n.cx},${n.cy})`);
}));

// 3. 県内にあるか（島・橋・海路は除く）
A.STATIONS.forEach((s) => {
  if (s.island) { if (inside(s, A.OUTLINE)) warn(`島の駅 ${s.name} が陸の上`); return; }
  if (!inside(s, A.OUTLINE)) warn(`駅 ${s.name} が県の輪郭の外 (${s.x},${s.y})`);
});
let water = 0;
B.nodes.filter((n) => n.type !== 'station').forEach((n) => {
  if (!inside(n, A.OUTLINE)) water++;
});
note('海路のマス ' + water + ' 個');
const xs = A.STATIONS.map((s) => s.x), ys = A.STATIONS.map((s) => s.y);
note(`駅の範囲 グリッド ${Math.round((Math.max(...xs) - Math.min(...xs)) / G)}×${Math.round((Math.max(...ys) - Math.min(...ys)) / G)}マス`);

// 4. つながり・距離・マスの数
const d0 = B.distFrom(ST0);
const unreachable = B.nodes.filter((n) => d0[n.id] === undefined);
if (unreachable.length) warn('到達できないノード: ' + unreachable.length + '個');
const types = {};
B.nodes.forEach((n) => { types[n.type] = (types[n.type] || 0) + 1; });
note(`ノード ${B.nodes.length} ${JSON.stringify(types)} 道 ${B.links.length}区間 / スタートからの最大距離 ${Math.max(...Object.values(d0))}マス`);
const kinds = {};
B.links.forEach((l) => { kinds[l.kind] = (kinds[l.kind] || 0) + 1; });
note('道の種類 ' + JSON.stringify(kinds));
A.STATIONS.forEach((s) => { if (!B.byId[s.id].adj.length) warn('道につながっていない駅: ' + s.name); });
// 県全体のマップには、細かさ1（lv なし）の駅がぜんぶ置かれているはず（lv: 2 は地域の細かいマップだけの駅）
const LV1 = A.RAW_STATIONS.filter((r) => (r.lv || 1) <= 1);
if (FULL && LV1.some((r) => !A.STATIONS.some((s) => s.id === r.id))) warn('盤面に置かれていない駅: ' + LV1.filter((r) => !A.STATIONS.some((s) => s.id === r.id)).map((r) => r.name).join(' '));
if (FULL && A.STATIONS.some((s) => s.lv > 1)) warn('県全体のマップに細かいマップだけの駅がある');

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
  })(ST0, null);
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
  const multi = A.STATIONS.filter((s) => comp[s.id] === comp[ST0]).length;
  note(`2通り以上の行き方がある駅 ${multi}/${A.STATIONS.length}`);
  if (FULL && multi < A.STATIONS.length * 0.7) warn('行き方が複数ある駅が7割に届かない: ' + multi);
}

// 6. ラベル
const bad = A.STATIONS.filter((s) => B.labels[s.id].score >= 60).map((s) => s.name + ':' + B.labels[s.id].score.toFixed(0));
note('駅名ラベルがほかの駅や海岸とぶつかる駅: ' + (bad.join(' ') || 'なし'));

console.log(problems ? `\n問題 ${problems} 件` : '\n盤面チェック OK');
process.exitCode = problems ? 1 : 0;
