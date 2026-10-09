/* あいち電鉄 — 盤面の組み立て
 * 愛知県を四角いグリッドで区切り、駅も道も1マスずつグリッドにそろえる。移動は上下左右だけ（斜めなし）。
 * 駅の位置は「いちばん近いマス」に合わせ、駅と駅は、実際の路線・高速道路・国道にそった経路でつなぐ。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const G = A.GRID;

  // 盤面生成専用のシード付き乱数（毎回同じ盤面になる）
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
  const landCache = new Map();
  const isLand = (cx, cy) => {
    const k = cx + ',' + cy;
    if (!landCache.has(k)) landCache.set(k, inPoly(cx * G, cy * G, A.OUTLINE));
    return landCache.get(k);
  };

  // ---------- 1. 駅を、いちばん近いマスに合わせる（駅どうしは2マス以上はなす） ----------
  const stCell = {}; // 駅ID -> [cx, cy]
  (function snapStations() {
    const placed = [];
    const far = (x, y) => placed.every(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) >= 3);
    const order = A.STATIONS.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
    order.forEach((s) => {
      const ox = s.x / G, oy = s.y / G;
      let best = null;
      for (let r = 0; r <= 24 && !best; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = Math.round(ox) + dx, y = Math.round(oy) + dy;
          if (!far(x, y) || (!s.island && !isLand(x, y))) continue;
          const d = Math.hypot(x - ox, y - oy);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      if (!best) best = { x: Math.round(ox), y: Math.round(oy), d: 0 };
      placed.push([best.x, best.y]);
      stCell[s.id] = [best.x, best.y];
    });
    A.STATIONS.forEach((s) => { s.cx = stCell[s.id][0]; s.cy = stCell[s.id][1]; s.x = s.cx * G; s.y = s.cy * G; });
  })();

  // ---------- 2. 区間ごとに、グリッド上の経路を探す（上下左右だけ。A*） ----------
  const stAt = new Map(); // "cx,cy" -> 駅ID
  A.STATIONS.forEach((s) => stAt.set(s.cx + ',' + s.cy, s.id));
  const use = new Map();  // "cx,cy" -> すでに通った経路の数
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function route(a, b, allowWater, reuse) {
    const bx0 = Math.min.apply(null, A.OUTLINE.map((p) => p[0])) / G - 10, by0 = Math.min.apply(null, A.OUTLINE.map((p) => p[1])) / G - 10;
    const W = Math.ceil((Math.max.apply(null, A.OUTLINE.map((p) => p[0])) - Math.min.apply(null, A.OUTLINE.map((p) => p[0]))) / G) + 22;
    const Hh = Math.ceil((Math.max.apply(null, A.OUTLINE.map((p) => p[1])) - Math.min.apply(null, A.OUTLINE.map((p) => p[1]))) / G) + 22;
    const ox = Math.floor(bx0), oy = Math.floor(by0);
    const idx = (x, y, d) => (((y - oy) * W + (x - ox)) * 5 + d);
    const goalKey = b[0] + ',' + b[1];
    const open = [[0, a[0], a[1], 4, 0]]; // [f, x, y, dir, g]
    const best = new Map([[idx(a[0], a[1], 4), 0]]);
    const from = new Map();
    const push = (it) => { open.push(it); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    while (open.length) {
      const [, x, y, dir, g] = pop();
      if (g > (best.get(idx(x, y, dir)) ?? Infinity) + 1e-9) continue;
      if (x + ',' + y === goalKey) {
        const path = [[x, y]];
        let k = idx(x, y, dir);
        while (from.has(k)) { const f = from.get(k); path.push([f.x, f.y]); k = f.k; }
        return path.reverse();
      }
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        const key = nx + ',' + ny;
        const st = stAt.get(key);
        if (st && key !== goalKey) continue;                 // ほかの駅の上は通らない
        let c = 1;
        const u = use.get(key);
        if (u) c = reuse;                                     // すでにある道は、少し安く使える（道がかさなる）
        if (!isLand(nx, ny)) c += allowWater ? 0 : 40;       // 海の上は、橋・海路の区間だけ
        if (dir !== 4 && dir !== d) c += 0.25;                // 曲がるのは少しだけ高くつく（まっすぐな道になる）
        for (const [ax, ay] of DIRS) { const sn = stAt.get((nx + ax) + ',' + (ny + ay)); if (sn && key !== goalKey && (nx + ax) + ',' + (ny + ay) !== a[0] + ',' + a[1]) c += 0.6; } // 他の駅のすぐ横は避ける
        const ng = g + c, ni = idx(nx, ny, d);
        if (ng < (best.get(ni) ?? Infinity) - 1e-9) {
          best.set(ni, ng);
          from.set(ni, { x, y, k: idx(x, y, dir) });
          push([ng + 0.5 * (Math.abs(nx - b[0]) + Math.abs(ny - b[1])), nx, ny, d, ng]);
        }
      }
    }
    throw new Error('経路が見つからない: ' + a + ' → ' + b);
  }

  // ---------- 3. 経路を重ねて、マスと道のグラフを作る ----------
  const KIND_RANK = ['sea', 'bridge', 'rail', 'expressway', 'national', 'pref'];

  function build() {
    const rnd = mulberry32(20260);
    const nodes = [], byId = {}, edges = [], linkMap = new Map();
    const cellNode = new Map();
    A.STATIONS.forEach((s) => {
      const n = { id: s.id, type: 'station', x: s.x, y: s.y, cx: s.cx, cy: s.cy, adj: [], station: s.id };
      nodes.push(n); byId[n.id] = n; cellNode.set(s.cx + ',' + s.cy, n);
    });
    let qn = 0;
    const sCell = (id) => { const s = A.STATIONS.find((x) => x.id === id); return [s.cx, s.cy]; };
    A.EDGES.forEach((e, ei) => {
      const [aId, bId, opt = {}] = e;
      if (!byId[aId] || !byId[bId]) throw new Error('未定義の駅: ' + aId + ' / ' + bId);
      const kinds = opt.kinds && opt.kinds.length ? opt.kinds : ['rail'];
      const isRoadOnly = !kinds.includes('rail') && !kinds.includes('sea') && !kinds.includes('bridge');
      const cells = route(sCell(aId), sCell(bId), !!(opt.sea || opt.bridge), isRoadOnly ? 1 : 0.9);
      const chain = [];
      let prev = null;
      cells.forEach(([cx, cy]) => {
        const key = cx + ',' + cy;
        let n = cellNode.get(key);
        if (!n) {
          n = { id: 'q' + qn++, type: 'mid', x: cx * G, y: cy * G, cx, cy, adj: [], edge: ei };
          nodes.push(n); byId[n.id] = n; cellNode.set(key, n);
        }
        use.set(key, (use.get(key) || 0) + 1);
        chain.push(n.id);
        if (prev && prev !== n) {
          if (!prev.adj.includes(n.id)) { prev.adj.push(n.id); n.adj.push(prev.id); }
          const lk = prev.id < n.id ? prev.id + '|' + n.id : n.id + '|' + prev.id;
          const cur = linkMap.get(lk) || { a: prev.id, b: n.id, kinds: new Set() };
          kinds.forEach((k) => cur.kinds.add(k));
          linkMap.set(lk, cur);
        }
        prev = n;
      });
      edges.push({ index: ei, a: aId, b: bId, sea: !!opt.sea, bridge: !!opt.bridge, kinds, chain });
    });
    const links = Array.from(linkMap.values()).map((l) => ({ a: l.a, b: l.b, kind: KIND_RANK.find((k) => l.kinds.has(k)) || 'rail', kinds: Array.from(l.kinds) }));
    thinOut(nodes, byId, edges, links);
    links.forEach((l) => { const a = byId[l.a], b = byId[l.b]; l.pts = [[a.x, a.y]].concat((l.via || []).map((v) => [v.x, v.y]), [[b.x, b.y]]); });
    const live = nodes.filter((n) => !n.gone);
    assignTypes(live, rnd);
    const fixed = (A.OVERRIDES && A.OVERRIDES.squares) || {};
    live.forEach((n) => { const t = fixed[n.cx + ',' + n.cy]; if (n.type !== 'station' && (t === 'blue' || t === 'red' || t === 'yellow' || t === 'event')) n.type = t; });
    return { nodes: live, byId, edges, links };
  }

  /** 途中マスを半分にする。一本道（つながりが2つだけ）のマスを1つおきに取りのぞき、両どなりを直接つなぐ。
   *  線路や道の見た目は変えない（取りのぞいたマスの位置を通る折れ線で描く）。 */
  function thinOut(nodes, byId, edges, links) {
    const linkOf = new Map(); links.forEach((l) => linkOf.set(l.a < l.b ? l.a + '|' + l.b : l.b + '|' + l.a, l));
    const keyOf = (x, y) => (x < y ? x + '|' + y : y + '|' + x);
    edges.forEach((e) => {
      e.cells = e.chain.length;
      let prevKept = true;
      for (let i = 1; i < e.chain.length - 1; i++) {
        const n = byId[e.chain[i]];
        if (n.gone || n.type !== 'mid' || n.adj.length !== 2) { prevKept = true; continue; }
        if (!prevKept) { prevKept = true; continue; }
        const [p, q] = n.adj;
        if (p === q || byId[p].adj.includes(q)) { prevKept = true; continue; }
        const l1 = linkOf.get(keyOf(p, n.id)), l2 = linkOf.get(keyOf(n.id, q));
        if (!l1 || !l2) { prevKept = true; continue; }
        // p - n - q  を  p - q  にする（途中の点 n を via に覚える）
        const via1 = l1.a === p ? (l1.via || []) : (l1.via || []).slice().reverse();
        const via2 = l2.a === n.id ? (l2.via || []) : (l2.via || []).slice().reverse();
        const nl = { a: p, b: q, kind: l1.kind, kinds: Array.from(new Set(l1.kinds.concat(l2.kinds))), via: via1.concat([{ x: n.x, y: n.y }], via2) };
        links.splice(links.indexOf(l1), 1); links.splice(links.indexOf(l2), 1); links.push(nl);
        linkOf.delete(keyOf(p, n.id)); linkOf.delete(keyOf(n.id, q)); linkOf.set(keyOf(p, q), nl);
        const P = byId[p], Q = byId[q];
        P.adj = P.adj.map((x) => (x === n.id ? q : x)); Q.adj = Q.adj.map((x) => (x === n.id ? p : x));
        n.gone = true; n.adj = [];
        prevKept = false;
      }
      e.chain = e.chain.filter((id) => !byId[id].gone);
    });
    nodes.forEach((n) => { if (n.gone) delete byId[n.id]; });
  }

  /** 途中マスの種類を、決めた割合で配る（黄・紫・赤、のこりは青） */
  function assignTypes(nodes, rnd) {
    const mids = nodes.filter((n) => n.type === 'mid');
    const M = A.SQUARE_MIX, N = mids.length;
    const bag = [];
    const yellow = Math.round(N * M.yellow), event = Math.round(N * M.event), red = Math.round(N * M.red);
    for (let i = 0; i < yellow; i++) bag.push('yellow');
    for (let i = 0; i < event; i++) bag.push('event');
    for (let i = 0; i < red; i++) bag.push('red');
    while (bag.length < N) bag.push('blue');
    bag.length = N;
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    // 黄・紫・赤が2つ続かないように、後ろの青と入れ替える（道の順に見て）
    const order = mids.slice();
    for (let i = 1; i < order.length; i++) {
      const cur = order[i], p = order[i - 1];
      if (!cur.adj.includes(p.id)) continue;
    }
    mids.forEach((n, i) => { n.type = bag[i]; });
    mids.forEach((n) => {
      if (n.type === 'blue') return;
      const same = n.adj.map((id) => nodes.find((m) => m.id === id)).filter((m) => m && m.type === n.type);
      if (!same.length) return;
      const swap = mids.find((m) => m.type === 'blue' && !m.adj.some((id) => { const q = nodes.find((z) => z.id === id); return q && q.type === n.type; }));
      if (swap) { swap.type = n.type; n.type = 'blue'; }
    });
  }

  const B = build();
  const distCache = {};

  /** 起点から全ノードへの最短マス数（BFS）。結果はキャッシュする。 */
  function distFrom(id) {
    if (distCache[id]) return distCache[id];
    const d = { [id]: 0 };
    const q = [id];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      for (const nb of B.byId[cur].adj) {
        if (d[nb] === undefined) { d[nb] = d[cur] + 1; q.push(nb); }
      }
    }
    distCache[id] = d;
    return d;
  }

  /** 次の一歩の候補（直前のマスへは戻れない。行き止まりのときだけ戻れる） */
  function stepOptions(pos, prev) {
    const adj = B.byId[pos].adj;
    const opts = adj.filter((id) => id !== prev);
    return opts.length ? opts : adj.slice();
  }

  /** cur から nb へ進んだとき、次の「駅か分かれ道」に行き着くまで（と、そのマス数） */
  function heading(cur, nb) {
    let prev = cur, node = B.byId[nb], steps = 1;
    while (node.type !== 'station' && node.adj.length <= 2 && steps < 60) {
      const next = node.adj.find((id) => id !== prev) || prev;
      prev = node.id; node = B.byId[next]; steps++;
    }
    return { station: node.type === 'station' ? node.id : nearestStation(node.id), steps };
  }
  function nearestStation(id) {
    const d = distFrom(id);
    let best = null;
    A.STATIONS.forEach((s) => { if (!best || d[s.id] < d[best]) best = s.id; });
    return best;
  }

  /** remaining マス歩いたとき止まれる場所の集合（pos,prev から）。目的地に着いたらそこで止まる */
  function reachable(pos, prev, remaining, destId) {
    const out = new Map(); // nodeId -> 最初の一歩の集合
    const seen = new Set();
    function dfs(node, pr, rem, first) {
      const key = node + '|' + pr + '|' + rem + '|' + first;
      if (seen.has(key)) return;
      seen.add(key);
      if (rem === 0) { addOut(node, first); return; }
      for (const nb of stepOptions(node, pr)) {
        const f = first === null ? nb : first;
        if (nb === destId) { addOut(nb, f); continue; }   // 目的地は通過できない（止まる）
        dfs(nb, node, rem - 1, f);
      }
    }
    function addOut(node, first) {
      if (!out.has(node)) out.set(node, new Set());
      out.get(node).add(first);
    }
    dfs(pos, prev, remaining, null);
    return out;
  }

  /** pos から remaining マス歩いて target に止まる経路（途中のマスの並び）。なければ null。目的地は通過できず、そこで止まる */
  function pathTo(pos, prev, remaining, destId, target) {
    const dead = new Set();
    function dfs(node, pr, rem) {
      const key = node + '|' + pr + '|' + rem;
      if (dead.has(key)) return null;
      for (const nb of stepOptions(node, pr)) {
        if (nb === destId) { if (nb === target) return [nb]; continue; }
        if (rem === 1) { if (nb === target) return [nb]; continue; }
        const rest = dfs(nb, node, rem - 1);
        if (rest) return [nb].concat(rest);
      }
      dead.add(key);
      return null;
    }
    return remaining > 0 ? dfs(pos, prev, remaining) : null;
  }

  // ---------- 駅名ラベルの置き場所（マス・道・海岸とぶつからない向きをえらぶ） ----------
  function computeLabels() {
    const U = A.STATION_SCALE;
    const pts = []; // 道の上の点（マスの中心と、マスとマスの真ん中）
    B.links.forEach((l) => { for (let i = 0; i + 1 < l.pts.length; i++) pts.push([(l.pts[i][0] + l.pts[i + 1][0]) / 2, (l.pts[i][1] + l.pts[i + 1][1]) / 2]); });
    const labels = {};
    const rectOf = (id) => (labels[id] ? labels[id].rect : null);
    const choose = (s) => {
      const w = s.name.length * 15 + 6, n = s.props.length;
      const cand = [];
      // 駅のまわり 16 方向（真下がいちばん優先）にラベルの箱を置いてみる。箱は駅の絵と同じ倍率 U で大きくする
      [90, 270, 0, 180, 45, 135, 315, 225, 67.5, 112.5, 22.5, 157.5, 337.5, 202.5, 292.5, 247.5].forEach((deg, order) => {
        const cs = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
        const anchor = cs > 0.4 ? 'start' : cs < -0.4 ? 'end' : 'middle';
        const ltx = anchor === 'middle' ? 0 : Math.sign(cs) * (24 + 8 * Math.abs(cs));
        const lty = sn > 0.35 ? 18 + 24 * sn : sn < -0.35 ? -18 + 28 * sn : 1;
        const bw = Math.max(w, n * 12.5 + 4);
        const lx0 = anchor === 'middle' ? ltx - bw / 2 : anchor === 'start' ? ltx - 2 : ltx - bw;
        cand.push({ dir: deg, ltx, lty, lpx: ltx, lpy: lty + 11, anchor, pref: order * 0.6,
          rect: [s.x + lx0 * U, s.y + (lty - 13) * U, s.x + (lx0 + bw + 2) * U, s.y + (lty + 15) * U] });
      });
      let best = null;
      cand.forEach((c) => {
        const [x0, y0, x1, y1] = c.rect; let score = c.pref;
        B.nodes.forEach((nd) => {
          if (nd.id === s.id) return;
          const r = G * (nd.type === 'station' ? 0.7 : 0.5);
          if (nd.x + r > x0 && nd.x - r < x1 && nd.y + r > y0 && nd.y - r < y1) score += nd.type === 'station' ? 60 : 12;
        });
        pts.forEach(([px, py]) => { if (px > x0 && px < x1 && py > y0 && py < y1) score += 2; });
        [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([px, py]) => { if (!inPoly(px, py, A.OUTLINE) && !s.island) score += 6; });
        A.STATIONS.forEach((o) => {
          if (o.id === s.id) return;
          const r = rectOf(o.id);
          if (r && r[0] < x1 && r[2] > x0 && r[1] < y1 && r[3] > y0) score += 50;
        });
        if (!best || score < best.score) best = Object.assign({ score }, c);
      });
      labels[s.id] = best;
    };
    const crowd = (s) => B.nodes.filter((n) => Math.hypot(n.x - s.x, n.y - s.y) < 2.5 * G).length;
    A.STATIONS.slice().sort((a, b) => crowd(b) - crowd(a)).forEach(choose);
    for (let pass = 0; pass < 6; pass++) {
      A.STATIONS.slice().sort((a, b) => labels[b.id].score - labels[a.id].score).forEach(choose);
    }
    return labels;
  }
  B.labels = computeLabels();

  Object.assign(A, { Board: Object.assign(B, { G, distFrom, stepOptions, heading, reachable, pathTo, mulberry32, isLand }) });
})(typeof globalThis !== 'undefined' ? globalThis : this);
