/* あいち電鉄 — 盤面の組み立て
 * 盤面は「グリッドのマスの一覧」（js/mapdata.js。エディターで保存した盤面があれば、そちらを優先）から作る。
 * 上下左右にとなりあうマスどうしが道でつながる。「線路だけ」のマスは止まらずに通りぬける（駒は次の止まるマスまで進む）。
 * 陸の外にある道は海路として描く。 */
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

  const TYPE = { b: 'blue', r: 'red', y: 'yellow', e: 'event' };
  // 遊ぶ盤面（タイトルでえらんだもの）は data.js が決める（マップごとに縮尺がちがうため、駅の位置より先に決める）
  const allMaps = A.allMaps;
  const MAP = A.CURRENT_MAP;
  const mapCells = () => MAP.cells;

  function build() {
    const cells = new Map();
    const ids = new Set(A.STATIONS.map((s) => s.id));
    const placed = {};
    mapCells().forEach(([x, y, t, st]) => {
      const k = x + ',' + y;
      if (t === 'S' && ids.has(st) && !placed[st]) { placed[st] = [x, y]; cells.set(k, { x, y, t: 'S', st }); }
      else if (t === 'S') cells.set(k, { x, y, t: 'b' }); // 知らない駅・同じ駅の2つ目は、ふつうのマスにする
      else cells.set(k, { x, y, t: TYPE[t] || t === 't' ? t : 'b' });
    });
    // 盤面に置かれていない駅は、ゲームから外す
    A.ALL_STATIONS = A.ALL_STATIONS || A.STATIONS.slice(); // エディター用に、外す前の全駅を残す
    for (let i = A.STATIONS.length - 1; i >= 0; i--) if (!placed[A.STATIONS[i].id]) A.STATIONS.splice(i, 1);
    A.START_STATION = placed[MAP.start] ? MAP.start : placed.nagoya ? 'nagoya' : A.STATIONS[0].id;
    A.STATIONS.forEach((s) => { s.cx = placed[s.id][0]; s.cy = placed[s.id][1]; s.x = s.cx * G; s.y = s.cy * G; });

    const at = (x, y) => cells.get(x + ',' + y);
    const D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const nbr = (c) => D4.map(([dx, dy]) => at(c.x + dx, c.y + dy)).filter(Boolean);
    // 分かれ道や行き止まりの「線路だけ」マスは、止まるマス（青）にする
    cells.forEach((c) => { if (c.t === 't' && nbr(c).length !== 2) c.t = 'b'; });

    const nodes = [], byId = {};
    const idOf = (c) => (c.t === 'S' ? c.st : 'q' + c.x + '_' + c.y);
    cells.forEach((c) => {
      if (c.t === 't') return;
      const n = { id: idOf(c), type: c.t === 'S' ? 'station' : TYPE[c.t], x: c.x * G, y: c.y * G, cx: c.x, cy: c.y, adj: [] };
      if (c.t === 'S') n.station = c.st;
      nodes.push(n); byId[n.id] = n;
    });
    // 道: となりの止まるマスまで（線路だけのマスは通りぬける）
    const linkMap = new Map();
    nodes.forEach((n) => {
      const c0 = at(n.cx, n.cy);
      nbr(c0).forEach((c1) => {
        const pts = [[n.x, n.y]];
        let prev = c0, cur = c1, guard = 0;
        while (cur && cur.t === 't' && guard++ < 500) { pts.push([cur.x * G, cur.y * G]); const nx = nbr(cur).find((m) => m !== prev); prev = cur; cur = nx; }
        if (!cur || cur === c0) return;
        const m = byId[idOf(cur)];
        pts.push([m.x, m.y]);
        const key = n.id < m.id ? n.id + '|' + m.id : m.id + '|' + n.id;
        if (linkMap.has(key)) return;
        const sea = pts.some(([px, py], i) => i > 0 && !inPoly((px + pts[i - 1][0]) / 2, (py + pts[i - 1][1]) / 2, A.OUTLINE));
        const l = { a: n.id, b: m.id, kind: sea ? 'sea' : 'rail', kinds: [sea ? 'sea' : 'rail'], pts: n.id < m.id ? pts : pts.slice().reverse() };
        if (!(n.id < m.id)) { l.a = m.id; l.b = n.id; }
        linkMap.set(key, l);
        if (!n.adj.includes(m.id)) n.adj.push(m.id);
        if (!m.adj.includes(n.id)) m.adj.push(n.id);
      });
    });
    const links = Array.from(linkMap.values());
    // どこにもつながっていないマスは外す
    const live = nodes.filter((n) => n.adj.length || n.type === 'station');
    nodes.forEach((n) => { if (!live.includes(n)) delete byId[n.id]; });
    return { nodes: live, byId, links, cells };
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

  Object.assign(A, { allMaps, Board: Object.assign(B, { G, distFrom, stepOptions, heading, reachable, pathTo, mulberry32, isLand }) });
})(typeof globalThis !== 'undefined' ? globalThis : this);
