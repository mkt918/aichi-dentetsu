/* あいち電鉄 — 地図の描画・カメラ・駒の動き（SVG） */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const B = A.Board, L = A.Logic, UI = A.UI, Art = A.Art;
  const NS = 'http://www.w3.org/2000/svg';

  const bx = A.OUTLINE.map((p) => p[0]), by = A.OUTLINE.map((p) => p[1]);
  const minX = Math.min.apply(null, bx), maxX = Math.max.apply(null, bx), minY = Math.min.apply(null, by), maxY = Math.max.apply(null, by);
  const WORLD = { x0: minX - 160, y0: minY - 160, x1: maxX + 160, y1: maxY + 160 };
  const FIT = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX + 200, h: maxY - minY + 200 };
  const ZOOM_MIN = 230, ZOOM_MAX = Math.max(3200, (maxX - minX) * 1.5);

  function svgEl(tag, attrs, html) {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    if (html != null) e.innerHTML = html;
    return e;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const starPath = (r) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r, a = (Math.PI / 5) * i - Math.PI / 2;
      d += (i ? 'L' : 'M') + (Math.cos(a) * rad).toFixed(2) + ' ' + (Math.sin(a) * rad).toFixed(2);
    }
    return d + 'Z';
  };

  class MapView {
    constructor(svg, stage) {
      this.svg = svg; this.stage = stage;
      this.cam = { cx: FIT.cx, cy: FIT.cy, w: FIT.w };
      this.follow = true;
      this.routeOn = false;
      this.pieces = [];
      this.stationEls = {};
      this.pipEls = {};
      this.camAnim = 0;
      this.onStationTap = null;
      this._pick = null;
      this._bindInput();
      if (root.ResizeObserver) new ResizeObserver(() => this.applyCam()).observe(stage);
    }

    // ---------- 描画の組み立て ----------
    init(state) {
      const svg = this.svg;
      svg.innerHTML = '';
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const bg = svgEl('g', { id: 'layer-bg' }, Art.mapBackground());
      const gEdges = svgEl('g', { id: 'layer-edges' });
      const gRoute = svgEl('g', { id: 'layer-route' });
      const gLab = svgEl('g', { id: 'layer-labels' });
      const gSq = svgEl('g', { id: 'layer-squares' });
      const gSt = svgEl('g', { id: 'layer-stations' });
      const gMark = svgEl('g', { id: 'layer-marks' });
      const gPieces = svgEl('g', { id: 'layer-pieces' });
      const gFx = svgEl('g', { id: 'layer-fx' });
      [bg, gEdges, gRoute, gLab, gSq, gSt, gMark, gPieces, gFx].forEach((g) => svg.appendChild(g));
      this.gRoute = gRoute; this.gFx = gFx; this.gPieces = gPieces; this.gMark = gMark;

      B.edges.forEach((e) => {
        const cls = e.sea ? 'rail rail--sea' : e.bridge ? 'rail rail--bridge' : 'rail';
        gEdges.appendChild(svgEl('path', { d: e.d, class: cls + '-bed' }));
        gEdges.appendChild(svgEl('path', { d: e.d, class: cls + '-line' }));
      });

      B.nodes.forEach((n) => {
        if (n.type === 'station') return;
        const g = svgEl('g', { class: 'sq sq-' + n.type, transform: 'translate(' + n.x + ' ' + n.y + ')', 'data-id': n.id });
        g.appendChild(svgEl('rect', { x: -9.5, y: -9.5, width: 19, height: 19, rx: 3.5, class: 'sq-c' }));
        let glyph = '';
        if (n.type === 'blue') glyph = '<path d="M-4.5 0h9M0 -4.5v9" class="sq-g"/>';
        else if (n.type === 'red') glyph = '<path d="M-4.5 0h9" class="sq-g"/>';
        else if (n.type === 'yellow') glyph = '<rect x="-3.5" y="-4.6" width="7" height="9.2" rx="1.6" class="sq-card"/>';
        else glyph = '<path d="' + starPath(5.6) + '" class="sq-star"/>';
        g.appendChild(svgEl('g', null, glyph));
        gSq.appendChild(g);
      });

      A.STATIONS.forEach((s) => {
        const iconName = s.props.length ? s.props.reduce((a, b) => (b.price > a.price ? b : a)).icon : 'card';
        const g = svgEl('g', { class: 'st' + (s.card ? ' st-card' : ''), transform: 'translate(' + s.x + ' ' + s.y + ')', 'data-id': s.id, tabindex: '-1' });
        g.appendChild(svgEl('rect', { x: -29, y: -29, width: 58, height: 58, rx: 15, class: 'st-halo' }));
        g.appendChild(svgEl('rect', { x: -19.5, y: -19.5, width: 39, height: 39, rx: 8, class: 'st-base' }));
        g.appendChild(svgEl('g', { class: 'st-icon', transform: 'translate(-10.5 -10.5) scale(.875)' }, Art.iconInner(iconName)));
        if (s.shop) g.appendChild(svgEl('g', { class: 'st-shop', transform: 'translate(-19 -19)' }, '<circle r="9.5" class="st-shop-bg"/><g transform="translate(-6 -6) scale(.5)" class="st-shop-ic">' + Art.iconInner('card') + '</g>'));
        const lb = B.labels[s.id], n = s.props.length;
        // 駅名と物件の持ち主の印は、マスより下の層に描く（マスが文字で隠れないように）
        const lab = svgEl('g', { class: 'st-label', transform: 'translate(' + s.x + ' ' + s.y + ')' });
        lab.appendChild(svgEl('text', { class: 'st-name', x: lb.tx - s.x, y: lb.ty - s.y, 'text-anchor': lb.anchor }, UI.esc(s.name)));
        const pips = svgEl('g', { class: 'st-pips', transform: 'translate(' + (lb.px - s.x) + ' ' + (lb.py - s.y) + ')' });
        s.props.forEach((p, i) => {
          const px = lb.anchor === 'middle' ? (i - (n - 1) / 2) * 12.5 - 5 : lb.anchor === 'start' ? i * 12.5 : -(n - i) * 12.5 + 2.5;
          pips.appendChild(svgEl('rect', { class: 'pip', 'data-prop': p.id, x: px, y: -3, width: 10, height: 6, rx: 3 }));
        });
        lab.appendChild(pips);
        gLab.appendChild(lab);
        this.pipEls[s.id] = Array.from(pips.querySelectorAll('.pip'));
        g.appendChild(svgEl('path', { class: 'st-crown', d: 'M-8 -2l3 5 5-8 5 8 3-5-1 9h-14z', transform: 'translate(15 -27) scale(.8)' }));
        gSt.appendChild(g);
        this.stationEls[s.id] = g;
      });

      // 目的地の旗
      this.flag = svgEl('g', { class: 'dest-flag' }, '<path d="M0 0V-40" class="flag-pole"/><path d="M0 -40h26l-6 8 6 8H0z" class="flag-cloth"/><text x="11" y="-27" class="flag-text" text-anchor="middle">GO</text>');
      gMark.appendChild(this.flag);

      // 駒
      this.pieces = state.players.map((p) => {
        const g = svgEl('g', { class: 'piece', 'data-i': p.id });
        const inner =
          '<ellipse class="piece-shadow" rx="12" ry="4.5" cy="1"/>' +
          '<g class="piece-body"><circle class="piece-ring" r="21" cy="-23"/><g transform="translate(0 -23) scale(.78)">' + Art.characterInner(p.char) + '</g></g>' +
          '<g class="piece-god" transform="translate(15 -42) scale(.5)">' + Art.godInner() + '</g>' +
          '<g class="piece-count" transform="translate(0 -56)"><rect x="-13" y="-11" width="26" height="22" rx="11"/><text y="5" text-anchor="middle">0</text></g>';
        g.innerHTML = inner;
        gPieces.appendChild(g);
        return { g, x: 0, y: 0, node: p.pos, body: g.querySelector('.piece-body'), count: g.querySelector('.piece-count'), countText: g.querySelector('.piece-count text'), god: g.querySelector('.piece-god') };
      });
      this.refresh(state);
      this.fit(0);
    }

    // ---------- 状態の反映 ----------
    refresh(state) {
      A.STATIONS.forEach((s) => {
        const el = this.stationEls[s.id];
        const mono = L.monopolyOwner(state, s.id);
        el.classList.toggle('is-mono', mono >= 0);
        el.classList.toggle('is-dest', state.dest === s.id);
        s.props.forEach((p, i) => {
          const pip = this.pipEls[s.id][i];
          const o = state.owners[p.id];
          pip.style.fill = o === undefined ? '' : A.CHARS[state.players[o].char % A.CHARS.length].color;
          pip.classList.toggle('is-owned', o !== undefined);
        });
      });
      const d = B.byId[state.dest];
      this.flag.setAttribute('transform', 'translate(' + (d.x + 14) + ' ' + (d.y - 22) + ')');
      this.layoutPieces(state, false);
      state.players.forEach((p, i) => { this.pieces[i].god.classList.toggle('is-on', !!p.god); });
      this.drawRoute(state);
    }

    setCurrent(i) {
      this.pieces.forEach((p, k) => p.g.classList.toggle('is-current', k === i));
      // 手前に描く
      if (this.pieces[i]) this.gPieces.appendChild(this.pieces[i].g);
    }

    /** 同じマスに複数の駒がいるとき、重ならないようにずらす */
    offsetFor(state, i, nodeId) {
      const same = state.players.filter((p) => this.pieces[p.id].node === nodeId).map((p) => p.id);
      const k = same.indexOf(i), n = same.length;
      if (n <= 1) return [0, 0];
      const R = n === 2 ? 11 : 13;
      const a = (Math.PI * 2 * k) / n - Math.PI / 2 + (n === 2 ? Math.PI / 2 : 0);
      return [Math.cos(a) * R, Math.sin(a) * R * 0.7];
    }
    layoutPieces(state, animate) {
      state.players.forEach((p, i) => {
        const pc = this.pieces[i];
        pc.node = p.pos;
        const n = B.byId[p.pos], [ox, oy] = this.offsetFor(state, i, p.pos);
        pc.x = n.x + ox; pc.y = n.y + oy;
        pc.g.setAttribute('transform', 'translate(' + pc.x.toFixed(1) + ' ' + pc.y.toFixed(1) + ')');
        void animate;
      });
    }

    setCount(i, n) {
      const pc = this.pieces[i];
      if (n == null) { pc.count.classList.remove('is-on'); return; }
      pc.countText.textContent = n;
      pc.count.classList.add('is-on');
    }

    /** 駒を1マス動かす（ぴょんと跳ねる） */
    movePiece(state, i, toId, ms) {
      const pc = this.pieces[i], to = B.byId[toId];
      const fromX = pc.x, fromY = pc.y;
      pc.node = toId;
      const [ox, oy] = this.offsetFor(state, i, toId);
      const tx = to.x + ox, ty = to.y + oy;
      return new Promise((resolve) => {
        if (ms <= 0 || UI.rt.reduceMotion) {
          pc.x = tx; pc.y = ty;
          pc.g.setAttribute('transform', 'translate(' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ')');
          resolve(); return;
        }
        const t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          pc.x = fromX + (tx - fromX) * e; pc.y = fromY + (ty - fromY) * e;
          pc.g.setAttribute('transform', 'translate(' + pc.x.toFixed(1) + ' ' + pc.y.toFixed(1) + ')');
          pc.body.setAttribute('transform', 'translate(0 ' + (-Math.sin(Math.PI * t) * 11).toFixed(1) + ')');
          if (t < 1) requestAnimationFrame(step);
          else { pc.body.removeAttribute('transform'); resolve(); }
        };
        requestAnimationFrame(step);
      });
    }

    /** ワープ: 縮んで消え、行き先で現れる */
    async warpPiece(state, i, toId) {
      const pc = this.pieces[i];
      pc.g.classList.add('is-warping');
      await UI.sleep(380);
      pc.node = toId;
      this.layoutPieces(state, false);
      this.focusNode(toId, null, 300);
      await UI.sleep(120);
      pc.g.classList.remove('is-warping');
      pc.g.classList.add('is-appearing');
      await UI.sleep(420);
      pc.g.classList.remove('is-appearing');
    }

    /** マスの上にお金などの数字をふわっと出す */
    pop(nodeId, text, kind) {
      const n = B.byId[nodeId];
      const t = svgEl('text', { x: n.x, y: n.y - 46, class: 'pop pop--' + (kind || 'good'), 'text-anchor': 'middle' });
      t.textContent = text;
      this.gFx.appendChild(t);
      setTimeout(() => t.remove(), 1700);
    }
    pulseStation(id) {
      const el = this.stationEls[id];
      if (!el) return;
      el.classList.remove('is-pulse'); void el.getBoundingClientRect(); el.classList.add('is-pulse');
      setTimeout(() => el.classList.remove('is-pulse'), 1200);
    }

    // ---------- 目的地までのルート表示 ----------
    drawRoute(state) {
      this.gRoute.innerHTML = '';
      if (!this.routeOn) return;
      const idx = L.current(state), p = state.players[idx];
      const d = B.distFrom(state.dest);
      const pts = [[B.byId[p.pos].x, B.byId[p.pos].y]];
      let cur = p.pos, prev = null;
      for (let g = 0; g < 80 && cur !== state.dest; g++) {
        const nexts = B.byId[cur].adj.filter((id) => d[id] === d[cur] - 1);
        if (!nexts.length) break;
        const next = nexts.find((id) => id !== prev) || nexts[0];
        prev = cur; cur = next;
        pts.push([B.byId[cur].x, B.byId[cur].y]);
      }
      this.gRoute.appendChild(svgEl('polyline', { class: 'route', points: pts.map((q) => q.join(',')).join(' ') }));
    }
    setRoute(on, state) { this.routeOn = on; this.drawRoute(state); }

    // ---------- 分かれ道の選択 ----------
    pickNode(options) {
      this.cancelPick();
      return new Promise((resolve) => {
        const rings = options.map((id) => {
          const n = B.byId[id];
          const g = svgEl('g', { class: 'pick', transform: 'translate(' + n.x + ' ' + n.y + ')', 'data-id': id });
          g.innerHTML = '<rect x="-21" y="-21" width="42" height="42" rx="9" class="pick-ring"/><circle r="32" class="pick-hit"/><path d="M-5 -3l5 5 5-5" class="pick-arrow"/>';
          this.gFx.appendChild(g);
          return g;
        });
        this._pick = { resolve, rings };
      });
    }
    resolvePick(id) {
      if (!this._pick) return;
      const { resolve, rings } = this._pick;
      this._pick = null;
      rings.forEach((r) => r.remove());
      resolve(id);
    }
    cancelPick() {
      if (!this._pick) return;
      this._pick.rings.forEach((r) => r.remove());
      this._pick = null;
    }

    // ---------- カメラ ----------
    aspect() { const r = this.stage.getBoundingClientRect(); return r.height / Math.max(1, r.width); }
    applyCam() {
      const c = this.cam, w = c.w, h = w * this.aspect();
      this.svg.setAttribute('viewBox', (c.cx - w / 2).toFixed(1) + ' ' + (c.cy - h / 2).toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1));
    }
    clampCam() {
      const c = this.cam;
      c.w = clamp(c.w, ZOOM_MIN, ZOOM_MAX);
      c.cx = clamp(c.cx, WORLD.x0, WORLD.x1); c.cy = clamp(c.cy, WORLD.y0, WORLD.y1);
    }
    setCam(target, ms) {
      cancelAnimationFrame(this.camAnim);
      const from = Object.assign({}, this.cam);
      const to = { cx: target.cx, cy: target.cy, w: clamp(target.w, ZOOM_MIN, ZOOM_MAX) };
      to.cx = clamp(to.cx, WORLD.x0, WORLD.x1); to.cy = clamp(to.cy, WORLD.y0, WORLD.y1);
      if (!ms || UI.rt.reduceMotion) { this.cam = to; this.applyCam(); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
        this.cam = { cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, w: from.w + (to.w - from.w) * e };
        this.applyCam();
        if (t < 1) this.camAnim = requestAnimationFrame(tick);
      };
      this.camAnim = requestAnimationFrame(tick);
    }
    /** 画面の広さに合わせた「ちょうどよいズーム」 */
    comfyWidth() {
      const r = this.stage.getBoundingClientRect();
      return clamp(r.width < 560 ? 430 : r.width < 900 ? 560 : 640, ZOOM_MIN, ZOOM_MAX);
    }
    focusNode(id, w, ms) {
      if (!this.follow) return;
      const n = B.byId[id];
      this.setCam({ cx: n.x, cy: n.y - 6, w: w || Math.min(this.cam.w, this.comfyWidth()) }, ms == null ? 350 : ms);
    }
    forceFocus(id, w, ms) { const f = this.follow; this.follow = true; this.focusNode(id, w, ms); this.follow = f; }
    fit(ms) {
      const a = this.aspect();
      const w = Math.max(FIT.w, FIT.h / Math.max(0.2, a));
      this.setCam({ cx: FIT.cx, cy: FIT.cy, w }, ms == null ? 450 : ms);
    }
    zoomBy(f) { this.setCam({ cx: this.cam.cx, cy: this.cam.cy, w: this.cam.w * f }, 200); }
    setFollow(v) { this.follow = v; this.stage.dispatchEvent(new CustomEvent('followchange', { detail: v })); }

    // ---------- パン・ズーム入力 ----------
    toWorld(cx, cy) {
      const r = this.svg.getBoundingClientRect(), c = this.cam, h = c.w * this.aspect();
      return { x: c.cx - c.w / 2 + ((cx - r.left) / r.width) * c.w, y: c.cy - h / 2 + ((cy - r.top) / r.height) * h, u: (cx - r.left) / r.width, v: (cy - r.top) / r.height };
    }
    zoomAt(cx, cy, f) {
      cancelAnimationFrame(this.camAnim);
      const p = this.toWorld(cx, cy), h0 = this.cam.w * this.aspect();
      const nw = clamp(this.cam.w * f, ZOOM_MIN, ZOOM_MAX), nh = nw * this.aspect();
      this.cam = { w: nw, cx: p.x - (p.u - 0.5) * nw, cy: p.y - (p.v - 0.5) * nh };
      void h0;
      this.clampCam(); this.applyCam();
    }
    _bindInput() {
      const pts = new Map();
      let down = null, moved = 0, pinch0 = null;
      const svg = this.svg;
      svg.addEventListener('pointerdown', (e) => {
        svg.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, target: e.target }; moved = 0; }
        if (pts.size === 2) { const [a, b] = Array.from(pts.values()); pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), w: this.cam.w }; }
      });
      svg.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) {
          const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          moved += Math.abs(dx) + Math.abs(dy);
          if (moved > 6) {
            cancelAnimationFrame(this.camAnim);
            const r = svg.getBoundingClientRect(), k = this.cam.w / r.width;
            this.cam.cx -= dx * k; this.cam.cy -= dy * k;
            this.clampCam(); this.applyCam();
            if (this.follow) this.setFollow(false);
          }
        } else if (pts.size === 2 && pinch0) {
          const [a, b] = Array.from(pts.values());
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 0) {
            const target = clamp(pinch0.w * (pinch0.d / d), ZOOM_MIN, ZOOM_MAX);
            this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / this.cam.w);
            moved += 10;
            if (this.follow) this.setFollow(false);
          }
        }
      });
      const end = (e) => {
        const wasOne = pts.size === 1;
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch0 = null;
        if (wasOne && down && moved <= 6 && e.type === 'pointerup' && down.target && down.target.closest) {
          // 指/マウスが動かなかった = タップ。ポインタをキャプチャしているので click ではなくここで判定する
          const pk = down.target.closest('.pick');
          const st = down.target.closest('.st');
          if (pk && this._pick) this.resolvePick(pk.getAttribute('data-id'));
          else if (st && this.onStationTap) this.onStationTap(st.getAttribute('data-id'));
        }
        if (!pts.size) down = null;
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0014));
        if (this.follow) this.setFollow(false);
      }, { passive: false });
    }
  }

  Object.assign(A, { MapView });
})(typeof globalThis !== 'undefined' ? globalThis : this);
