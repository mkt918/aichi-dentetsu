/* あいち電鉄 — 盤面の自動生成（Node 専用）: node tools/genmap.js
 * 駅の配置（layout.js）と路線（data.js の EDGES）から、グリッドの盤面を作って js/mapdata.js に書き出す。
 * ゲームは js/mapdata.js（とエディターで保存した盤面）だけを使う。ここを動かし直さないかぎり盤面は変わらない。
 *
 * 方針（見やすさ優先）
 *  - 駅どうしは上下左右に2マス以上あける。近い駅は、縦か横の並びにそろえる（線がまっすぐになる）。
 *  - 駅と駅は「まっすぐ」「L字」「Z字（折れ2回）」の順に、いちばん素直な形でつなぐ。
 *  - 道どうしはくっつけない（となりのマスに別の道を通さない）。くっつくと勝手に分かれ道になるため。
 *  - 一本道のマスは1つおきに「止まるマス」にする（のこりは線路だけ）。分かれ道は必ず止まるマス。 */
'use strict';
const fs = require('fs');
const path = require('path');
['stations', 'stationtext', 'overrides', 'data', 'layout'].forEach((f) => require('../js/' + f + '.js'));
const A = globalThis.Aichi;
const G = A.GRID;
const STEP = Number(process.env.STEP || 3); // 一本道で、止まるマスを何マスに1つ置くか

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const inPoly = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const landC = new Map();
const isLand = (x, y) => { const k = x + ',' + y; if (!landC.has(k)) landC.set(k, inPoly(x * G, y * G, A.OUTLINE)); return landC.get(k); };
const K = (x, y) => x + ',' + y;

// ---------- 1. 駅をマスに置く ----------
// SPEC='{"nagoya":2,"owari":1}' のように、地域ごとに「どの細かさ（lv）の駅まで入れるか」をわたすと、その地域だけの盤面を作る。
// わたさなければ県全体（細かさ1の駅だけ）。スタートの駅（START）は必ず入れる。縮尺は MAP_SCALE（data.js が読む）
const SPEC = process.env.SPEC ? JSON.parse(process.env.SPEC) : null;
// BBOX='[経度0,緯度0,経度1,緯度1]' をわたすと、その範囲の駅だけにする（名古屋の町なかのマップ）
const BBOX = process.env.BBOX ? JSON.parse(process.env.BBOX) : null;
const inBox = (s) => !BBOX || (s.lon >= BBOX[0] && s.lat >= BBOX[1] && s.lon <= BBOX[2] && s.lat <= BBOX[3]);
const S = A.STATIONS.filter((s) => ((SPEC ? SPEC[s.region] || 0 : 1) >= s.lv && inBox(s)) || s.id === process.env.START);
const SID = new Set(S.map((s) => s.id));
const EDGES = A.buildEdges(SID, process.env.GEN_MAP); // GEN_MAP はマップのID（そのマップだけの道を足す）。 路線の途中の駅がこの盤面になければ、とばして前後をつなぐ
const cell = {};
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const okAt = (id, x, y) => S.every((o) => o.id === id || !cell[o.id] || cheb(cell[o.id], [x, y]) >= 3) && (S.find((s) => s.id === id).island ? !isLand(x, y) : isLand(x, y));
S.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0)).forEach((s) => {
  const ox = s.x / G, oy = s.y / G;
  let best = null;
  for (let r = 0; r <= 24 && !best; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = Math.round(ox) + dx, y = Math.round(oy) + dy;
      if (!okAt(s.id, x, y)) continue;
      const d = Math.hypot(x - ox, y - oy);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) throw new Error('駅を置けない: ' + s.name);
  cell[s.id] = [best.x, best.y];
});
// 近い駅を、縦・横の並びにそろえる（となりの駅とのずれが1〜2マスなら、片方をずらす）
const deg = {}; EDGES.forEach(([a, b]) => { deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; });
for (let pass = 0; pass < 6; pass++) {
  let moved = 0;
  EDGES.forEach(([a, b]) => {
    const pa = cell[a], pb = cell[b];
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
    const tryMove = (id, x, y) => { const p = cell[id]; delete cell[id]; if (okAt(id, x, y)) { cell[id] = [x, y]; moved++; return true; } cell[id] = p; return false; };
    // 動かすのは、つながりの少ないほう
    const [m, f] = (deg[a] || 0) <= (deg[b] || 0) ? [a, b] : [b, a];
    if (Math.abs(dx) >= 1 && Math.abs(dx) <= 2 && Math.abs(dy) >= 3) {
      if (!tryMove(m, cell[f][0], cell[m][1])) tryMove(f, cell[m][0], cell[f][1]);
    } else if (Math.abs(dy) >= 1 && Math.abs(dy) <= 2 && Math.abs(dx) >= 3) {
      if (!tryMove(m, cell[m][0], cell[f][1])) tryMove(f, cell[f][0], cell[m][1]);
    }
  });
  if (!moved) break;
}

