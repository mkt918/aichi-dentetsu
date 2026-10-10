/* あいち電鉄 — 駅の配置と県の輪郭
 * 駅も県の輪郭も、実際の経度・緯度を data.js の proj で、ゆがめずに同じ倍率で地図に置く。
 * 盤面のマス（js/mapdata.js）は、この位置をもとに tools/genmap.js が作る。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const K = A.K;

  // 結果を駅に書きこむ（x,y = 画面上の座標 / bx,by = K倍する前のデザイン空間）
  A.STATIONS.forEach((s) => {
    [s.bx, s.by] = A.proj(s.lon, s.lat).map((v) => Math.round(v * 10) / 10);
    s.x = Math.round(s.bx * K); s.y = Math.round(s.by * K);
    s.def = [s.x, s.y]; // 実際の位置（エディターの「元に戻す」用）
    const ov = A.OVERRIDES && A.OVERRIDES.pos && A.OVERRIDES.pos[s.id];
    if (ov && isFinite(ov[0]) && isFinite(ov[1])) { s.x = Math.round(ov[0]); s.y = Math.round(ov[1]); }
  });
  const OUTLINE_BASE = A.OUTLINE_LONLAT.map((p) => A.proj(p[0], p[1]));
  const OUTLINE = OUTLINE_BASE.map((p) => [Math.round(p[0] * K), Math.round(p[1] * K)]);
  Object.assign(A, { OUTLINE_BASE, OUTLINE });
})(typeof globalThis !== 'undefined' ? globalThis : this);
