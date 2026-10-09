/* あいち電鉄 — 盤面（駅＋途中マスのグラフ）の組み立て */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});

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

  const SQUARE_WEIGHTS = [['blue', 46], ['red', 24], ['yellow', 20], ['event', 10]];
  const SPACING = 60; // 途中マスの間隔の目安

  function pickType(rnd, prev2, prev1) {
    for (let tries = 0; tries < 12; tries++) {
      let r = rnd() * 100;
      let t = 'blue';
      for (const [name, w] of SQUARE_WEIGHTS) { if (r < w) { t = name; break; } r -= w; }
      if (t === prev1 && t !== 'blue') continue;      // 赤・黄・紫の連続は避ける
      if (t === 'blue' && prev1 === 'blue' && prev2 === 'blue') continue; // 青3連続も避ける
      return t;
    }
    return 'blue';
  }

  function bezierPoints(a, b, bend, count) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * len * bend;
    const cy = my + (dx / len) * len * bend;
    const pts = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count, u = 1 - t;
      pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
    }
    return { pts, c: { x: cx, y: cy } };
  }

  function build() {
    const rnd = mulberry32(20260);
    const nodes = [];
    const byId = {};
    const edges = [];

    A.STATIONS.forEach((s) => {
      const n = { id: s.id, type: 'station', x: s.x, y: s.y, adj: [], station: s.id };
      nodes.push(n); byId[n.id] = n;
    });

    let qn = 0;
    A.EDGES.forEach((e, ei) => {
      const [aId, bId, opt = {}] = e;
      const a = byId[aId], b = byId[bId];
      if (!a || !b) throw new Error('未定義の駅: ' + aId + ' / ' + bId);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const bend = opt.bend || 0;
      const count = typeof opt.n === 'number' ? opt.n : Math.max(0, Math.min(3, Math.round(len / SPACING) - 1));

      // 曲線を細かく刻んで、弧長で等分した位置に途中マスを置く
      const { pts, c } = bezierPoints(a, b, bend, 48);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const total = cum[cum.length - 1];
      const chain = [a];
      let p2 = null, p1 = null;
      for (let k = 1; k <= count; k++) {
        const target = (total * k) / (count + 1);
        let j = 1;
        while (j < cum.length - 1 && cum[j] < target) j++;
        const f = (target - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
        const x = pts[j - 1].x + (pts[j].x - pts[j - 1].x) * f;
        const y = pts[j - 1].y + (pts[j].y - pts[j - 1].y) * f;
        const type = pickType(rnd, p2, p1);
        const n = { id: 'q' + qn++, type, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, adj: [], edge: ei };
        nodes.push(n); byId[n.id] = n; chain.push(n);
        p2 = p1; p1 = type;
      }
      chain.push(b);
      for (let i = 0; i < chain.length - 1; i++) {
        chain[i].adj.push(chain[i + 1].id);
        chain[i + 1].adj.push(chain[i].id);
      }
      edges.push({
        index: ei, a: aId, b: bId, sea: !!opt.sea, bridge: !!opt.bridge,
        d: 'M' + a.x + ' ' + a.y + ' Q' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ' ' + b.x + ' ' + b.y,
        chain: chain.map((n) => n.id),
      });
    });

    return { nodes, byId, edges };
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

  /** cur から nb へ進んだとき、次に行き着く駅（と、そこまでのマス数） */
  function heading(cur, nb) {
    let prev = cur, node = B.byId[nb], steps = 1;
    while (node.type !== 'station' && steps < 20) {
      const next = node.adj.find((id) => id !== prev) || prev;
      prev = node.id; node = B.byId[next]; steps++;
    }
    return { station: node.id, steps };
  }

  /** remaining マス歩いたとき止まれる場所の集合（pos,prev から）。目的地に着いたらそこで止まる */
  function reachable(pos, prev, remaining, destId) {
    const out = new Map(); // nodeId -> 最初の一歩の集合
    const seen = new Set(); // (node, prev, rem, first) の重複展開を避ける
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

  // ---------- 駅名ラベルの置き場所（路線・マス・海岸とぶつからない向きをえらぶ） ----------
  function computeLabels() {
    const pts = []; // 路線上の点（5px おき）
    B.edges.forEach((e) => {
      for (let i = 0; i < e.chain.length - 1; i++) {
        const a = B.byId[e.chain[i]], b = B.byId[e.chain[i + 1]];
        const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 5));
        for (let k = 0; k <= n; k++) pts.push([a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n]);
      }
    });
    const inside = (x, y) => {
      const poly = A.OUTLINE; let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const labels = {};
    const rectOf = (id) => (labels[id] ? labels[id].rect : null);
    const choose = (s) => {
      const w = s.name.length * 15 + 6, n = s.props.length;
      // 駅のまわり 16 方向（真下がいちばん優先）にラベルの箱を置いてみる
      const cand = [];
      [90, 270, 0, 180, 45, 135, 315, 225, 67.5, 112.5, 22.5, 157.5, 337.5, 202.5, 292.5, 247.5].forEach((deg, order) => {
        const cs = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
        const anchor = cs > 0.4 ? 'start' : cs < -0.4 ? 'end' : 'middle';
        const tx = anchor === 'middle' ? s.x : s.x + Math.sign(cs) * (18 + 8 * Math.abs(cs));
        const ty = sn > 0.35 ? s.y + 12 + 24 * sn : sn < -0.35 ? s.y - 12 + 28 * sn : s.y + 1;
        const bw = Math.max(w, n * 12.5 + 4);
        const x0 = anchor === 'middle' ? tx - bw / 2 : anchor === 'start' ? tx - 2 : tx - bw;
        cand.push({ dir: deg, tx, ty, anchor, px: tx, py: ty + 11, rect: [x0, ty - 13, x0 + bw + 2, ty + 15], pref: order * 0.6 });
      });
      let best = null;
      cand.forEach((c) => {
        const [x0, y0, x1, y1] = c.rect; let score = c.pref;
        B.nodes.forEach((nd) => {
          if (nd.id === s.id) return;
          const r = nd.type === 'station' ? 24 : 13;
          if (nd.x + r > x0 && nd.x - r < x1 && nd.y + r > y0 && nd.y - r < y1) score += nd.type === 'station' ? 60 : 40;
        });
        pts.forEach(([px, py]) => { if (px > x0 - 3 && px < x1 + 3 && py > y0 - 3 && py < y1 + 3) score += 0.8; });
        [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, y1]].forEach(([px, py]) => { if (!inside(px, py) && s.id !== 'centrair') score += 6; });
        A.STATIONS.forEach((o) => {
          if (o.id === s.id) return;
          const r = rectOf(o.id);
          if (r && r[0] < x1 && r[2] > x0 && r[1] < y1 && r[3] > y0) score += 50;
        });
        if (!best || score < best.score) best = Object.assign({ score }, c);
      });
      labels[s.id] = best;
    };
    // まず混んでいる駅から順に置き、そのあと何度か「いちばん困っている駅」から置き直す
    const crowd = (s) => B.nodes.filter((n) => Math.hypot(n.x - s.x, n.y - s.y) < 70).length;
    A.STATIONS.slice().sort((a, b) => crowd(b) - crowd(a)).forEach(choose);
    for (let pass = 0; pass < 6; pass++) {
      A.STATIONS.slice().sort((a, b) => labels[b.id].score - labels[a.id].score).forEach(choose);
    }
    return labels;
  }
  B.labels = computeLabels();

  Object.assign(A, { Board: Object.assign(B, { distFrom, stepOptions, heading, reachable, mulberry32 }) });
})(typeof globalThis !== 'undefined' ? globalThis : this);