// ---------- 2. 駅と駅をつなぐ ----------
const stAt = new Map(); S.forEach((s) => stAt.set(K(...cell[s.id]), s.id));
const used = new Map(); // マス -> 道の数
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function lineCells(pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    if (i === 0) out.push([x, y]);
    while (x !== x1 || y !== y1) { x += sx; y += sy; out.push([x, y]); }
  }
  return out;
}
// 経路の途中マスが使えるか（strict: となりに別の道・別の駅があってもだめ）
function cellOk(x, y, a, b, water, strict) {
  const k = K(x, y);
  if (stAt.has(k)) return false;
  if (used.has(k)) return !strict ? 'share' : false;
  if (!water && !isLand(x, y)) return false;
  if (strict) {
    for (const [dx, dy] of D4) {
      const nk = K(x + dx, y + dy);
      if (used.has(nk)) return false;
      const st = stAt.get(nk);
      if (st && st !== a && st !== b) return false;
    }
  }
  return true;
}
function pathOk(cells, a, b, water, strict) {
  const inner = cells.slice(1, -1);
  if (!inner.length) return false; // 駅どうしが直接となりあうのはだめ（マスが要る）
  for (let i = 0; i < inner.length; i++) {
    const [x, y] = inner[i];
    if (!cellOk(x, y, a, b, water, strict)) return false;
    // 途中で出発駅・到着駅のとなりに戻ってこない
    if (strict && i > 0 && i < inner.length - 1) {
      for (const st of [cell[a], cell[b]]) if (Math.abs(st[0] - x) + Math.abs(st[1] - y) === 1) return false;
    }
  }
  return true;
}
function turns(cells) { let t = 0; for (let i = 2; i < cells.length; i++) { const d1 = [cells[i - 1][0] - cells[i - 2][0], cells[i - 1][1] - cells[i - 2][1]], d2 = [cells[i][0] - cells[i - 1][0], cells[i][1] - cells[i - 1][1]]; if (d1[0] !== d2[0] || d1[1] !== d2[1]) t++; } return t; }
function candidates(p, q) {
  const [ax, ay] = p, [bx, by] = q, list = [];
  if (ax === bx || ay === by) list.push([p, q]);
  list.push([p, [bx, ay], q], [p, [ax, by], q]);
  const lo = (u, v) => Math.min(u, v), hi = (u, v) => Math.max(u, v);
  for (let mx = lo(ax, bx) + 1; mx < hi(ax, bx); mx++) list.push([p, [mx, ay], [mx, by], q]);
  for (let my = lo(ay, by) + 1; my < hi(ay, by); my++) list.push([p, [ax, my], [bx, my], q]);
  // 少しはみ出す形（コの字）
  for (const o of [1, 2, 3]) {
    list.push([p, [ax, lo(ay, by) - o], [bx, lo(ay, by) - o], q], [p, [ax, hi(ay, by) + o], [bx, hi(ay, by) + o], q]);
    list.push([p, [lo(ax, bx) - o, ay], [lo(ax, bx) - o, by], q], [p, [hi(ax, bx) + o, ay], [hi(ax, bx) + o, by], q]);
  }
  return list.map(lineCells).filter((c) => { const s = new Set(c.map((z) => K(...z))); return s.size === c.length; });
}
function astar(a, b, water, strict) {
  const [sx, sy] = cell[a], goal = K(...cell[b]);
  const open = [[0, sx, sy, -1, 0]], best = new Map([[K(sx, sy) + '|-1', 0]]), from = new Map();
  let iter = 0;
  while (open.length && iter++ < 60000) {
    open.sort((u, v) => u[0] - v[0]);
    const [, x, y, dir, g] = open.shift();
    for (let d = 0; d < 4; d++) {
      const nx = x + D4[d][0], ny = y + D4[d][1], nk = K(nx, ny);
      if (nk === goal) {
        const out = [[nx, ny], [x, y]];
        let k = K(x, y) + '|' + dir;
        while (from.has(k)) { const f = from.get(k); out.push([f[0], f[1]]); k = K(f[0], f[1]) + '|' + f[2]; }
        return out.reverse();
      }
      const ok = cellOk(nx, ny, a, b, water, strict);
      if (!ok) continue;
      const ng = g + 1 + (dir >= 0 && dir !== d ? 0.6 : 0) + (ok === 'share' ? 3 : 0) + (!isLand(nx, ny) && !water ? 50 : 0);
      const key = nk + '|' + d;
      if (ng < (best.get(key) ?? Infinity)) {
        best.set(key, ng); from.set(key, [x, y, dir]);
        open.push([ng + Math.abs(nx - cell[b][0]) + Math.abs(ny - cell[b][1]), nx, ny, d, ng]);
      }
    }
  }
  return null;
}
// つなぐ順: まず全駅がつながる「骨組み」（実際の鉄道を優先して短い順）、そのあと輪を作る道。
// 1つの駅から出る道は4本まで（上下左右に1本ずつ）。道どうしは重ねず、くっつけない。
const all = EDGES.map(([a, b, opt]) => ({ a, b, water: !!(opt && (opt.sea || opt.bridge)), rail: !!(opt && opt.rail), len: Math.abs(cell[a][0] - cell[b][0]) + Math.abs(cell[a][1] - cell[b][1]), prio: (opt && +opt.prio) || 0 }));
// SEED を変えると、道を引く順番を少しゆらす（genall.js が何通りか作って、いちばん輪の多い盤面をえらぶ）。0 ならゆらさない
const jr = +process.env.SEED ? mulberry32(+process.env.SEED) : null;
all.forEach((e) => { e.j = jr ? 0.6 + 0.8 * jr() : 1; });
const w = (e) => -1000 * e.prio + e.len * (e.rail ? 1 : 1.6) * e.j; // prio の道（骨組みにしたい道）は先に引く。数が大きいほど先
all.sort((u, v) => w(u) - w(v));
const degN = {}; S.forEach((s) => { degN[s.id] = 0; });
const parent = {}; S.forEach((s) => { parent[s.id] = s.id; });
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
const routes = [];
const fails = [];
const PRIO_TURNS = +process.env.PRIO_TURNS || 8; // 骨組みの道で許す曲がりの数（地域マップは genall.js が多めにわたす）
function route(e, mode) {
  let path = null;
  if (mode !== 'loose') {
    const c = candidates(cell[e.a], cell[e.b]).filter((cs) => pathOk(cs, e.a, e.b, e.water, true));
    c.sort((u, v) => u.length + turns(u) * 2 - (v.length + turns(v) * 2));
    if (c.length) path = c[0];
    if (!path) path = astar(e.a, e.b, e.water, true);
    if (path && turns(path) > (e.prio ? PRIO_TURNS : 4)) path = null; // くねくねした道は作らない（骨組みの道は、海岸ぞいなどで少し曲がってもよい）
  } else {
    path = astar(e.a, e.b, e.water, true) || astar(e.a, e.b, e.water, false);
  }
  if (path && e.water && path.length - 1 > e.len * 2 + 6) path = null; // 海路が大回り（半島の外をまわる など）になるなら引かない
  return path;
}
function commit(e, path) {
  path.slice(1, -1).forEach(([x, y]) => used.set(K(x, y), (used.get(K(x, y)) || 0) + 1));
  degN[e.a]++; degN[e.b]++; parent[find(e.a)] = find(e.b); routes.push(e);
}
function nearAll() {
  const out = [];
  S.forEach((s, i) => S.forEach((o, j) => { if (j <= i) return; const d = Math.abs(cell[s.id][0] - cell[o.id][0]) + Math.abs(cell[s.id][1] - cell[o.id][1]); if (d <= 10 && !s.island && !o.island) out.push({ a: s.id, b: o.id, water: false, rail: false, len: d }); }));
  return out;
}
// 1) 骨組み
all.forEach((e) => {
  if (find(e.a) === find(e.b) || degN[e.a] >= 4 || degN[e.b] >= 4) return;
  const p = route(e, 'strict');
  if (p) commit(e, p);
});
const loosePass = () => all.concat(nearAll()).sort((u, v) => u.len - v.len).forEach((e) => { // まだつながっていない駅は、くっついてもよいからつなぐ
  if (find(e.a) === find(e.b)) return;
  const p = route(e, 'loose');
  if (p) { commit(e, p); fails.push(e.a + '-' + e.b + '(くっつけた)'); }
});
// 骨組みで引けなかった所は、ほかの道（道路・近い駅どうし）できれいに引けないか試す
nearAll().sort((u, v) => u.len - v.len).forEach((e) => {
  if (find(e.a) === find(e.b) || degN[e.a] >= 4 || degN[e.b] >= 4) return;
  const p = route(e, 'strict');
  if (p) commit(e, p);
});
loosePass();
// それでも離れている所は、いちばん近い駅どうしをつなぐ
for (let guard = 0; guard < 40; guard++) {
  const roots = new Set(S.map((s) => find(s.id)));
  if (roots.size <= 1) break;
  let best = null;
  S.forEach((s) => S.forEach((o) => { if (find(s.id) === find(o.id) || s.island || o.island) return; const d = Math.abs(cell[s.id][0] - cell[o.id][0]) + Math.abs(cell[s.id][1] - cell[o.id][1]); if (!best || d < best.len) best = { a: s.id, b: o.id, water: false, rail: false, len: d }; }));
  if (!best) break;
  const p = route(best, 'strict') || route(best, 'loose');
  if (!p) { fails.push(best.a + '-' + best.b + '(つなげない)'); break; }
  commit(best, p);
}
// 2) 輪を作る道（駅の手が空いていて、きれいに引ける道だけ）
all.forEach((e) => {
  if (routes.includes(e) || degN[e.a] >= 4 || degN[e.b] >= 4) return;
  const p = route(e, 'strict');
  if (p) commit(e, p);
});
// 3) まだ足りなければ、近い駅どうしを新しくつなぐ（行き止まりの駅を優先）
const near = nearAll();
near.sort((u, v) => (degN[u.a] === 1 || degN[u.b] === 1 ? 0 : 1) - (degN[v.a] === 1 || degN[v.b] === 1 ? 0 : 1) || u.len - v.len);
near.forEach((e) => {
  if (routes.some((r) => (r.a === e.a && r.b === e.b) || (r.a === e.b && r.b === e.a))) return;
  if (degN[e.a] >= 4 || degN[e.b] >= 4) return;
  if (!(degN[e.a] === 1 || degN[e.b] === 1)) return;
  const p = route(e, 'strict');
  if (p) commit(e, p);
});

