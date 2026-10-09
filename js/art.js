/* あいち電鉄 — SVG アート（すべて SVG で描く。色は css/tokens.css の変数を参照する） */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});

  // ---------- 24x24 のアイコン（currentColor で塗る） ----------
  const ICONS = {
    castle: '<rect x="3" y="20" width="18" height="2.2" rx="1"/><rect x="5" y="14.5" width="14" height="5.5"/><path d="M2.5 15 12 10.8 21.5 15z"/><rect x="8" y="8" width="8" height="3.6"/><path d="M6.5 8.2 12 4.2l5.5 4z"/><circle cx="12" cy="3" r="1.3"/>',
    shrine: '<rect x="1.5" y="5" width="21" height="2.6" rx="1"/><rect x="4" y="9.4" width="16" height="1.9"/><rect x="5.6" y="7" width="2.4" height="15"/><rect x="16" y="7" width="2.4" height="15"/>',
    food: '<path d="M2.5 12h19c0 5.2-4.2 8.5-9.5 8.5S2.5 17.2 2.5 12z"/><path d="M7.5 3.5c-1.4 1.6 1.4 2.6 0 4.6M12 2.5c-1.4 1.6 1.4 2.6 0 5M16.5 3.5c-1.4 1.6 1.4 2.6 0 4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    factory: '<path d="M2 21.5V10.5l6 3.8v-3.8l6 3.8V5.5h3.6l.9 8.8H22v7.2z"/><circle cx="18.8" cy="3.2" r="1.6"/><circle cx="21" cy="1.8" r="1"/>',
    pottery: '<path d="M9 2.5h6v2.3c0 1.2-1.1 1.6-1.1 3 3.1 1 5.1 3.6 5.1 7 0 3.8-3 6.4-7 6.4s-7-2.6-7-6.4c0-3.4 2-6 5.1-7 0-1.4-1.1-1.8-1.1-3z"/><rect x="8" y="21" width="8" height="1.6" rx=".8"/>',
    mountain: '<path d="M1 20.5 9 6l4.2 7.2L16 9.2l7 11.3z"/><path d="M9 6l2 3.6-2-.8-1.8 1z" fill="var(--color-paper)"/>',
    sea: '<path d="M1.5 12.5c2.8-3.2 5 3 7.800 0s5 3 7.800 0 3 0 5.400 0M1.5 18c2.800-3.200 5 3 7.800 0s5 3 7.800 0 3 0 5.400 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="17" cy="6" r="3.2"/>',
    park: '<circle cx="12" cy="9" r="6.800"/><rect x="10.800" y="13.500" width="2.400" height="7.500"/><rect x="6" y="20.500" width="12" height="1.800" rx=".9"/>',
    onsen: '<path d="M2.500 12.500h19v2.200a5.300 5.300 0 0 1-5.300 5.300H7.800a5.300 5.300 0 0 1-5.300-5.300z"/><path d="M7.500 3.500c-1.400 1.600 1.400 2.600 0 4.600M12 2.500c-1.400 1.600 1.400 2.600 0 5M16.500 3.500c-1.400 1.600 1.400 2.600 0 4.600" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round"/>',
    museum: '<path d="M2 9 12 3l10 6z"/><rect x="4" y="10.500" width="2.600" height="7.500"/><rect x="8.800" y="10.500" width="2.600" height="7.500"/><rect x="12.600" y="10.500" width="2.600" height="7.500"/><rect x="17.400" y="10.500" width="2.600" height="7.500"/><rect x="2" y="19.500" width="20" height="2.500" rx="1"/>',
    farm: '<circle cx="12" cy="14.300" r="7.200"/><path d="M12 7.400C12 4.400 14 2.800 16.600 2.800 16.600 6 15 7.600 12 7.400z"/><rect x="11.200" y="4.500" width="1.600" height="4" rx=".8"/>',
    train: '<rect x="4.500" y="2.800" width="15" height="14.500" rx="3.500"/><rect x="7" y="5.500" width="10" height="5" rx="1.200" fill="var(--color-paper)"/><circle cx="8.500" cy="14" r="1.300" fill="var(--color-paper)"/><circle cx="15.500" cy="14" r="1.300" fill="var(--color-paper)"/><path d="M7 17.500 5 22M17 17.500 19 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tower: '<path d="M12 1.500l1.200 5.500h-2.400z"/><path d="M10.200 8h3.600l2.600 14h-2.300l-.4-3.800h-3.400L10.300 22H7.600z"/><rect x="8.800" y="11" width="6.400" height="1.800" rx=".9"/>',
    airport: '<path d="M21.500 14.500v-2l-8.200-5V3.800a1.500 1.500 0 0 0-3 0v3.700l-8.300 5v2l8.300-2.600v5.600l-2.200 1.700v1.800l3.700-1 3.700 1v-1.800l-2.200-1.700v-5.600z"/>',
    festival: '<rect x="9.500" y="1.800" width="5" height="2.200" rx="1"/><ellipse cx="12" cy="12" rx="6.500" ry="8"/><rect x="9.500" y="20" width="5" height="2.200" rx="1"/><path d="M6 9.500h12M5.500 12h13M6 14.500h12" stroke="var(--color-paper)" stroke-width="1.100" fill="none"/>',
    fish: '<path d="M1.800 12c4-6.300 11-6.300 14.500 0-3.500 6.300-10.500 6.300-14.500 0z"/><path d="M15.500 12l6.500-5.500v11z"/><circle cx="7" cy="10.800" r="1.200" fill="var(--color-paper)"/>',
    bird: '<path d="M3 16c4 0 6.200-2.200 6.200-6.200 0-2.300 1.500-4.300 4.200-4.300 2.200 0 3.600 1.500 3.600 3.700L21.500 9l-2.800 2.400c0 5.300-4.300 9.100-9.300 9.100H5z"/><circle cx="14.200" cy="8.700" r=".9" fill="var(--color-paper)"/>',
    leaf: '<path d="M12 2l2.300 4.700 3.100-1-1.100 4.400L21 10.400l-3.700 3.100 2.100 4.200-4.700-.9L12 22l-2.700-5.200-4.700.9 2.100-4.200L3 10.400l4.700-.3-1.100-4.400 3.100 1z"/>',
    card: '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8.500 8h7M8.500 12h7M8.500 16h4" stroke="var(--color-paper)" stroke-width="1.800" stroke-linecap="round" fill="none"/>',
    craft: '<rect x="6" y="2.500" width="12" height="3.200" rx="1.200"/><rect x="6" y="18.300" width="12" height="3.200" rx="1.200"/><rect x="8" y="5.700" width="8" height="12.600"/><path d="M8 8.500l8 3M8 12l8 3M8 15l8 3" stroke="var(--color-paper)" stroke-width="1.200"/>',
  };
  const icon = (name, size) => '<svg viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" fill="currentColor" aria-hidden="true">' + (ICONS[name] || ICONS.park) + '</svg>';
  const iconInner = (name) => ICONS[name] || ICONS.park;

  // ---------- キャラクター（駒）。viewBox は -24 -24 48 48 ----------
  const INK = 'var(--color-ink)', PAPER = 'var(--color-paper)';
  const CHAR_ART = [
    // 0: シャチ（金のシャチホコ）
    (c) => `<circle r="22" style="fill:${c}" stroke="${PAPER}" stroke-width="3"/>
      <path d="M-10 -10 L-3 -23 L2 -9 Z" fill="${INK}"/>
      <ellipse cx="0" cy="3" rx="16" ry="14" fill="${INK}"/>
      <path d="M-11 9 Q0 20 11 9 Q0 13 -11 9 Z" fill="${PAPER}"/>
      <ellipse cx="-6.500" cy="-1.500" rx="4.400" ry="3.300" fill="${PAPER}"/><ellipse cx="6.500" cy="-1.500" rx="4.400" ry="3.300" fill="${PAPER}"/>
      <circle cx="-6" cy="-1" r="1.800" fill="${INK}"/><circle cx="7" cy="-1" r="1.800" fill="${INK}"/>
      <path d="M-4 6.500 Q0 9.500 4 6.500" stroke="${PAPER}" stroke-width="1.600" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="-13" r="1.700" style="fill:var(--color-gold)"/>`,
    // 1: 招き猫
    (c) => `<circle r="22" style="fill:${c}" stroke="${PAPER}" stroke-width="3"/>
      <path d="M-15 -4 L-12.500 -19 L-3 -11 Z M15 -4 L12.500 -19 L3 -11 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.600" stroke-linejoin="round"/>
      <ellipse cx="0" cy="3" rx="15.500" ry="13" fill="${PAPER}" stroke="${INK}" stroke-width="1.600"/>
      <path d="M-9 0 q2.500 -3.200 5 0 M4 0 q2.500 -3.200 5 0" stroke="${INK}" stroke-width="1.900" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="4" r="1.300" style="fill:var(--color-accent-3)"/>
      <path d="M-3.500 7.500 q1.750 2.200 3.500 0 q1.750 2.200 3.500 0" stroke="${INK}" stroke-width="1.300" fill="none" stroke-linecap="round"/>
      <ellipse cx="-9" cy="6" rx="2.600" ry="1.700" style="fill:var(--color-accent-3)" opacity=".35"/><ellipse cx="9" cy="6" rx="2.600" ry="1.700" style="fill:var(--color-accent-3)" opacity=".35"/>
      <circle cx="0" cy="14" r="2.600" style="fill:var(--color-accent-3)" stroke="${INK}" stroke-width="1"/>
      <ellipse cx="18" cy="-2" rx="4.200" ry="5" fill="${PAPER}" stroke="${INK}" stroke-width="1.500"/>
      <ellipse cx="-17" cy="12" rx="4.400" ry="5.600" style="fill:var(--color-gold)" stroke="${INK}" stroke-width="1.300"/>`,
    // 2: エビフライ
    (c) => `<circle r="22" style="fill:${c}" stroke="${PAPER}" stroke-width="3"/>
      <path d="M9 -9 L17 -19 L19 -8 L24 -13 L20 -2 Z" style="fill:var(--color-accent-3-deep)" stroke="${INK}" stroke-width="1.300" stroke-linejoin="round"/>
      <path d="M-15 5 C-15 -10 5 -16 13 -6 C18 1 14 11 6 13 C-2 15 -11 14 -15 5 Z" style="fill:var(--color-gold)" stroke="${INK}" stroke-width="1.700"/>
      <g style="fill:var(--color-accent-deep)"><circle cx="-8" cy="-2" r="1"/><circle cx="3" cy="-8" r="1"/><circle cx="9" cy="2" r="1"/><circle cx="-1" cy="9" r="1"/><circle cx="-11" cy="7" r="1"/><circle cx="6" cy="9" r="1"/></g>
      <circle cx="-4" cy="2" r="1.800" fill="${INK}"/><circle cx="4.500" cy="2" r="1.800" fill="${INK}"/>
      <path d="M-2.500 6.500 Q0.500 9 3.500 6.500" stroke="${INK}" stroke-width="1.500" fill="none" stroke-linecap="round"/>`,
    // 3: 名古屋コーチン
    (c) => `<circle r="22" style="fill:${c}" stroke="${PAPER}" stroke-width="3"/>
      <circle cx="-5.500" cy="-12" r="4" style="fill:var(--color-accent-3)" stroke="${INK}" stroke-width="1.200"/><circle cx="0" cy="-14.500" r="4.600" style="fill:var(--color-accent-3)" stroke="${INK}" stroke-width="1.200"/><circle cx="5.500" cy="-12" r="4" style="fill:var(--color-accent-3)" stroke="${INK}" stroke-width="1.200"/>
      <circle cx="0" cy="3" r="14.500" fill="${PAPER}" stroke="${INK}" stroke-width="1.700"/>
      <path d="M-3.200 3 L3.200 3 L0 9.500 Z" style="fill:var(--color-gold)" stroke="${INK}" stroke-width="1.100" stroke-linejoin="round"/>
      <circle cx="-6.500" cy="-1.500" r="1.800" fill="${INK}"/><circle cx="6.500" cy="-1.500" r="1.800" fill="${INK}"/>
      <ellipse cx="0" cy="11.500" rx="2.200" ry="3" style="fill:var(--color-accent-3)"/>
      <ellipse cx="-10" cy="4" rx="2.600" ry="1.700" style="fill:var(--color-accent-3)" opacity=".3"/><ellipse cx="10" cy="4" rx="2.600" ry="1.700" style="fill:var(--color-accent-3)" opacity=".3"/>`,
  ];
  const characterInner = (i) => CHAR_ART[i % CHAR_ART.length](A.CHARS[i % A.CHARS.length].color);
  const character = (i, size) => '<svg viewBox="-24 -24 48 48" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true">' + characterInner(i) + '</svg>';

  // ---------- 貧乏神 ----------
  const godInner = () => `
    <path d="M-13 22 L-9.500 4 Q0 -1 9.500 4 L13 22 Z" style="fill:var(--god-robe)" stroke="${INK}" stroke-width="1.500" stroke-linejoin="round"/>
    <rect x="-8" y="10" width="6" height="6" rx="1" style="fill:var(--color-paper-3)" transform="rotate(-8 -5 13)"/>
    <rect x="3" y="14" width="5" height="5" rx="1" style="fill:var(--color-accent)" transform="rotate(10 5 16)"/>
    <path d="M-12 7 l-7 6 M12 7 l7 6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="0" cy="-7" r="11.500" style="fill:var(--god-skin)" stroke="${INK}" stroke-width="1.500"/>
    <path d="M-12 -10 L-14 -19 L-7 -14 L-4 -22 L0 -15 L5 -22 L7 -14 L14 -19 L12 -9 Q0 -17 -12 -10 Z" fill="${INK}"/>
    <path d="M-8 -9.500 L-3 -7.500 M8 -9.500 L3 -7.500" stroke="${INK}" stroke-width="1.700" stroke-linecap="round"/>
    <ellipse cx="-5" cy="-5" rx="2.800" ry="3.200" fill="${PAPER}"/><ellipse cx="5" cy="-5" rx="2.800" ry="3.200" fill="${PAPER}"/>
    <circle cx="-5" cy="-4" r="1.300" fill="${INK}"/><circle cx="5" cy="-4" r="1.300" fill="${INK}"/>
    <path d="M-4 1.500 q1.300 -2 2.700 0 q1.300 2 2.700 0 q1.300 -2 2.700 0" stroke="${INK}" stroke-width="1.400" fill="none" stroke-linecap="round" transform="translate(-0.700 2)"/>
    <path d="M9 -13 q2 3 0 5 q-2 -2 0 -5z" style="fill:var(--color-accent-2)"/>`;
  const god = (size) => '<svg viewBox="-22 -24 44 48" width="' + (size || 36) + '" height="' + (size ? size * 1.09 : 40) + '" aria-hidden="true">' + godInner() + '</svg>';

  // ---------- サイコロ ----------
  const PIPS = {
    1: [[24, 24]], 2: [[14, 14], [34, 34]], 3: [[13, 13], [24, 24], [35, 35]],
    4: [[14, 14], [34, 14], [14, 34], [34, 34]], 5: [[14, 14], [34, 14], [24, 24], [14, 34], [34, 34]],
    6: [[14, 12], [34, 12], [14, 24], [34, 24], [14, 36], [34, 36]],
  };
  function dice(v, size) {
    const body = v >= 1 && v <= 6
      ? PIPS[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.400" style="fill:${v === 1 ? 'var(--color-accent-3)' : 'var(--color-ink)'}"/>`).join('')
      : `<text x="24" y="32" text-anchor="middle" font-size="${String(v).length > 1 ? 22 : 26}" font-weight="800" style="fill:var(--color-ink)">${v}</text>`;
    return '<svg viewBox="0 0 48 48" width="' + (size || 64) + '" height="' + (size || 64) + '" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="11" style="fill:var(--color-paper)" stroke="var(--color-ink)" stroke-width="3"/>' + body + '</svg>';
  }

  // ---------- カードの絵柄 ----------
  function cardArt(id) {
    const c = A.CARDS[id], ink = INK;
    const trainBody = (n) => `<rect x="10" y="22" width="${28 + n * 0}" height="16" rx="5" style="fill:var(--color-paper)" stroke="${ink}" stroke-width="2.500"/><rect x="14" y="26" width="8" height="6" rx="1.500" fill="${ink}"/><rect x="26" y="26" width="8" height="6" rx="1.500" fill="${ink}"/><circle cx="17" cy="41" r="3" fill="${ink}"/><circle cx="31" cy="41" r="3" fill="${ink}"/>` +
      Array.from({ length: n }, (_, i) => `<path d="M${8 - i * 0} ${14 + i * 3}h${10 + i * 2}" stroke="${ink}" stroke-width="2.200" stroke-linecap="round" opacity="${0.9 - i * 0.2}" transform="translate(${-2 + i * 2} 0)"/>`).join('');
    const art = {
      express: trainBody(1), limited: trainBody(2), shinkansen: trainBody(3),
      six: dice(6, 40).replace('width="40" height="40"', 'x="4" y="6" width="40" height="40"'),
      warp: `<path d="M24 8a16 16 0 1 1-14 8M24 15a9 9 0 1 1-8 5M24 22a3 3 0 1 1-3 3" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
      stop: `<path d="M16 5h16l11 11v16L32 43H16L5 32V16z" style="fill:var(--color-accent-3)" stroke="${ink}" stroke-width="2.500" stroke-linejoin="round"/><rect x="14" y="21" width="20" height="6" rx="2" fill="${PAPER}"/>`,
      harai: `<path d="M24 4v10" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><path d="M16 14h16l-3 7 4 4-5 4 3 6H18l3-6-5-4 4-4z" fill="${PAPER}" stroke="${ink}" stroke-width="2.200" stroke-linejoin="round"/>`,
      bonus: `<circle cx="24" cy="24" r="17" style="fill:var(--color-gold)" stroke="${ink}" stroke-width="2.500"/><text x="24" y="31" text-anchor="middle" font-size="22" font-weight="800" fill="${ink}">¥</text>`,
      sale: `<path d="M6 24 24 6h18v18L24 42z" fill="${PAPER}" stroke="${ink}" stroke-width="2.500" stroke-linejoin="round"/><circle cx="35" cy="13" r="2.500" fill="${ink}"/><text x="22" y="30" text-anchor="middle" font-size="13" font-weight="800" fill="${ink}" transform="rotate(-45 22 26)">50%</text>`,
      buyout: `<path d="M7 40V20L24 8l17 12v20z" fill="${PAPER}" stroke="${ink}" stroke-width="2.500" stroke-linejoin="round"/><circle cx="24" cy="27" r="7" style="fill:var(--color-gold)" stroke="${ink}" stroke-width="2"/><text x="24" y="31" text-anchor="middle" font-size="10" font-weight="800" fill="${ink}">¥</text>`,
    }[id] || '';
    return '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">' + art + '</svg>';
  }

  // ---------- 季節 ----------
  function season(month) {
    if (month >= 3 && month <= 5) return { name: '春', svg: `<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true"><g style="fill:var(--color-accent-3)" opacity=".85">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-6" rx="3.800" ry="5.500" transform="rotate(${a})"/>`).join('')}</g><circle r="2.200" style="fill:var(--color-accent)"/></svg>` };
    if (month >= 6 && month <= 8) return { name: '夏', svg: `<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true"><circle r="5.500" style="fill:var(--color-accent)" stroke="var(--color-accent-deep)" stroke-width="1.500"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0 -8.500v-3" stroke="var(--color-accent-deep)" stroke-width="2" stroke-linecap="round" transform="rotate(${a})"/>`).join('')}</svg>` };
    if (month >= 9 && month <= 11) return { name: '秋', svg: `<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true" style="color:var(--color-accent-3)"><g fill="currentColor" transform="translate(-12 -12)">${ICONS.leaf}</g></svg>` };
    return { name: '冬', svg: `<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true"><g stroke="var(--color-accent-2)" stroke-width="2" stroke-linecap="round">${[0, 60, 120].map((a) => `<path d="M0 -10V10" transform="rotate(${a})"/>`).join('')}</g></svg>` };
  }

  // ---------- 地図の背景 ----------
  function smoothPath(pts, closed) {
    // Catmull-Rom → ベジェ
    const n = pts.length, P = (i) => pts[(i + n) % n];
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = closed ? P(i - 1) : pts[Math.max(0, i - 1)], p1 = P(i), p2 = P(i + 1), p3 = closed ? P(i + 2) : pts[Math.min(n - 1, i + 2)];
      const t = 0.5 / 3 * 1.0;
      const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
      const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
      d += 'C' + c1[0].toFixed(1) + ' ' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ' ' + c2[1].toFixed(1) + ' ' + p2[0] + ' ' + p2[1];
    }
    return d + (closed ? 'Z' : '');
  }
  function insidePoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function mapBackground() {
    const K = A.K, B = A.Board;
    // 地図が大きくなった分、文字と線の太さだけ f 倍にする（木・家・キャラの大きさは変えない）
    const f = K / 1.7;
    const O = A.OUTLINE;                                       // 画面の座標（px）の県の輪郭
    const P = (p) => [p[0] * K, p[1] * K];
    const W = (p) => { const q = A.warpPt(p); return [q[0] * K, q[1] * K]; }; // 元の座標 → ゆがみ → px
    const rnd = B.mulberry32(4242);
    const xs = O.map((p) => p[0]), ys = O.map((p) => p[1]);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);

    // 隣の県（岐阜・長野・静岡・三重）。愛知の外側をぐるっと囲む
    const border = O.slice(-5).concat(O.slice(0, 15));
    const mie = [[240, 1030], [180, 1000], [120, 985], [40, 960], [-30, 910], [-80, 850], [-60, 780], [-20, 710], [10, 640], [30, 570], [50, 500], [70, 455]].map(W);
    const shizuoka = [[1000, 812], [1120, 826], [1500, 850]].map(W);
    const far = [[1500, -300], [-300, -300], [-300, 1100]].map(P);
    const neighbor = [W([90, 440])].concat(border, shizuoka, far, mie);
    const neighborD = 'M' + neighbor.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
    const landD = smoothPath(O, true);

    // 木・山・家のかざり（駅・ラベル・路線をよけて置く）
    const segs = [];
    B.links.forEach((l) => { const a = B.byId[l.a], b = B.byId[l.b]; segs.push([a.x, a.y, b.x, b.y]); });
    function nearRail(x, y, lim) {
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < lim) return true;
      }
      return false;
    }
    function nearStation(x, y) {
      return A.STATIONS.some((s) => {
        if (Math.hypot(x - s.x, y - s.y) < 34) return true;
        const r = B.labels[s.id].rect;
        return x > r[0] - 10 && x < r[2] + 10 && y > r[1] - 10 && y < r[3] + 10;
      });
    }
    function distToCoast(x, y) {
      let best = 1e9;
      for (let i = 0; i < O.length; i++) {
        const [ax, ay] = O[i], [bx, by] = O[(i + 1) % O.length];
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
      }
      return best;
    }
    const want = Math.round(190 * f * f);   // 面積に比例して、かざりの数をふやす
    let deco = '';
    const placed = [];
    for (let k = 0; k < want * 80 && placed.length < want; k++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (!insidePoly(x, y, O) || distToCoast(x, y) < 16 * f) continue;
      if (nearStation(x, y) || nearRail(x, y, 24)) continue;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < 30 * f)) continue;
      placed.push([x, y]);
      const mountainZone = x > x0 + (x1 - x0) * 0.62 && y < y0 + (y1 - y0) * 0.6;
      if (mountainZone) {
        const s = 0.8 + rnd() * 0.7;
        deco += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})"><path d="M-17 9 -3 -14 4 -4 9 -10 21 9z" class="m-hill"/><path d="M-3 -14 0 -9 -4 -8 -7 -9z M9 -10l3 4-3 1-3-2z" class="m-snow"/></g>`;
      } else if (rnd() < 0.82) {
        const s = 0.8 + rnd() * 0.5;
        deco += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})"><circle cx="-5" cy="2" r="6.500" class="m-tree"/><circle cx="5" cy="3" r="6" class="m-tree2"/><circle cx="0" cy="-4" r="6.500" class="m-tree"/></g>`;
      } else {
        deco += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><rect x="-6" y="-2" width="12" height="9" rx="1.500" class="m-house"/><path d="M-8 -2 0 -9l8 7z" class="m-roof"/></g>`;
      }
    }

    // 川（木曽川・矢作川・豊川）。元の座標の点を、ゆがみにそって動かす
    const riverPts = [
      [[175, 80], [120, 150], [75, 250], [70, 330], [90, 438]],
      [[880, 262], [800, 310], [720, 350], [650, 400], [600, 470], [595, 530], [560, 600], [500, 670], [450, 720], [430, 748]],
      [[965, 372], [930, 450], [890, 520], [850, 590], [800, 660], [785, 720], [780, 766]],
    ];
    const rivers = riverPts.map((pts) => `<path d="${smoothPath(pts.map(W), false)}" class="m-river" style="stroke-width:${8 * f}"/>`).join('');

    // 島（セントレア・日間賀島・篠島・佐久島）は駅の場所に置く
    const islands = A.STATIONS.filter((s) => s.island).map((s) => {
      const big = s.id === 'centrair';
      return `<ellipse cx="${s.x}" cy="${s.y}" rx="${big ? 62 : 40}" ry="${big ? 30 : 24}" transform="rotate(${big ? -20 : 12} ${s.x} ${s.y})" class="m-island" style="stroke-width:${3 * f}"/>`;
    }).join('');

    const boat = (p, s, d) => { const q = W(p); return `<g transform="translate(${q[0].toFixed(0)} ${q[1].toFixed(0)}) scale(${(s * f).toFixed(2)})"><g class="m-boat" style="animation-delay:${d}s"><path d="M-14 0h28l-5 8h-18z" class="m-hull"/><rect x="-1" y="-16" width="2" height="16" class="m-mast"/><path d="M2 -15 14 -3H2z" class="m-sail"/></g></g>`; };
    const label = (p, text, size, rot, cls) => { const q = W(p); return `<text x="${q[0].toFixed(0)}" y="${q[1].toFixed(0)}" font-size="${(size * f).toFixed(0)}" text-anchor="middle" class="${cls}"${rot ? ` transform="rotate(${rot} ${q[0].toFixed(0)} ${q[1].toFixed(0)})"` : ''}>${text}</text>`; };

    return `
      <defs>
        <pattern id="pWave" width="${(64 * f).toFixed(1)}" height="${(34 * f).toFixed(1)}" patternUnits="userSpaceOnUse"><path d="M0 ${(17 * f).toFixed(1)}q${(16 * f).toFixed(1)} ${(-11 * f).toFixed(1)} ${(32 * f).toFixed(1)} 0t${(32 * f).toFixed(1)} 0" class="m-wave" style="stroke-width:${(2.2 * f).toFixed(1)}"/></pattern>
        <pattern id="pDot" width="${(22 * f).toFixed(1)}" height="${(22 * f).toFixed(1)}" patternUnits="userSpaceOnUse"><circle cx="${(5 * f).toFixed(1)}" cy="${(6 * f).toFixed(1)}" r="${(1.3 * f).toFixed(1)}" class="m-dot"/><circle cx="${(16 * f).toFixed(1)}" cy="${(15 * f).toFixed(1)}" r="${f.toFixed(1)}" class="m-dot"/></pattern>
        <pattern id="pGrid" x="${-A.GRID / 2}" y="${-A.GRID / 2}" width="${A.GRID}" height="${A.GRID}" patternUnits="userSpaceOnUse"><path d="M0 0H${A.GRID}M0 0V${A.GRID}" class="m-grid"/></pattern>
      </defs>
      <rect x="${(x0 - 3000).toFixed(0)}" y="${(y0 - 3000).toFixed(0)}" width="${(x1 - x0 + 6000).toFixed(0)}" height="${(y1 - y0 + 6000).toFixed(0)}" class="m-sea"/>
      <rect x="${(x0 - 3000).toFixed(0)}" y="${(y0 - 3000).toFixed(0)}" width="${(x1 - x0 + 6000).toFixed(0)}" height="${(y1 - y0 + 6000).toFixed(0)}" fill="url(#pWave)" opacity=".8"/>
      <path d="${neighborD}" class="m-neighbor"/>
      <path d="${neighborD}" fill="url(#pDot)" opacity=".6"/>
      ${label([520, -40], '岐阜県', 30, 0, 'm-pref')}${label([1020, 60], '長野県', 28, 0, 'm-pref')}
      ${label([-150, 520], '三重県', 30, -90, 'm-pref')}${label([1240, 760], '静岡県', 30, 0, 'm-pref')}
      <path d="${landD}" class="m-shore" style="stroke-width:${(34 * f).toFixed(1)}"/>
      <path d="${landD}" class="m-land" style="stroke-width:${(3.5 * f).toFixed(1)}"/>
      <path d="${landD}" fill="url(#pDot)"/>
      <path d="${landD}" fill="url(#pGrid)"/>
      ${rivers}${islands}
      ${deco}
      ${label([300, 190], '尾 張', 64, 0, 'm-region')}${label([760, 500], '三 河', 76, 0, 'm-region')}
      ${label([255, 745], '知多半島', 34, -82, 'm-region')}${label([500, 893], '渥美半島', 40, -9, 'm-region')}
      ${label([76, 590], '伊勢湾', 24, -90, 'm-sea-label')}${label([500, 800], '三河湾', 24, 0, 'm-sea-label')}${label([700, 958], '太 平 洋', 34, 0, 'm-sea-label')}
      ${boat([92, 570], 1, 0)}${boat([560, 780], 0.9, -1.4)}${boat([640, 935], 1.1, -0.7)}${boat([860, 884], 0.9, -2.1)}${boat([300, 985], 1, -1)}`;
  }

  // ---------- タイトルロゴ ----------
  function logo() {
    return `<svg viewBox="0 0 320 150" class="logo-svg" role="img" aria-label="あいち電鉄">
      <g class="logo-sun"><circle cx="262" cy="52" r="32" style="fill:var(--color-accent)"/><circle cx="262" cy="52" r="32" fill="none" style="stroke:var(--color-accent-deep)" stroke-width="3"/></g>
      <path d="M10 118h300" style="stroke:var(--color-ink)" stroke-width="5" stroke-linecap="round"/>
      <path d="M22 124h276" style="stroke:var(--color-ink)" stroke-width="3" stroke-dasharray="3 9"/>
      <g class="logo-train">
        <rect x="26" y="70" width="160" height="40" rx="14" style="fill:var(--color-accent-3);stroke:var(--color-ink)" stroke-width="4"/>
        <rect x="40" y="80" width="26" height="16" rx="5" style="fill:var(--color-paper);stroke:var(--color-ink)" stroke-width="3"/>
        <rect x="76" y="80" width="26" height="16" rx="5" style="fill:var(--color-paper);stroke:var(--color-ink)" stroke-width="3"/>
        <rect x="112" y="80" width="26" height="16" rx="5" style="fill:var(--color-paper);stroke:var(--color-ink)" stroke-width="3"/>
        <path d="M150 72h24a12 12 0 0 1 12 12v26h-36z" style="fill:var(--color-accent-2);stroke:var(--color-ink)" stroke-width="4" stroke-linejoin="round"/>
        <rect x="158" y="80" width="20" height="14" rx="4" style="fill:var(--color-paper);stroke:var(--color-ink)" stroke-width="3"/>
        <circle cx="52" cy="114" r="9" style="fill:var(--color-ink)"/><circle cx="96" cy="114" r="9" style="fill:var(--color-ink)"/><circle cx="160" cy="114" r="9" style="fill:var(--color-ink)"/>
        <path d="M40 70c0-12 8-16 8-26M62 70c0-8 5-10 5-18" style="stroke:var(--color-ink-2)" stroke-width="5" stroke-linecap="round" fill="none" opacity=".35"/>
      </g>
      <g transform="translate(236 24) scale(.62)" style="color:var(--color-ink)"><g fill="currentColor">${ICONS.castle.replace(/<circle cx="12" cy="3" r="1.3"\/>/, '<circle cx="12" cy="3" r="1.8" style="fill:var(--color-gold)"/>')}</g></g>
    </svg>`;
  }

  function trophy(size) {
    return `<svg viewBox="0 0 48 48" width="${size || 48}" height="${size || 48}" aria-hidden="true"><path d="M14 6h20v12a10 10 0 0 1-20 0z" style="fill:var(--color-gold);stroke:var(--color-ink)" stroke-width="2.500" stroke-linejoin="round"/><path d="M14 10H7v4c0 5 4 8 8 8M34 10h7v4c0 5-4 8-8 8" fill="none" style="stroke:var(--color-ink)" stroke-width="2.500"/><rect x="21" y="27" width="6" height="8" style="fill:var(--color-gold);stroke:var(--color-ink)" stroke-width="2.500"/><rect x="14" y="35" width="20" height="7" rx="2" style="fill:var(--color-gold);stroke:var(--color-ink)" stroke-width="2.500"/></svg>`;
  }

  function flag(size) {
    return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" aria-hidden="true"><path d="M5 22V3" style="stroke:var(--color-ink)" stroke-width="2.500" stroke-linecap="round"/><path d="M5 4h14l-3.500 4.500L19 13H5z" style="fill:var(--color-accent-3);stroke:var(--color-ink)" stroke-width="1.800" stroke-linejoin="round"/></svg>`;
  }
  function coin(size) {
    return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" aria-hidden="true"><circle cx="12" cy="12" r="9.500" style="fill:var(--color-gold);stroke:var(--color-ink)" stroke-width="2"/><text x="12" y="16.500" text-anchor="middle" font-size="12" font-weight="800" style="fill:var(--color-ink)">¥</text></svg>`;
  }
  function cardMini(size) {
    return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" aria-hidden="true"><rect x="4" y="2.500" width="16" height="19" rx="3" style="fill:var(--color-accent);stroke:var(--color-ink)" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h5" style="stroke:var(--color-ink)" stroke-width="1.800" stroke-linecap="round"/></svg>`;
  }

  Object.assign(A, { Art: { ICONS, icon, iconInner, character, characterInner, god, godInner, dice, cardArt, season, mapBackground, smoothPath, logo, trophy, flag, coin, cardMini } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
