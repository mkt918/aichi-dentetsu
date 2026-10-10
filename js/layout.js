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
  const hasMap = !!A.MAPPOS;
  const fish = (p, pinned) => {
    if (pinned) return p.slice();
    const dx = p[0] - C[0], dy = p[1] - C[1], r = Math.hypot(dx, dy) || 1;
    const k = 1 + (hasMap ? 1.6 : 4.5) * Math.exp(-r / 110);
    return [C[0] + dx * k, C[1] + dy * k];
  };
  // 路線図（A.MAPPOS）に載っている駅は、その位置を使う。実際の位置（p0）との対応を最小二乗の線形変換で求め、
  // 載っていない駅は近くの駅のずれを引き継ぐ（路線図は名古屋が広く描かれているので、魚眼は使わない）
  const MP = A.MAPPOS || {};
  const have = S.map((s, i) => (MP[s.id] ? i : -1)).filter((i) => i >= 0);
  let base1;
  if (have.length >= 10) {
    const n = have.length;
    const mean = (f) => have.reduce((a, i) => a + f(i), 0) / n;
    const mx = mean((i) => MP[S[i].id][0]), my = mean((i) => MP[S[i].id][1]);
    const px = mean((i) => p0[i][0]), py = mean((i) => p0[i][1]);
    let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0, sxv = 0, syv = 0;
    have.forEach((i) => {
      const x = MP[S[i].id][0] - mx, y = MP[S[i].id][1] - my, u = p0[i][0] - px, v = p0[i][1] - py;
      sxx += x * x; sxy += x * y; syy += y * y; sxu += x * u; syu += y * u; sxv += x * v; syv += y * v;
    });
    const det = sxx * syy - sxy * sxy;
    const a = (sxu * syy - syu * sxy) / det, b = (syu * sxx - sxu * sxy) / det;
    const c = (sxv * syy - syv * sxy) / det, d = (syv * sxx - sxv * sxy) / det;
    const toDesign = (m) => [px + a * (m[0] - mx) + b * (m[1] - my), py + c * (m[0] - mx) + d * (m[1] - my)];
    const tgt = S.map((s, i) => (MP[s.id] ? fish(toDesign(MP[s.id]), false) : null));
    base1 = p0.map((p, i) => {
      if (tgt[i]) return tgt[i];
      let sx = 0, sy = 0, sw = 0;
      const near = have.map((j) => [j, Math.hypot(p[0] - p0[j][0], p[1] - p0[j][1])]).sort((u, v) => u[1] - v[1]).slice(0, 3);
      near.forEach(([j, dd]) => {
        const w = 1 / (dd * dd + 100);
        sx += w * (tgt[j][0] - p0[j][0]); sy += w * (tgt[j][1] - p0[j][1]); sw += w;
      });
      return [p[0] + sx / sw, p[1] + sy / sw];
    });
    // 路線図どおりに寄せる度合い（0=実際の位置の魚眼配置 / 1=路線図どおり）。大きいほど忠実だが、県の輪郭や島の位置とずれる
    const BLEND = A.MAP_BLEND != null ? A.MAP_BLEND : 0.55;
    base1 = base1.map((m, i) => { const f = fish(p0[i], S[i].pin); if (S[i].pin) return f; return [f[0] + (m[0] - f[0]) * BLEND, f[1] + (m[1] - f[1]) * BLEND]; });
  } else base1 = p0.map((p, i) => fish(p, S[i].pin));
  // 名古屋市の外がわ（尾張・知多・三河・渥美）も広げる。名古屋から離れるほど、ゆるやかに外へ
  const WIDEN = A.MAP_WIDEN != null ? A.MAP_WIDEN : 0.4;
  base1 = base1.map((p) => {
    const dx = p[0] - C[0], dy = p[1] - C[1], r = Math.hypot(dx, dy);
    const u = Math.max(0, Math.min(1, (r - 70) / 150)), f = 1 + WIDEN * u * u * (3 - 2 * u);
    return [C[0] + dx * f, C[1] + dy * f];
  });
  // 知多半島・渥美半島・三河（名古屋から見て南と東）を、さらに大きく広げる
  const SE = A.MAP_SE != null ? A.MAP_SE : 0.45;
  base1 = base1.map((p) => {
    const dx = p[0] - C[0], dy = p[1] - C[1], r = Math.hypot(dx, dy) || 1;
    const dir = Math.max(0, Math.max(dx, dy) / r);               // 東か南を向いているほど 1
    const u = Math.max(0, Math.min(1, (r - 60) / 160)), f = 1 + SE * dir * u * u * (3 - 2 * u);
    return [C[0] + dx * f, C[1] + dy * f];
  });
  // 知多・渥美・三河と島は、実際の地形のとおりの形にする（ゆがみをとって、全体を同じ倍率で大きくするだけ）。
  // それまでの配置にいちばん合う「拡大＋平行移動」を最小二乗で求め、実際の位置（p0）に当てはめる
  {
    const SOUTH = new Set(['chita', 'atsumi', 'nishimikawa', 'higashimikawa']);
    const idx = S.map((s, i) => (SOUTH.has(s.region) ? i : -1)).filter((i) => i >= 0);
    const fitIdx = idx.filter((i) => !S[i].pin);
    const n = fitIdx.length;
    const mp = [0, 1].map((k) => fitIdx.reduce((a2, i) => a2 + p0[i][k], 0) / n), mb = [0, 1].map((k) => fitIdx.reduce((a2, i) => a2 + base1[i][k], 0) / n);
    let num = 0, den = 0;
    fitIdx.forEach((i) => { const u = [p0[i][0] - mp[0], p0[i][1] - mp[1]], v = [base1[i][0] - mb[0], base1[i][1] - mb[1]]; num += u[0] * v[0] + u[1] * v[1]; den += u[0] * u[0] + u[1] * u[1]; });
    const sc = (num / den) * (A.MAP_SOUTH != null ? A.MAP_SOUTH : 1.15);
    // 海に近い南（緯度34.95より南）ほど実際の形に寄せる。北の内陸は、それまでの配置のまま（名古屋側とつながりを保つ）
    idx.forEach((i) => {
      const u = Math.max(0, Math.min(1, (34.95 - S[i].lat) / 0.13)), w = u * u * (3 - 2 * u);
      const sim = [mb[0] + (p0[i][0] - mp[0]) * sc, mb[1] + (p0[i][1] - mp[1]) * sc];
      base1[i] = [base1[i][0] + (sim[0] - base1[i][0]) * w, base1[i][1] + (sim[1] - base1[i][1]) * w];
    });
    A.SOUTH_SCALE = sc;
  }
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

  // 仕上げ：引きもどしをやめて、近すぎる駅だけをしっかり押しはなす（グリッドで3マス空けるため）
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        let dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1];
        const d = Math.hypot(dx, dy);
        if (d >= MIN_GAP + 6) continue;
        if (d < 0.01) { dx = 1; dy = 0; }
        const push = (MIN_GAP + 6 - d) / 2 / (d || 1);
        const wi = S[i].pin ? 0 : 1, wj = S[j].pin ? 0 : 1, tot = wi + wj || 1;
        pos[i][0] -= dx * push * 2 * wi / tot; pos[i][1] -= dy * push * 2 * wi / tot;
        pos[j][0] += dx * push * 2 * wj / tot; pos[j][1] += dy * push * 2 * wj / tot;
        moved = true;
      }
    }
    if (!moved) break;
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

  // 島の駅が、ゆがんだ輪郭の陸の上に乗ってしまったら、沖（陸の重心と反対がわ）へ押し出す
  (function pushIslandsToSea() {
    const inPoly = (x, y) => { let c = false; for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) { const [xi, yi] = OUTLINE[i], [xj, yj] = OUTLINE[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    S.forEach((s) => {
      if (!s.island || !inPoly(s.x, s.y)) return;
      const land = S.filter((q) => !q.island && inPoly(q.x, q.y));
      let best = null;
      land.forEach((q) => { const d = Math.hypot(q.x - s.x, q.y - s.y); if (!best || d < best.d) best = { q, d }; });
      if (!best) return;
      const ux = (s.x - best.q.x) / (best.d || 1), uy = (s.y - best.q.y) / (best.d || 1);
      for (let k = 0; k < 80 && inPoly(s.x, s.y); k++) { s.x += ux * 8; s.y += uy * 8; }
      s.x = Math.round(s.x); s.y = Math.round(s.y);
      s.def = [s.x, s.y];
    });
  })();
  Object.assign(A, { warp, warpPt, OUTLINE_BASE, OUTLINE, LAYOUT_P0: p0 });
})(typeof globalThis !== 'undefined' ? globalThis : this);