// 4) 近いのに遠回りしないと行けない駅どうしに、近道を足す（駅の手が空いていて、きれいに引けるときだけ）
{
  const hops = (s, g) => { const adj = {}; routes.forEach((r) => { (adj[r.a] = adj[r.a] || []).push(r.b); (adj[r.b] = adj[r.b] || []).push(r.a); }); const d = { [s]: 0 }, q = [s]; for (let i = 0; i < q.length; i++) for (const u of adj[q[i]] || []) if (d[u] === undefined) { d[u] = d[q[i]] + 1; q.push(u); } return d[g] === undefined ? 99 : d[g]; };
  nearAll().filter((e) => e.len <= 9).sort((u, v) => u.len - v.len).forEach((e) => {
    if (degN[e.a] >= 4 || degN[e.b] >= 4) return;
    if (routes.some((r) => (r.a === e.a && r.b === e.b) || (r.a === e.b && r.b === e.a))) return;
    if (hops(e.a, e.b) < 4) return;
    const p = route(e, 'strict');
    if (p && p.length - 1 <= e.len + 2) commit(e, p);
  });
}

// ---------- 3. マスの種類 ----------
const cells = new Map(); // key -> {x,y,t,st}
S.forEach((s) => cells.set(K(...cell[s.id]), { x: cell[s.id][0], y: cell[s.id][1], t: 'S', st: s.id }));
used.forEach((_, k) => { const [x, y] = k.split(',').map(Number); cells.set(k, { x, y, t: '?' }); });
const nb = (c) => D4.map(([dx, dy]) => cells.get(K(c.x + dx, c.y + dy))).filter(Boolean);
// 分かれ道・行き止まりは止まるマス。一本道は、端から1つおきに止まるマス
cells.forEach((c) => { if (c.t === '?' && nb(c).length !== 2) c.t = 'stop'; });
const seen = new Set();
cells.forEach((c) => {
  if (c.t === '?' || c.t === 't' || c.t === 'stop' && false) return;
  if (c.t !== 'S' && c.t !== 'stop') return;
  nb(c).forEach((n0) => {
    if (n0.t !== '?' || seen.has(K(n0.x, n0.y) + '<' + K(c.x, c.y))) return;
    const run = []; let prev = c, cur = n0;
    while (cur && cur.t === '?') { run.push(cur); const nx = nb(cur).find((m) => m !== prev); prev = cur; cur = nx; }
    if (cur) seen.add(K(run[run.length - 1].x, run[run.length - 1].y) + '<' + K(cur.x, cur.y));
    const n = run.length;
    // n マスのうち、止まるマスは ceil(n/2)。線路だけのマスが2つ続かないように
    // 止まるマスは、およそ STEP マスに1つ。両はしの線路だけの区間が長くなりすぎないよう、まん中に寄せて置く
    const k = Math.max(1, Math.round(n / STEP));
    run.forEach((r) => { r.t = 't'; });
    for (let j = 0; j < k; j++) run[Math.min(n - 1, Math.floor(((j + 0.5) * n) / k))].t = 'stop';
  });
});
cells.forEach((c) => { if (c.t === '?') c.t = 'stop'; }); // 輪だけで駅のないところ（まずない）
const stops = Array.from(cells.values()).filter((c) => c.t === 'stop').sort((u, v) => u.y - v.y || u.x - v.x);
const rnd = mulberry32(20261009);
const M = A.SQUARE_MIX, N = stops.length;
const bag = [];
for (let i = 0; i < Math.round(N * M.yellow); i++) bag.push('y');
for (let i = 0; i < Math.round(N * M.event); i++) bag.push('e');
for (let i = 0; i < Math.round(N * M.red); i++) bag.push('r');
while (bag.length < N) bag.push('b');
for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
stops.forEach((c, i) => { c.t = bag[i]; });
// 同じ色（青以外）が、線路づたいに続かないように入れかえる
const stopNbrs = (c) => { const out = []; nb(c).forEach((n0) => { let prev = c, cur = n0; while (cur && cur.t === 't') { const nx = nb(cur).find((m) => m !== prev); prev = cur; cur = nx; } if (cur && cur.t !== 'S') out.push(cur); }); return out; };
stops.forEach((c) => {
  if (c.t === 'b' || !stopNbrs(c).some((m) => m.t === c.t)) return;
  const sw = stops.find((m) => m.t === 'b' && !stopNbrs(m).some((z) => z.t === c.t));
  if (sw) { sw.t = c.t; c.t = 'b'; }
});

