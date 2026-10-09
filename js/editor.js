/* あいち電鉄 — エディター（マップ / 物件）
 * マップ: グリッドのマスを、ポチポチ押して（なぞって）作る。となりあうマスは自動で線路がつながる。
 * 保存先はブラウザの localStorage（js/overrides.js が起動時に読みこむ）。「ゲームにもどる」で読みこみ直して反映する。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const UI = A.UI, Art = A.Art, h = UI.h, $ = UI.$, esc = UI.esc;
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); return e; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const G = A.GRID;
  const KEY = (x, y) => x + ',' + y;

  const ICONS = { castle: 'お城', shrine: '神社・お寺', food: '食べもの', factory: '工場', pottery: '焼きもの', mountain: '山', sea: '海', park: '公園', onsen: '温泉', museum: '博物館・町並み', farm: '農産物', train: '鉄道', tower: 'タワー・ビル', airport: '空港', festival: 'お祭り', fish: '魚', bird: '鳥', leaf: '花・紅葉', craft: '工芸', card: 'カード' };
  // 線路のぬり分け（止まるマスの種類と、止まらない「線路だけ」）
  const PAINT = [['b', '青 ＋'], ['r', '赤 −'], ['y', 'カード'], ['e', 'イベント'], ['t', '線路だけ']];
  const CLS = { b: 'blue', r: 'red', y: 'yellow', e: 'event' };

  const ed = { tab: 'map', W: null, dirty: false, undo: [], redo: [], tool: 'rail', paint: 'b', selSt: null, search: '' };

  // ---------- 作業コピー ----------
  const ALL = () => A.ALL_STATIONS || A.STATIONS;
  function loadWork() {
    const o = A.Overrides.load();
    const src = Array.isArray(o.map) && o.map.length ? o.map : A.MAPDATA;
    const map = {};
    src.forEach(([x, y, t, st]) => { map[KEY(x, y)] = t === 'S' ? [x, y, 'S', st] : [x, y, t]; });
    const props = {};
    ALL().forEach((s) => { props[s.id] = (o.props && o.props[s.id] ? o.props[s.id] : s.props.map((p) => [p.name, p.icon, p.price, p.fame])).map((r) => r.slice()); });
    (o.extra || []).forEach((x) => { if (!props[x.id]) props[x.id] = (o.props && o.props[x.id]) || [[x.name + 'の名物', 'park', 1000, 2]]; });
    return { map, props, meta: clone(o.meta || {}), extra: clone(o.extra || []) };
  }
  const stationDef = (id) => ALL().find((s) => s.id === id) || ed.W.extra.find((x) => x.id === id);
  const allIds = () => ALL().map((s) => s.id).concat(ed.W.extra.filter((x) => !ALL().some((s) => s.id === x.id)).map((x) => x.id));
  const nameOf = (id) => { const m = ed.W.meta[id]; if (m && m.name) return m.name; const d = stationDef(id); return d ? d.name : id; };
  const regionOf = (id) => { const m = ed.W.meta[id]; if (m && m.region) return m.region; const d = stationDef(id); return d ? d.region : 'owari'; };
  const descOf = (id) => { const m = ed.W.meta[id]; if (m && m.desc != null) return m.desc; const d = stationDef(id); return d ? d.desc : ''; };
  const setMeta = (id, k, v) => { ed.W.meta[id] = Object.assign({}, ed.W.meta[id], { [k]: v }); markDirty(); };
  const stationCell = (id) => Object.values(ed.W.map).find((c) => c[2] === 'S' && c[3] === id);
  function markDirty() { ed.dirty = true; const b = $('#ed-save'); if (b) b.classList.add('is-dirty'); }
  function snapshot() { return JSON.stringify(ed.W); }
  function pushUndo() { ed.undo.push(snapshot()); if (ed.undo.length > 80) ed.undo.shift(); ed.redo = []; }
  function restore(json) { ed.W = JSON.parse(json); markDirty(); }

  function open(tab) {
    ed.W = loadWork();
    ed.tab = tab || ed.tab || 'map';
    ed.dirty = false; ed.undo = []; ed.redo = []; ed.selSt = null;
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-editor'; });
    document.body.dataset.screen = 'editor';
    render();
  }

  // ---------- 検査 ----------
  function problems() {
    const W = ed.W, cells = Object.values(W.map);
    const placed = new Set(cells.filter((c) => c[2] === 'S').map((c) => c[3]));
    const out = { unplaced: allIds().filter((id) => !placed.has(id)), lost: 0, touch: [], noProp: [], dupName: [] };
    const start = stationCell('nagoya');
    if (start) {
      const seen = new Set([KEY(start[0], start[1])]), q = [start];
      for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i];
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const k = KEY(x + dx, y + dy); if (W.map[k] && !seen.has(k)) { seen.add(k); q.push(W.map[k]); } });
      }
      out.lost = cells.length - seen.size;
    } else out.lost = cells.length;
    cells.forEach((c) => { if (c[2] === 'S' && W.map[KEY(c[0] + 1, c[1])] && W.map[KEY(c[0] + 1, c[1])][2] === 'S') out.touch.push([c[3], W.map[KEY(c[0] + 1, c[1])][3]]); if (c[2] === 'S' && W.map[KEY(c[0], c[1] + 1)] && W.map[KEY(c[0], c[1] + 1)][2] === 'S') out.touch.push([c[3], W.map[KEY(c[0], c[1] + 1)][3]]); });
    placed.forEach((i) => { if (!W.props[i] || !W.props[i].length) out.noProp.push(i); });
    const names = {};
    placed.forEach((i) => (W.props[i] || []).forEach((r) => { (names[r[0]] = names[r[0]] || []).push(i); }));
    Object.keys(names).forEach((n) => { if (names[n].length > 1) out.dupName.push([n, names[n]]); });
    return out;
  }

  // ---------- 保存 ----------
  function save() {
    const p = problems();
    if (!stationCell('nagoya')) { UI.alert('名古屋駅がありません', 'スタートの名古屋駅は、盤面に置いてください。'); return false; }
    if (p.lost) { UI.alert('つながっていないマスがあります', '名古屋から線路でつながっていないマスが ' + p.lost + ' 個あります。消すか、線路でつないでください。'); return false; }
    if (p.noProp.length) { UI.alert('物件のない駅があります', esc(p.noProp.map(nameOf).join('、')) + '<br>物件を1つ以上入れてください。'); return false; }
    if (p.dupName.length) { UI.alert('物件の名前がかぶっています', esc(p.dupName.map(([n, s]) => '「' + n + '」(' + s.map(nameOf).join('・') + ')').join('、')) + '<br>ちがう名前にしてください。'); return false; }
    const W = ed.W;
    const map = Object.values(W.map).sort((u, v) => u[1] - v[1] || u[0] - v[0]);
    const same = JSON.stringify(map) === JSON.stringify(A.MAPDATA.slice().sort((u, v) => u[1] - v[1] || u[0] - v[0]));
    const out = { map: same ? null : map, props: {}, meta: W.meta, extra: W.extra };
    allIds().forEach((id) => {
      const d = ALL().find((s) => s.id === id);
      const orig = d ? d.props.map((q) => [q.name, q.icon, q.price, q.fame]) : [];
      if (JSON.stringify(orig) !== JSON.stringify(W.props[id])) out.props[id] = W.props[id];
    });
    Object.keys(out.meta).forEach((id) => { const m = out.meta[id]; const d = stationDef(id); if (!d) { delete out.meta[id]; return; } if ((m.name == null || m.name === d.name) && (m.region == null || m.region === d.region) && (m.desc == null || m.desc === d.desc)) delete out.meta[id]; });
    A.Overrides.save(out);
    ed.dirty = false; const b = $('#ed-save'); if (b) b.classList.remove('is-dirty');
    return true;
  }

  async function back() {
    if (ed.dirty) {
      const r = await UI.confirm('保存していない変更があります', '保存してからゲームにもどりますか?', '保存してもどる', '保存しないでもどる');
      if (r && !save()) return;
    }
    location.reload(); // 保存した内容を反映するため読みこみ直す
  }

  function render() {
    const scr = $('#screen-editor');
    scr.innerHTML = '';
    const tabBtn = (k, t) => h('button.btn.btn--sm.btn--lav' + (ed.tab === k ? '' : '.btn--outline'), { type: 'button', onclick: () => { ed.tab = k; render(); } }, t);
    scr.appendChild(h('header.ed-head',
      h('button.btn.btn--outline.btn--sm', { type: 'button', onclick: back }, '← ゲームにもどる'),
      h('h2', 'エディター'),
      h('div.ed-tabs', tabBtn('map', 'マップ'), tabBtn('props', '物件')),
      h('button.btn.btn--sm.btn--pear' + (ed.dirty ? '.is-dirty' : ''), { id: 'ed-save', type: 'button', onclick: () => { if (save()) UI.alert('保存しました', '「ゲームにもどる」を押すと、ゲームに反映されます。'); } }, '保存')));
    const body = h('div.ed-body');
    scr.appendChild(body);
    if (ed.tab === 'map') mapEditor(body); else propEditor(body);
  }

  // ---------- 共通の部品 ----------
  const regionSelect = (id, onchange) => {
    const sel = h('select', { 'aria-label': '地域' });
    Object.keys(A.REGION).forEach((k) => { const o = h('option', { value: k }, A.REGION[k]); if (k === regionOf(id)) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => onchange(sel.value));
    return sel;
  };
  const descBox = (id) => {
    const ta = h('textarea.ed-desc', { rows: 5, maxlength: 400, 'aria-label': '駅の説明' });
    ta.value = descOf(id);
    const cnt = h('small.ed-count', ta.value.length + '/400');
    ta.addEventListener('input', () => { setMeta(id, 'desc', ta.value); cnt.textContent = ta.value.length + '/400'; });
    return h('div.ed-field', h('label', '説明（購入画面や駅の情報に出ます）'), ta, cnt);
  };

  // ======================================================================
  //  マップエディター（マスをポチポチ押して作る）
  // ======================================================================
  function mapEditor(body) {
    const stage = h('div.ed-stage');
    const svg = sv('svg', { class: 'ed-map', preserveAspectRatio: 'xMidYMid meet' });
    stage.appendChild(svg);
    const bar = h('div.ed-bar'), pal = h('div.ed-pal'), msg = h('p.ed-msg'), status = h('div.ed-status');
    body.append(bar, pal, msg, stage, status);

    const TOOLS = [['view', '地図を動かす'], ['rail', '線路をおく'], ['station', '駅をおく'], ['erase', '消す']];
    function refreshBar() {
      bar.innerHTML = '';
      TOOLS.forEach(([k, t]) => bar.appendChild(h('button.btn.btn--sm.btn--lav' + (ed.tool === k ? '' : '.btn--outline'), { type: 'button', onclick: () => { ed.tool = k; ed.selSt = null; refreshAll(); } }, t)));
      bar.append(
        h('button.btn.btn--sm.btn--outline', { type: 'button', disabled: !ed.undo.length, onclick: () => { ed.redo.push(snapshot()); restore(ed.undo.pop()); refreshAll(); } }, '↶ もどす'),
        h('button.btn.btn--sm.btn--outline', { type: 'button', disabled: !ed.redo.length, onclick: () => { ed.undo.push(snapshot()); restore(ed.redo.pop()); refreshAll(); } }, '↷ やりなおす'),
        h('button.btn.btn--sm.btn--ink.btn--outline', { type: 'button', onclick: exportJson }, '書き出し/読みこみ'),
        h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: resetAll }, '最初の盤面にもどす'));
      pal.innerHTML = '';
      if (ed.tool === 'rail') PAINT.forEach(([k, t]) => pal.appendChild(h('button.ed-pal-b.pal-' + (CLS[k] || 'track') + (ed.paint === k ? '.is-on' : ''), { type: 'button', onclick: () => { ed.paint = k; refreshBar(); } }, t)));
      if (ed.tool === 'station' && ed.selSt) pal.appendChild(stationPanel(ed.selSt));
    }
    function setMsg() {
      msg.textContent = {
        view: 'ドラッグで地図を動かし、ホイールやピンチで拡大・縮小します。',
        rail: '色をえらんで、マスを押すか、なぞって線路をおきます。となりあうマスは自動でつながります。',
        station: ed.selSt ? '「' + nameOf(ed.selSt) + '」を動かす場所のマスを押してください（駅を押すと別の駅をえらびます）。' : '空いているマスを押すと、そこに置く駅をえらべます。置いてある駅を押すと、その駅をえらんで動かせます。',
        erase: '押した（なぞった）マスを消します。駅を消すと、その駅はゲームに出なくなります（物件は残ります）。',
      }[ed.tool];
    }
    function drawStatus() {
      const p = problems();
      status.innerHTML = '';
      const cells = Object.values(ed.W.map);
      const cnt = { b: 0, r: 0, y: 0, e: 0, t: 0 }; cells.forEach((c) => { if (cnt[c[2]] != null) cnt[c[2]]++; });
      const chip = (ok, t) => h('span.chip' + (ok ? '' : '.chip--warn'), (ok ? '' : '! ') + t);
      status.append(...[chip(true, '駅 ' + cells.filter((c) => c[2] === 'S').length), chip(true, '青 ' + cnt.b), chip(true, '赤 ' + cnt.r), chip(true, 'カード ' + cnt.y), chip(true, 'イベント ' + cnt.e), chip(true, '線路だけ ' + cnt.t),
        chip(!p.lost, p.lost ? 'つながっていないマス ' + p.lost : 'ぜんぶつながっています'),
        p.unplaced.length ? chip(false, '置いていない駅 ' + p.unplaced.length) : null,
        p.touch.length ? chip(false, 'となりあう駅 ' + p.touch.length + '組') : null].filter(Boolean));
    }
    const refreshAll = () => { draw(); refreshBar(); setMsg(); drawStatus(); };

    // ---- 描画 ----
    let gL, gC, hit, view;
    const landC = new Map();
    const inPoly = (x, y) => { let c = false; const P = A.OUTLINE; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const land = (x, y) => { const k = x + ',' + y; if (!landC.has(k)) landC.set(k, inPoly(x, y)); return landC.get(k); };
    function draw() {
      svg.innerHTML = '';
      const bg = sv('g'); bg.innerHTML = Art.mapBackground() + '<defs><pattern id="pEdGrid" x="' + (-G / 2) + '" y="' + (-G / 2) + '" width="' + G + '" height="' + G + '" patternUnits="userSpaceOnUse"><path d="M0 0H' + G + 'M0 0V' + G + '" class="ed-grid"/></pattern></defs>';
      const xs = A.OUTLINE.map((p) => p[0]), ys = A.OUTLINE.map((p) => p[1]);
      const box = [Math.min(...xs) - 200, Math.min(...ys) - 200, Math.max(...xs) + 200, Math.max(...ys) + 200];
      bg.appendChild(sv('rect', { x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1], fill: 'url(#pEdGrid)' }));
      gL = sv('g'); gC = sv('g');
      hit = sv('rect', { x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1], class: 'ed-hit' + (ed.tool === 'view' ? '' : ' is-on') });
      svg.append(bg, gL, gC, hit);
      drawCells();
      bindHit();
    }
    function drawCells() {
      gL.innerHTML = ''; gC.innerHTML = '';
      const W = ed.W;
      Object.values(W.map).forEach(([x, y]) => {
        [[1, 0], [0, 1]].forEach(([dx, dy]) => {
          if (!W.map[KEY(x + dx, y + dy)]) return;
          const x1 = x * G, y1 = y * G, x2 = (x + dx) * G, y2 = (y + dy) * G;
          const k = land((x1 + x2) / 2, (y1 + y2) / 2) ? 'rail' : 'sea';
          gL.appendChild(sv('line', { x1, y1, x2, y2, class: 'lk lk-' + k + '-bed' }));
          gL.appendChild(sv('line', { x1, y1, x2, y2, class: 'lk lk-' + k + '-line' }));
        });
      });
      Object.values(W.map).forEach(([x, y, t, st]) => {
        if (t === 'S') {
          const g = sv('g', { class: 'ed-st' + (ed.selSt === st ? ' is-sel' : ''), transform: 'translate(' + x * G + ' ' + y * G + ')' });
          g.appendChild(sv('rect', { x: -15, y: -15, width: 30, height: 30, rx: 7, class: 'ed-st-box' }));
          const tx = sv('text', { y: 30, 'text-anchor': 'middle', class: 'ed-st-name' }); tx.textContent = nameOf(st);
          g.appendChild(tx);
          gC.appendChild(g);
        } else if (t !== 't') {
          const g = sv('g', { class: 'sq sq-' + CLS[t], transform: 'translate(' + x * G + ' ' + y * G + ') scale(' + A.SQUARE_SCALE.toFixed(3) + ')' });
          g.appendChild(sv('rect', { x: -9.5, y: -9.5, width: 19, height: 19, rx: 3.5, class: 'sq-c' }));
          if (t === 'b' || t === 'r') g.appendChild(sv('path', { d: t === 'b' ? 'M-4.5 0h9M0 -4.5v9' : 'M-4.5 0h9', class: 'sq-g' }));
          else if (t === 'y') g.appendChild(sv('rect', { x: -3.5, y: -4.6, width: 7, height: 9.2, rx: 1.6, class: 'sq-card' }));
          else { const s = sv('text', { 'text-anchor': 'middle', y: 4, class: 'ed-star' }); s.textContent = '★'; g.appendChild(s); }
          gC.appendChild(g);
        }
      });
    }

    // ---- 押す・なぞる ----
    const cellAt = (ev) => { const w = view.toWorld(ev.clientX, ev.clientY); return [Math.round(w.x / G), Math.round(w.y / G)]; };
    function apply(x, y) {
      const W = ed.W, k = KEY(x, y), cur = W.map[k];
      if (ed.tool === 'rail') {
        if (cur && cur[2] === 'S') return false;
        if (cur && cur[2] === ed.paint) return false;
        W.map[k] = [x, y, ed.paint]; return true;
      }
      if (ed.tool === 'erase') { if (!cur) return false; delete W.map[k]; return true; }
      return false;
    }
    function bindHit() {
      let drag = null;
      hit.addEventListener('pointerdown', (ev) => {
        if (ed.tool === 'view') return;
        ev.stopPropagation(); ev.preventDefault();
        hit.setPointerCapture(ev.pointerId);
        const [x, y] = cellAt(ev);
        if (ed.tool === 'station') { stationTap(x, y); return; }
        drag = { last: [x, y], before: snapshot(), changed: apply(x, y) };
        if (drag.changed) drawCells();
      });
      hit.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        let [x, y] = cellAt(ev), [lx, ly] = drag.last;
        if (x === lx && y === ly) return;
        let ch = false;
        while (lx !== x || ly !== y) { // 斜めにとんでも、上下左右のマスでうめる
          if (lx !== x) lx += Math.sign(x - lx); else ly += Math.sign(y - ly);
          ch = apply(lx, ly) || ch;
        }
        drag.last = [x, y];
        if (ch) { drag.changed = true; drawCells(); }
      });
      const end = () => { if (!drag) return; if (drag.changed) { ed.undo.push(drag.before); ed.redo = []; markDirty(); drawStatus(); refreshBar(); } drag = null; };
      hit.addEventListener('pointerup', end); hit.addEventListener('pointercancel', end);
    }
    function stationTap(x, y) {
      const W = ed.W, cur = W.map[KEY(x, y)];
      if (cur && cur[2] === 'S') { ed.selSt = ed.selSt === cur[3] ? null : cur[3]; refreshAll(); return; }
      if (ed.selSt) { placeStation(ed.selSt, x, y); return; }
      pickStation((id) => placeStation(id, x, y));
    }
    function placeStation(id, x, y) {
      pushUndo();
      const W = ed.W, old = stationCell(id);
      if (old) W.map[KEY(old[0], old[1])] = [old[0], old[1], 'b']; // もとの場所は青マスにする（いらなければ消す）
      W.map[KEY(x, y)] = [x, y, 'S', id];
      ed.selSt = id; markDirty(); refreshAll();
    }
    function pickStation(done) {
      const p = problems(), placed = new Set(Object.values(ed.W.map).filter((c) => c[2] === 'S').map((c) => c[3]));
      const q = h('input.ed-search', { type: 'search', placeholder: '駅の名前でさがす', 'aria-label': '駅の名前でさがす' });
      const list = h('div.ed-pick');
      const nameIn = h('input', { type: 'text', maxlength: 12, placeholder: '新しい駅の名前', 'aria-label': '新しい駅の名前' });
      let m = null;
      const choose = (id) => { m.close(true); done(id); };
      const fill = () => {
        list.innerHTML = '';
        const ids = p.unplaced.concat(allIds().filter((i) => placed.has(i))).filter((i) => !q.value.trim() || nameOf(i).includes(q.value.trim()));
        ids.forEach((i) => list.appendChild(h('button.ed-pick-b' + (placed.has(i) ? '' : '.is-new'), { type: 'button', onclick: () => choose(i) }, nameOf(i), h('small', placed.has(i) ? 'ここへ動かす' : '未配置'))));
      };
      q.addEventListener('input', fill); fill();
      const addNew = h('button.btn.btn--sm.btn--mint', { type: 'button', onclick: () => {
        const nm = nameIn.value.trim(); if (!nm) return;
        const id = 'x' + Date.now().toString(36);
        ed.W.extra.push({ id, name: nm, region: 'owari', lon: 136.9, lat: 35.1, desc: nm + 'は、愛知県にあるまちです。' });
        ed.W.props[id] = [[nm + 'の名物', 'park', 1000, 2]];
        choose(id);
      } }, '作って置く');
      m = UI.modal({ title: 'ここに置く駅', body: h('div.ed-add', q, list, h('div.ed-newst', nameIn, addNew)), cls: 'modal--wide', actions: [{ label: 'やめる', value: false, kind: 'outline', color: 'ink' }] });
    }
    function stationPanel(id) {
      const nm = h('input', { type: 'text', value: nameOf(id), maxlength: 12, 'aria-label': '駅の名前' });
      nm.addEventListener('change', () => { if (nm.value.trim()) { setMeta(id, 'name', nm.value.trim()); drawCells(); } });
      return h('div.ed-stpanel',
        h('label', '名前 ', nm),
        h('label', '地域 ', regionSelect(id, (v) => setMeta(id, 'region', v))),
        h('button.btn.btn--sm.btn--lav', { type: 'button', onclick: () => { ed.tab = 'props'; ed.cur = id; render(); } }, '説明・物件を直す'),
        h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: () => { const c = stationCell(id); if (!c) return; pushUndo(); ed.W.map[KEY(c[0], c[1])] = [c[0], c[1], 'b']; ed.selSt = null; markDirty(); refreshAll(); } }, '盤面から外す'));
    }

    function resetAll() {
      UI.confirm('最初の盤面にもどす', '盤面を最初の状態にもどします（物件や説明の変更は残ります）。', 'もどす', 'やめる').then((ok) => {
        if (!ok) return;
        pushUndo();
        ed.W.map = {}; A.MAPDATA.forEach(([x, y, t, st]) => { ed.W.map[KEY(x, y)] = t === 'S' ? [x, y, 'S', st] : [x, y, t]; });
        markDirty(); refreshAll();
      });
    }
    function exportJson() {
      if (!save()) return;
      const ta = h('textarea.ed-json', { rows: 8, spellcheck: 'false' });
      ta.value = JSON.stringify(A.Overrides.load());
      UI.modal({ title: '書き出し / 読みこみ', body: h('div', h('p.hint', 'いまの保存内容です。コピーしてバックアップできます。貼りつけて「読みこむ」を押すと、この内容に置きかわります。'), ta), cls: 'modal--wide',
        actions: [{ label: 'とじる', value: false, kind: 'outline', color: 'ink' }, { label: '読みこむ', value: true }] }).promise.then((ok) => {
        if (!ok) return;
        try { const o = JSON.parse(ta.value); if (!o || typeof o !== 'object') throw new Error('x'); A.Overrides.save(o); location.reload(); } catch (e) { UI.alert('読みこめませんでした', '形式がちがうようです。'); }
      });
    }

    view = new A.MapView(svg, stage);
    refreshAll();
    view.fit(0);
  }

  // ======================================================================
  //  物件エディター
  // ======================================================================
  function propEditor(body) {
    const W = ed.W;
    if (!ed.cur || !allIds().includes(ed.cur)) ed.cur = allIds()[0];
    const list = h('div.ed-list');
    const form = h('div.ed-form');
    const search = h('input.ed-search', { type: 'search', placeholder: '駅や物件をさがす', value: ed.search, 'aria-label': '駅や物件をさがす' });
    const listWrap = h('div.ed-listwrap', search, list);
    body.append(listWrap, form);

    const matchStation = (id) => {
      const q = ed.search.trim();
      if (!q) return true;
      return nameOf(id).includes(q) || (W.props[id] || []).some((r) => String(r[0]).includes(q));
    };
    function drawList() {
      list.innerHTML = '';
      Object.keys(A.REGION).forEach((rg) => {
        const ids = allIds().filter((id) => regionOf(id) === rg && matchStation(id));
        if (!ids.length) return;
        list.appendChild(h('h4', A.REGION[rg] + '（' + ids.length + '）'));
        ids.forEach((id) => {
          const n = (W.props[id] || []).length;
          list.appendChild(h('button.ed-st-btn' + (id === ed.cur ? '.is-on' : ''), { type: 'button', onclick: () => { ed.cur = id; drawList(); drawForm(); } },
            nameOf(id), h('small', n + '件'), n < 5 ? h('em.tag', '少') : null));
        });
      });
    }
    search.addEventListener('input', () => { ed.search = search.value; drawList(); });

    function drawForm() {
      form.innerHTML = '';
      const id = ed.cur, rows = W.props[id];
      form.appendChild(h('h3', nameOf(id) + '駅'));
      form.appendChild(descBox(id));
      form.appendChild(h('h4', '物件'));
      form.appendChild(h('p.hint', '価格は万円。ゲームでは安い順にならびます。利回りは価格と名物度で自動に決まります（10%以上は5%刻み）。名前は全駅でかぶらないようにしてください。'));
      const table = h('div.ed-rows');
      const total = h('p.ed-total');
      const sum = () => { total.textContent = '合計 ' + A.Logic.fmt(rows.reduce((a, r) => a + (Number(r[2]) || 0), 0)) + ' ・ ' + rows.length + '件' + (rows.length < 5 ? '（5件未満）' : ''); };
      const dupes = () => { const all = {}; allIds().forEach((i) => (W.props[i] || []).forEach((r) => { all[r[0]] = (all[r[0]] || 0) + 1; })); return all; };
      const draw = () => {
        table.innerHTML = '';
        const dp = dupes();
        rows.forEach((r, i) => {
          const ico = h('span.ed-ico', { html: Art.icon(r[1], 26) });
          const sel = h('select', { 'aria-label': 'アイコン' });
          Object.keys(ICONS).forEach((k) => { const o = h('option', { value: k }, ICONS[k]); if (k === r[1]) o.selected = true; sel.appendChild(o); });
          sel.addEventListener('change', () => { r[1] = sel.value; ico.innerHTML = Art.icon(r[1], 26); markDirty(); });
          const nm = h('input', { type: 'text', value: r[0], maxlength: 20, 'aria-label': '名前' });
          const warn = h('small.ed-warn');
          nm.addEventListener('input', () => { r[0] = nm.value; markDirty(); const d2 = dupes(); warn.textContent = d2[nm.value] > 1 ? 'この名前は、ほかにもあります' : ''; });
          warn.textContent = dp[r[0]] > 1 ? 'この名前は、ほかにもあります' : '';
          const pr = h('input', { type: 'number', min: 100, step: 100, value: r[2], 'aria-label': '価格(万円)' });
          const info = h('span.ed-rate');
          const fm = h('select', { 'aria-label': '名物度' });
          [[1, 'ふつう'], [2, '名物'], [3, '超名物']].forEach(([v, t]) => { const o = h('option', { value: v }, t); if (Number(r[3]) === v) o.selected = true; fm.appendChild(o); });
          const upd = () => { const price = Number(pr.value) || 0, rate = A.rateFor(price, Number(fm.value)); info.textContent = '利回り ' + rate + '% ・ 価格 ' + A.Logic.fmt(price) + ' ・ 年収 ' + A.Logic.fmt(Math.round(price * rate / 100)); sum(); };
          pr.addEventListener('input', () => { r[2] = Number(pr.value) || 0; markDirty(); upd(); });
          fm.addEventListener('change', () => { r[3] = Number(fm.value); markDirty(); upd(); });
          upd();
          const del = h('button.btn.btn--coral.btn--soft.btn--sm', { type: 'button', onclick: () => { pushUndo(); rows.splice(i, 1); markDirty(); draw(); drawList(); } }, '消す');
          table.appendChild(h('div.ed-row', ico, h('div.ed-name', nm, warn), sel, pr, fm, del, info));
        });
        sum();
      };
      draw();
      form.append(table, total);
      form.appendChild(h('div.ed-bar',
        h('button.btn.btn--sm.btn--mint.btn--soft', { type: 'button', onclick: () => { pushUndo(); rows.push(['新しい物件', 'park', 1000, 2]); markDirty(); draw(); drawList(); } }, '＋ 物件をふやす'),
        h('button.btn.btn--sm.btn--ink.btn--outline', { type: 'button', onclick: () => {
          const d = ALL().find((s) => s.id === id);
          if (!d) return;
          pushUndo(); W.props[id] = d.props.map((p) => [p.name, p.icon, p.price, p.fame]); markDirty(); drawForm(); drawList();
        } }, 'この駅の物件を元にもどす'),
        h('button.btn.btn--sm.btn--lav.btn--outline', { type: 'button', onclick: () => { ed.tab = 'map'; ed.tool = 'station'; ed.selSt = id; render(); } }, '地図で見る')));
    }
    drawList(); drawForm();
  }

  A.Editor = { open };
})(typeof globalThis !== 'undefined' ? globalThis : this);
