/* あいち電鉄 — 駅の配置（実際の位置を目安に、駅どうしが重ならないよう自動で広げる）
 * 名古屋のように駅がぎゅうぎゅうの所は外へ押し広げ、県の輪郭も同じ動きでゆがませる。
 * 結果は毎回同じ（乱数を使わない）。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const K = A.K;
  const S = A.STATIONS;

  const MIN_GAP = 52;      // 駅どうしの最小距離（デザイン空間）。K倍した値が画面上の距離
  const ITER = 1800;

  // ---- 1. 実際の位置から出発する。まず名古屋を中心に「魚眼レンズ」のように外へ広げて（並び順は変わらない）、
  //         そのあと近すぎる駅だけを軽く押しはなす ----
  const p0 = S.map((s) => A.proj(s.lon, s.lat));
  const C = A.proj(136.935, 35.150);
  const fish = (p, pinned) => {
    if (pinned) return p.slice();
    const dx = p[0] - C[0], dy = p[1] - C[1], r = Math.hypot(dx, dy) || 1;
    const k = 1 + 4.5 * Math.exp(-r / 110);
    return [C[0] + dx * k, C[1] + dy * k];
  };
  const base1 = p0.map((p, i) => fish(p, S[i].pin));
  const pos = base1.map((p, i) => [p[0] + ((i * 7) % 5 - 2) * 0.3, p[1] + ((i * 11) % 5 - 2) * 0.3]); // 同じ位置の駅をずらす微小な揺らぎ
  for (let it = 0; it < ITER; it++) {
    const tether = 0.01 + 0.03 * (1 - it / ITER);
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        let dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1];
        let d = Math.hypot(dx, dy);
        if (d >= MIN_GAP) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const push = (MIN_GAP - d) / 2 / d;
        const wi = S[i].pin ? 0 : 1, wj = S[j].pin ? 0 : 1;
        const tot = wi + wj || 1;
        pos[i][0] -= dx * push * 2 * wi / tot; pos[i][1] -= dy * push * 2 * wi / tot;
        pos[j][0] += dx * push * 2 * wj / tot; pos[j][1] += dy * push * 2 * wj / tot;
      }
    }
    for (let i = 0; i < S.length; i++) {
      if (S[i].pin) { pos[i][0] = base1[i][0]; pos[i][1] = base1[i][1]; continue; }
      pos[i][0] += (base1[i][0] - pos[i][0]) * tether;
      pos[i][1] += (base1[i][1] - pos[i][1]) * tether;
    }
  }

  // ---- 2. 駅の動きから「ゆがみの場」を作り、輪郭や地図のかざりにも同じ動きを与える ----
  const disp = pos.map((p, i) => [p[0] - p0[i][0], p[1] - p0[i][1]]);
  function warp(x, y) {
    let sx = 0, sy = 0, sw = 0;
    for (let i = 0; i < S.length; i++) {
      const dx = x - p0[i][0], dy = y - p0[i][1];
      const w = 1 / Math.pow(dx * dx + dy * dy + 900, 1.5);
      sx += w * disp[i][0]; sy += w * disp[i][1]; sw += w;
    }
    return [x + sx / sw, y + sy / sw];
  }
  const warpPt = (p) => warp(p[0], p[1]);

  // ---- 3. 結果を駅に書きこむ（x,y = 画面上の座標 / bx,by = K倍する前のデザイン空間） ----
  S.forEach((s, i) => {
    s.bx = Math.round(pos[i][0] * 10) / 10; s.by = Math.round(pos[i][1] * 10) / 10;
    s.x = Math.round(s.bx * K); s.y = Math.round(s.by * K);
    s.def = [s.x, s.y]; // 自動配置の位置（エディターの「元に戻す」用）
    const ov = A.OVERRIDES && A.OVERRIDES.pos && A.OVERRIDES.pos[s.id];
    if (ov && isFinite(ov[0]) && isFinite(ov[1])) { s.x = Math.round(ov[0]); s.y = Math.round(ov[1]); }
  });
  const OUTLINE_BASE = A.OUTLINE_REAL.map(warpPt);
  const OUTLINE = OUTLINE_BASE.map((p) => [Math.round(p[0] * K), Math.round(p[1] * K)]);

  Object.assign(A, { warp, warpPt, OUTLINE_BASE, OUTLINE, LAYOUT_P0: p0 });
})(typeof globalThis !== 'undefined' ? globalThis : this);