// ---------- 4. 書き出し ----------
const list = Array.from(cells.values()).sort((u, v) => u.y - v.y || u.x - v.x);
const rows = list.map((c) => (c.t === 'S' ? [c.x, c.y, 'S', c.st] : [c.x, c.y, c.t]));
const cnt = {}; list.forEach((c) => { cnt[c.t] = (cnt[c.t] || 0) + 1; });
const out = '/* あいち電鉄 — 盤面データ（tools/genmap.js が作成。エディターで保存した盤面があれば、そちらが優先）\n' +
  ' * [列, 行, 種類, 駅ID]  種類: S=駅 b=青(+) r=赤(-) y=カード e=イベント t=線路だけ（止まらない）\n' +
  ' * となりあう（上下左右の）マスどうしが、道でつながる。陸の外のマスは海路として描く。 */\n' +
  '(function (root) {\n  \'use strict\';\n  const A = (root.Aichi = root.Aichi || {});\n  A.MAPDATA = [\n' +
  rows.map((r) => '    ' + JSON.stringify(r)).join(',\n') + ',\n  ];\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
// OUT=json のときは盤面を標準出力へ、注意やDBGの図は標準エラーへ出す（js/mapdata.js は書きかえない）
const JSONOUT = process.env.OUT === 'json';
const log = (...m) => (JSONOUT ? console.error : console.log)(...m);
function report() {
  if (fails.length) log('注意:', fails.join(' '));
  if (!process.env.DBG) return;
  process.env.DBG.split(',').forEach((pair) => {
    const [a, b] = pair.split('-');
    const xs = [cell[a][0], cell[b][0]], ys = [cell[a][1], cell[b][1]];
    const x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3, y0 = Math.min(...ys) - 3, y1 = Math.max(...ys) + 3;
    log(pair, cell[a], cell[b]);
    for (let y = y0; y <= y1; y++) { let row = ''; for (let x = x0; x <= x1; x++) { const c = cells.get(K(x, y)); row += c ? (c.t === 'S' ? (c.st === a ? 'A' : c.st === b ? 'B' : '@') : c.t === 't' ? '-' : 'o') : isLand(x, y) ? '.' : '~'; } log(row); }
  });
}
if (JSONOUT) { report(); process.stdout.write(JSON.stringify(rows)); process.exit(0); }
fs.writeFileSync(path.join(__dirname, '..', 'js', 'mapdata.js'), out);
log('マス', list.length, JSON.stringify(cnt));
report();
