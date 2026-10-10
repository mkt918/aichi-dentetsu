/* あいち電鉄 — 駅のまわりをあける（Node 専用。tools/genall.js が使う）
 * 駅のまわり8マス（ななめもふくむ）にある止まるマス（青・赤・カード・イベント）は「線路だけ」にして、
 * その止まるマスは、同じ一本道の上で駅から離れたマスへずらす（ずらす場所がなければなくす）。
 * 分かれ道・行き止まりのマスは止まるマスのままにするしかないので、そのまま残す。 */
'use strict';
const K = (x, y) => x + ',' + y;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STOP = new Set(['b', 'r', 'y', 'e']);

function space(rows) {
  const cells = new Map(rows.map((r) => [K(r[0], r[1]), r.slice()]));
  const stations = rows.filter((r) => r[2] === 'S');
  const nearSt = (x, y) => stations.some((s) => (s[0] !== x || s[1] !== y) && Math.abs(s[0] - x) <= 1 && Math.abs(s[1] - y) <= 1);
  const nbr = (c) => D4.map(([dx, dy]) => cells.get(K(c[0] + dx, c[1] + dy))).filter(Boolean);
  let moved = 0, dropped = 0;
  cells.forEach((c) => {
    if (!STOP.has(c[2]) || !nearSt(c[0], c[1]) || nbr(c).length !== 2) return;
    const type = c[2];
    c[2] = 't';
    // 一本道を両方向にたどり、駅から離れた「線路だけ」のマスのうち、いちばん近いものへずらす
    let best = null;
    nbr(c).forEach((n0) => {
      let prev = c, cur = n0, d = 1;
      while (cur && cur[2] === 't' && nbr(cur).length === 2) {
        if (!nearSt(cur[0], cur[1])) { if (!best || d < best.d) best = { c: cur, d }; break; }
        const nx = nbr(cur).find((m) => m !== prev); prev = cur; cur = nx; d++;
      }
    });
    if (best) { best.c[2] = type; moved++; } else dropped++;
  });
  return { rows: rows.map((r) => cells.get(K(r[0], r[1]))), moved, dropped };
}

module.exports = { space };
