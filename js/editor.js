/* あいち電鉄 — エディター（マップ / 物件）
 * 保存先はブラウザの localStorage（js/overrides.js が起動時に読みこむ）。保存したあと、ゲームに反映するには「ゲームにもどる」で読みこみ直す。
 * ひとつの作業コピー W（位置・路線・物件・駅の名前と説明・足した駅）を、マップと物件の両方のタブで編集し、「保存」でまとめて書きこむ。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const UI = A.UI, Art = A.Art, h = UI.h, $ = UI.$, esc = UI.esc;
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); return e; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const G = A.GRID;

  const KINDS = [
    ['rail', '線路', {}], ['sea', '海路', { sea: true }],
  ];
  const KIND_NAME = {}; KINDS.forEach((k) => { KIND_NAME[k[0]] = k[1]; });
  const ICONS = { castle: 'お城', shrine: '神社・お寺', food: '食べもの', factory: '工場', pottery: '焼きもの', mountain: '山', sea: '海', park: '公園', onsen: '温泉', museum: '博物館・町並み', farm: '農産物', train: '鉄道', tower: 'タワー・ビル', airport: '空港', festival: 'お祭り', fish: '魚', bird: '鳥', leaf: '花・紅葉', craft: '工芸', card: 'カード' };

  const ed = { tab: 'map', W: null, dirty: false, sel: null, undo: [], redo: [], mode: 'move', kind: 'rail', pick: null, search: '' };

  // ---------- 作業コピー ----------
  function loadWork() {
    const o = A.Overrides.load();
    const pos = {};
    A.STATIONS.forEach((s) => { pos[s.id] = [s.x, s.y]; });
    const edges = (o.edges && o.edges.length ? o.edges : A.EDGES).map((e) => [e[0], e[1], clone(e[2] || { kinds: ['rail'] })]);
    const props = {};
    A.STATIONS.forEach((s) => { props[s.id] = (o.props && o.props[s.id] ? o.props[s.id] : s.props.map((p) => [p.name, p.icon, p.price, p.fame])).map((r) => r.slice()); });
    return { pos, edges, props, squares: clone(o.squares || {}), meta: clone(o.meta || {}), extra: clone(o.extra || []), propsTouched: Object.assign({}, ...Object.keys(o.props || {}).map((k) => ({ [k]: true }))) };
  }
  const stationDef = (id) => A.STATIONS.find((s) => s.id === id) || ed.W.extra.find((x) => x.id === id);
  const allIds = () => A.STATIONS.map((s) => s.id).concat(ed.W.extra.filter((x) => !A.STATIONS.some((s) => s.id === x.id)).map((x) => x.id));
  const nameOf = (id) => { const m = ed.W.meta[id]; if (m && m.name) return m.name; const d = stationDef(id); return d ? d.name : id; };
  const regionOf = (id) => { const m = ed.W.meta[id]; if (m && m.region) return m.region; const d = stationDef(id); return d ? d.region : 'owari'; };
  const descOf = (id) => { const m = ed.W.meta[id]; if (m && m.desc != null) return m.desc; const d = stationDef(id); return d ? d.desc : ''; };
  const setMeta = (id, k, v) => { ed.W.meta[id] = Object.assign({}, ed.W.meta[id], { [k]: v }); markDirty(); };
  function markDirty() { ed.dirty = true; const b = $('#ed-save'); if (b) b.classList.add('is-dirty'); }
  function snapshot() { return JSON.stringify({ pos: ed.W.pos, edges: ed.W.edges, extra: ed.W.extra, props: ed.W.props, meta: ed.W.meta, squares: ed.W.squares }); }
  function pushUndo() { ed.undo.push(snapshot()); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = []; }
  function restore(json) { const o = JSON.parse(json); Object.assign(ed.W, o); if (ed.sel && !allIds().includes(ed.sel)) ed.sel = null; markDirty(); }

  function open(tab) {
    ed.W = loadWork();
    ed.tab = tab || ed.tab || 'map';
    ed.dirty = false; ed.undo = []; ed.redo = []; ed.pick = null;
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-editor'; });
    document.body.dataset.screen = 'editor';
    render();
  }

  // ---------- 検査 ----------
  function problems() {
    const W = ed.W, out = { lost: [], close: [], noProp: [], dupName: [] };
    const ids = allIds();
    const adj = {}; ids.forEach((i) => { adj[i] = []; });
    W.edges.forEach((e) => { if (adj[e[0]] && adj[e[1]]) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); } });
    const seen = new Set(['nagoya']), q = ['nagoya'];
    for (let i = 0; i < q.length; i++) adj[q[i]].forEach((n) => { if (!seen.has(n)) { seen.add(n); q.push(n); } });
    out.lost = ids.filter((i) => !seen.has(i));
    const cell = (id) => [Math.round(W.pos[id][0] / G), Math.round(W.pos[id][1] / G)];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = cell(ids[i]), b = cell(ids[j]);
      if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) < 3) out.close.push([ids[i], ids[j]]);
    }
    ids.forEach((i) => { if (!W.props[i] || !W.props[i].length) out.noProp.push(i); });
    const names = {};
    ids.forEach((i) => (W.props[i] || []).forEach((r) => { (names[r[0]] = names[r[0]] || []).push(i); }));
    Object.keys(names).forEach((n) => { if (names[n].length > 1) out.dupName.push([n, names[n]]); });
    return out;
  }
  const closeSet = (p) => { const s = new Set(); p.close.forEach(([a, b]) => { s.add(a); s.add(b); }); return s; };

  // ---------- 保存 ----------
  function save() {
    const p = problems();
    if (p.lost.length) { UI.alert('つながっていない駅があります', '名古屋から行けない駅: ' + esc(p.lost.map(nameOf).join('、')) + '<br>線路をつなぎ直してから保存してください。'); return false; }
    if (p.noProp.length) { UI.alert('物件のない駅があります', esc(p.noProp.map(nameOf).join('、')) + '<br>物件を1つ以上入れてください。'); return false; }
    if (p.dupName.length) { UI.alert('物件の名前がかぶっています', esc(p.dupName.map(([n, s]) => '「' + n + '」(' + s.map(nameOf).join('・') + ')').join('、')) + '<br>ちがう名前にしてください。'); return false; }
    const W = ed.W, out = { pos: {}, edges: W.edges, props: {}, meta: W.meta, extra: W.extra, squares: W.squares };
    allIds().forEach((id) => {
      const d = A.STATIONS.find((s) => s.id === id);
      const defPos = d ? d.def : null;
      if (!defPos || W.pos[id][0] !== defPos[0] || W.pos[id][1] !== defPos[1]) out.pos[id] = W.pos[id];
      const orig = d ? d.props.map((q) => [q.name, q.icon, q.price, q.fame]) : [];
      if (JSON.stringify(orig) !== JSON.stringify(W.props[id])) out.props[id] = W.props[id];
    });
    Object.keys(out.meta).forEach((id) => { const m = out.meta[id]; const d = stationDef(id); if (!d || !allIds().includes(id)) { delete out.meta[id]; return; } if ((m.name == null || m.name === d.name) && (m.region == null || m.region === d.region) && (m.desc == null || m.desc === d.desc)) delete out.meta[id]; });
    A.Overrides.save(out);
    ed.dirty = false; const b = $('#ed-save'); if (b) b.classList.remove('is-dirty');
    return true;
  }

  async function back() {
    if (ed.dirty) {
      const r = await UI.confirm('保存していない変更があります', '保存してからゲームにもどりますか?', '保存してもどる', '保存しないでもどる');
      if (r) { if (!save()) return; }
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
  //  マップエディター
  // ======================================================================
  function mapEditor(body) {
    const W = ed.W;
    const stage = h('div.ed-stage');
    const svg = sv('svg', { class: 'ed-map', preserveAspectRatio: 'xMidYMid meet' });
    stage.appendChild(svg);
    const msg = h('p.ed-msg');
    const bar = h('div.ed-bar');
    const side = h('aside.ed-side');
    const status = h('div.ed-status');
    body.append(bar, msg, h('div.ed-split', stage, side));
    body.parentElement.classList.add('ed-has-split');

    const kindDef = () => KINDS.find((k) => k[0] === ed.kind);
    function setMsg() {
      msg.textContent = ed.mode === 'square' ? '色をえらんで、マスをタッチ（なぞってもぬれます）。ぬったマスはゲームでも固定され、盤面を作り直しても変わりません。いま: ' + counts() : ed.mode === 'move'
        ? '下に敷いた道は、いまのゲームの盤面です。駅をドラッグするとマスにそろって動き、変えた道は橙の線で出ます（保存してゲームにもどると、盤面に引き直されます）。駅をタッチすると右に情報が出ます。何もない所のドラッグで地図が動きます。'
        : (ed.pick ? '「' + nameOf(ed.pick) + '」とつなぐ駅をタッチしてください（すでにつながっていれば切れます）。種類: ' + kindDef()[1] : '1つ目の駅をタッチして、つぎに2つ目の駅をタッチします。上の「種類」で、つなぐ道の種類をえらべます。');
    }
    function refreshBar() {
      bar.innerHTML = '';
      const modeBtn = (k, t) => h('button.btn.btn--sm.btn--lav' + (ed.mode === k ? '' : '.btn--outline'), { type: 'button', onclick: () => { ed.mode = k; ed.pick = null; draw(); refreshBar(); setMsg(); } }, t);
      const ksel = h('select', { 'aria-label': '道の種類' });
      KINDS.forEach(([k, t]) => { const o = h('option', { value: k }, t); if (k === ed.kind) o.selected = true; ksel.appendChild(o); });
      ksel.addEventListener('change', () => { ed.kind = ksel.value; setMsg(); });
      const SQ = [['blue', '＋ 青マス'], ['red', '− 赤マス'], ['yellow', 'カード'], ['event', 'イベント']];
      bar.append(modeBtn('move', '駅を動かす'), modeBtn('edge', '道をつなぐ・切る'), modeBtn('square', 'マスをぬる'),
        ed.mode === 'edge' ? h('label.ed-kind', '種類 ', ksel) : null,
        ed.mode === 'square' ? h('div.ed-pal', SQ.map(([k, t]) => h('button.ed-pal-b.pal-' + k + (ed.paint === k ? '.is-on' : ''), { type: 'button', onclick: () => { ed.paint = k; refreshBar(); setMsg(); } }, t))) : null,
        ed.mode === 'square' ? h('button.btn.btn--sm.btn--pear.btn--soft', { type: 'button', onclick: lockAll }, '全マスをいまの種類で固定') : null,
        ed.mode === 'square' ? h('button.btn.btn--sm.btn--outline', { type: 'button', onclick: () => { pushUndo(); W.squares = {}; markDirty(); redraw(); } }, '固定をすべて解除') : null,
        h('button.btn.btn--sm.btn--mint.btn--soft', { type: 'button', onclick: addStation }, '＋ 駅を足す'),
        h('button.btn.btn--sm.btn--outline', { type: 'button', disabled: !ed.undo.length, onclick: () => { ed.redo.push(snapshot()); restore(ed.undo.pop()); redraw(); } }, '↶ もどす'),
        h('button.btn.btn--sm.btn--outline', { type: 'button', disabled: !ed.redo.length, onclick: () => { ed.undo.push(snapshot()); restore(ed.redo.pop()); redraw(); } }, '↷ やりなおす'),
        h('button.btn.btn--sm.btn--ink.btn--outline', { type: 'button', onclick: exportJson }, '書き出し/読みこみ'),
        h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: resetAll }, '初期状態にもどす'));
    }
    const redraw = () => { draw(); refreshBar(); drawSide(); drawStatus(); setMsg(); };

    let gE, gS, view;
    function draw() {
      svg.innerHTML = '';
      const bg = sv('g'); bg.innerHTML = Art.mapBackground();
      gE = sv('g'); gS = sv('g');
      svg.append(bg, gE, gS);
      // 実際のゲーム盤（グリッドに引かれた道とマス）を下に敷く。ここは保存→ゲームにもどると引き直される
      const B = A.Board, gB = sv('g', { class: 'ed-board' });
      ['pref', 'national', 'expressway', 'rail', 'bridge', 'sea'].forEach((kind) => {
        B.links.filter((l) => l.kind === kind).forEach((l) => {
          const d = 'M' + l.pts.map((p) => p[0] + ' ' + p[1]).join('L');
          gB.appendChild(sv('path', { d, class: 'lk lk-' + kind + '-bed' }));
          gB.appendChild(sv('path', { d, class: 'lk lk-' + kind + '-line' }));
        });
      });
      B.nodes.forEach((n) => { if (n.type !== 'station') gB.appendChild(sv('rect', { x: n.x - 7, y: n.y - 7, width: 14, height: 14, rx: 3, class: 'ed-mid' })); });
      svg.insertBefore(gB, gE);
      drawSquares();
      // 変えた道（つなぎ直した・動かした駅の道）と、選んだ駅の道だけを、まっすぐな線で重ねる
      const orig = new Set(A.EDGES.map((e) => (e[0] < e[1] ? e[0] + '|' + e[1] : e[1] + '|' + e[0])));
      const moved = (id) => { const s = A.STATIONS.find((x) => x.id === id); return !s || s.x !== W.pos[id][0] || s.y !== W.pos[id][1]; };
      W.edges.forEach((e, i) => {
        const a = W.pos[e[0]], b = W.pos[e[1]];
        if (!a || !b) return;
        const isSel = ed.sel && (e[0] === ed.sel || e[1] === ed.sel);
        const changed = !orig.has(e[0] < e[1] ? e[0] + '|' + e[1] : e[1] + '|' + e[0]) || moved(e[0]) || moved(e[1]);
        if (!changed && !isSel) return;
        gE.appendChild(sv('line', { class: 'ed-edge ' + (changed ? 'is-changed' : 'is-sel'), x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'data-i': i }));
      });
      const bad = closeSet(problems());
      allIds().forEach((id) => {
        const g = sv('g', { class: 'ed-st' + (ed.pick === id ? ' is-pick' : '') + (ed.sel === id ? ' is-sel' : '') + (bad.has(id) ? ' is-bad' : '') + (!A.STATIONS.some((s) => s.id === id) ? ' is-new' : ''), transform: 'translate(' + W.pos[id][0] + ' ' + W.pos[id][1] + ')', 'data-id': id });
        g.appendChild(sv('rect', { x: -19, y: -19, width: 38, height: 38, rx: 8, class: 'ed-st-box' }));
        const t = sv('text', { y: 36, 'text-anchor': 'middle', class: 'ed-st-name' }); t.textContent = nameOf(id);
        g.append(t);
        bindStation(g, id);
        gS.appendChild(g);
      });
    }
    function moveLines(id) {
      gE.querySelectorAll('line').forEach((ln) => {
        const e = W.edges[Number(ln.getAttribute('data-i'))];
        if (e[0] !== id && e[1] !== id) return;
        ln.setAttribute('x1', W.pos[e[0]][0]); ln.setAttribute('y1', W.pos[e[0]][1]); ln.setAttribute('x2', W.pos[e[1]][0]); ln.setAttribute('y2', W.pos[e[1]][1]);
      });
    }
    function bindStation(g, id) {
      let drag = null;
      g.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        g.setPointerCapture(ev.pointerId);
        drag = { moved: false, sx: ev.clientX, sy: ev.clientY, before: snapshot() };
      });
      g.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 5) drag.moved = true;
        if (ed.mode !== 'move' || !drag.moved) return;
        const w = view.toWorld(ev.clientX, ev.clientY);
        W.pos[id] = [Math.round(w.x / G) * G, Math.round(w.y / G) * G]; // マスにそろえる
        g.setAttribute('transform', 'translate(' + W.pos[id][0] + ' ' + W.pos[id][1] + ')');
        moveLines(id);
      });
      g.addEventListener('pointerup', () => {
        const d = drag; drag = null;
        if (!d) return;
        if (d.moved) {
          if (ed.mode === 'move') { ed.undo.push(d.before); ed.redo = []; markDirty(); redraw(); }
          return;
        }
        if (ed.mode === 'move') { ed.sel = id; redraw(); return; }
        if (!ed.pick) { ed.pick = id; ed.sel = id; redraw(); return; }
        if (ed.pick !== id) {
          pushUndo();
          const i = W.edges.findIndex((e) => (e[0] === ed.pick && e[1] === id) || (e[1] === ed.pick && e[0] === id));
          if (i >= 0) W.edges.splice(i, 1);
          else W.edges.push([ed.pick, id, Object.assign({ kinds: [ed.kind] }, kindDef()[2])]);
          markDirty();
        }
        ed.pick = null; redraw();
      });
    }

    ed.paint = ed.paint || 'red';
    const typeOf = (n) => W.squares[n.cx + ',' + n.cy] || n.type;
    const counts = () => { const c = { blue: 0, red: 0, yellow: 0, event: 0 }; A.Board.nodes.forEach((n) => { if (n.type !== 'station') c[typeOf(n)]++; }); return '青' + c.blue + ' 赤' + c.red + ' カード' + c.yellow + ' イベント' + c.event; };
    function drawSquares() {
      const gQ = sv('g', { class: 'ed-squares' + (ed.mode === 'square' ? ' is-active' : '') });
      A.Board.nodes.forEach((n) => {
        if (n.type === 'station') return;
        const t = typeOf(n), key = n.cx + ',' + n.cy;
        const g = sv('g', { class: 'sq sq-' + t + (W.squares[key] ? ' is-fixed' : ''), transform: 'translate(' + n.x + ' ' + n.y + ') scale(' + A.SQUARE_SCALE.toFixed(3) + ')', 'data-key': key });
        g.appendChild(sv('rect', { x: -9.5, y: -9.5, width: 19, height: 19, rx: 3.5, class: 'sq-c' }));
        const gl = t === 'blue' ? 'M-4.5 0h9M0 -4.5v9' : t === 'red' ? 'M-4.5 0h9' : null;
        if (gl) g.appendChild(sv('path', { d: gl, class: 'sq-g' }));
        else if (t === 'yellow') g.appendChild(sv('rect', { x: -3.5, y: -4.6, width: 7, height: 9.2, rx: 1.6, class: 'sq-card' }));
        else { const tx = sv('text', { 'text-anchor': 'middle', y: 4, class: 'ed-star' }); tx.textContent = '★'; g.appendChild(tx); }
        gQ.appendChild(g);
      });
      svg.appendChild(gQ);
      let painting = false, snap = null;
      const paintAt = (cx, cy) => {
        const el = document.elementFromPoint(cx, cy), g = el && el.closest ? el.closest('g.sq') : null;
        if (!g || !gQ.contains(g)) return;
        const key = g.getAttribute('data-key');
        if (W.squares[key] === ed.paint) return;
        W.squares[key] = ed.paint;
        g.setAttribute('class', 'sq sq-' + ed.paint + ' is-fixed');
        g.querySelectorAll('path,text,rect:not(.sq-c)').forEach((x) => x.remove());
        if (ed.paint === 'blue' || ed.paint === 'red') g.appendChild(sv('path', { d: ed.paint === 'blue' ? 'M-4.5 0h9M0 -4.5v9' : 'M-4.5 0h9', class: 'sq-g' }));
        else if (ed.paint === 'yellow') g.appendChild(sv('rect', { x: -3.5, y: -4.6, width: 7, height: 9.2, rx: 1.6, class: 'sq-card' }));
        else { const tx = sv('text', { 'text-anchor': 'middle', y: 4, class: 'ed-star' }); tx.textContent = '★'; g.appendChild(tx); }
      };
      gQ.addEventListener('pointerdown', (ev) => {
        if (ed.mode !== 'square') return;
        ev.stopPropagation(); snap = snapshot(); painting = true; gQ.setPointerCapture(ev.pointerId); paintAt(ev.clientX, ev.clientY);
      });
      gQ.addEventListener('pointermove', (ev) => { if (painting) paintAt(ev.clientX, ev.clientY); });
      const end = () => { if (!painting) return; painting = false; if (snap !== snapshot()) { ed.undo.push(snap); ed.redo = []; markDirty(); } setMsg(); };
      gQ.addEventListener('pointerup', end); gQ.addEventListener('pointercancel', end);
    }
    function lockAll() {
      pushUndo();
      A.Board.nodes.forEach((n) => { if (n.type !== 'station') W.squares[n.cx + ',' + n.cy] = typeOf(n); });
      markDirty(); redraw();
    }

    function addStation() {
      const nameIn = h('input', { type: 'text', maxlength: 12, placeholder: '駅の名前', 'aria-label': '駅の名前' });
      const tmp = { region: 'owari' };
      const rsel = h('select', { 'aria-label': '地域' });
      Object.keys(A.REGION).forEach((k) => rsel.appendChild(h('option', { value: k }, A.REGION[k])));
      const body2 = h('div.ed-add', h('p.hint', '地図の見えている中心に足します。足したあと、ドラッグで好きな場所へ動かし、道をつないで、物件タブで物件を入れてください。'), h('label', '名前', nameIn), h('label', '地域', rsel));
      UI.modal({ title: '駅を足す', body: body2, actions: [{ label: 'やめる', value: false, kind: 'outline', color: 'ink' }, { label: '足す', value: true }] }).promise.then((ok) => {
        if (!ok) return;
        const nm = nameIn.value.trim();
        if (!nm) return;
        pushUndo();
        const id = 'x' + Date.now().toString(36);
        const c = view.cam;
        const near = A.STATIONS.reduce((b, s) => (!b || Math.hypot(s.x - c.cx, s.y - c.cy) < Math.hypot(b.x - c.cx, b.y - c.cy) ? s : b), null);
        W.extra.push({ id, name: nm, region: rsel.value || tmp.region, lon: near.lon + 0.01, lat: near.lat + 0.01, desc: nm + 'は、愛知県にあるまちです。' });
        W.pos[id] = [Math.round(c.cx / G) * G, Math.round(c.cy / G) * G];
        W.props[id] = [[nm + 'の名物', 'park', 1000, 2]];
        W.meta[id] = { region: rsel.value };
        ed.sel = id; markDirty(); redraw();
      });
    }

    function drawStatus() {
      const p = problems();
      status.innerHTML = '';
      const chip = (ok, t) => h('span.chip' + (ok ? '' : '.chip--warn'), (ok ? '✓ ' : '! ') + t);
      status.append(chip(true, '駅 ' + allIds().length), chip(!p.lost.length, p.lost.length ? 'つながっていない駅 ' + p.lost.length : 'すべてつながっています'),
        chip(!p.close.length, p.close.length ? '近すぎる駅 ' + p.close.length + '組（赤い枠）' : '駅の間隔 OK'));
    }

    function drawSide() {
      side.innerHTML = '';
      side.appendChild(status);
      if (!ed.sel || !allIds().includes(ed.sel)) { side.appendChild(h('p.hint', '駅をタッチすると、名前・地域・説明・つながりを直せます。')); return; }
      const id = ed.sel, isNew = !A.STATIONS.some((s) => s.id === id);
      const nm = h('input', { type: 'text', value: nameOf(id), maxlength: 12, 'aria-label': '駅の名前' });
      nm.addEventListener('input', () => { if (nm.value.trim()) { setMeta(id, 'name', nm.value.trim()); const t = gS.querySelector('[data-id="' + id + '"] text'); if (t) t.textContent = nm.value.trim(); } });
      side.append(
        h('h3', nameOf(id) + '駅' + (isNew ? '（足した駅）' : '')),
        h('div.ed-field', h('label', '名前'), nm),
        h('div.ed-field', h('label', '地域'), regionSelect(id, (v) => setMeta(id, 'region', v))),
        descBox(id));
      const conns = h('div.ed-conns');
      const mine = W.edges.map((e, i) => ({ e, i })).filter(({ e }) => e[0] === id || e[1] === id);
      mine.forEach(({ e, i }) => {
        const other = e[0] === id ? e[1] : e[0];
        const k = e[2] && e[2].sea ? 'sea' : e[2] && e[2].bridge ? 'bridge' : ((e[2] && e[2].kinds) || ['rail'])[0];
        conns.appendChild(h('span.ed-conn', h('b', nameOf(other)), h('small', (e[2] && e[2].kinds ? e[2].kinds.map((x) => KIND_NAME[x] || x).join('+') : KIND_NAME[k])),
          h('button.ed-x', { type: 'button', 'aria-label': nameOf(other) + 'との道を切る', onclick: () => { pushUndo(); W.edges.splice(i, 1); markDirty(); redraw(); } }, '×')));
      });
      side.append(h('div.ed-field', h('label', 'つながっている駅（' + mine.length + '）'), mine.length ? conns : h('p.hint', 'まだ道がありません。「道をつなぐ・切る」で他の駅とつないでください。')));
      side.append(h('div.ed-bar',
        h('button.btn.btn--sm.btn--lav', { type: 'button', onclick: () => { ed.tab = 'props'; ed.cur = id; render(); } }, '物件を直す（' + (W.props[id] || []).length + '）'),
        isNew ? h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: () => removeExtra(id) }, 'この駅を消す') : null));
    }
    function removeExtra(id) {
      UI.confirm('駅を消す', nameOf(id) + '駅を消します。', '消す', 'やめる').then((ok) => {
        if (!ok) return;
        pushUndo();
        W.extra = W.extra.filter((x) => x.id !== id); delete W.pos[id]; delete W.props[id]; delete W.meta[id];
        W.edges = W.edges.filter((e) => e[0] !== id && e[1] !== id);
        ed.sel = null; markDirty(); redraw();
      });
    }

    function resetAll() {
      UI.confirm('初期状態にもどす', 'マップ・物件・駅の説明など、エディターで変えた内容をすべて消して、最初の状態にもどします。', 'もどす', 'やめる').then((ok) => {
        if (!ok) return;
        A.Overrides.clear(); location.reload();
      });
    }
    function exportJson() {
      const ta = h('textarea.ed-json', { rows: 8, spellcheck: 'false' });
      save(); ta.value = JSON.stringify(A.Overrides.load());
      const m = UI.modal({ title: '書き出し / 読みこみ', body: h('div', h('p.hint', 'いまの保存内容です。コピーしてバックアップできます。貼りつけて「読みこむ」を押すと、この内容に置きかわります。'), ta), cls: 'modal--wide',
        actions: [{ label: 'とじる', value: false, kind: 'outline', color: 'ink' }, { label: '読みこむ', value: true }] });
      m.promise.then((ok) => {
        if (!ok) return;
        try { const o = JSON.parse(ta.value); if (!o || typeof o !== 'object') throw new Error('x'); A.Overrides.save(o); location.reload(); } catch (e) { UI.alert('読みこめませんでした', '形式がちがうようです。'); }
      });
    }

    view = new A.MapView(svg, stage);
    redraw();
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
          const d = A.STATIONS.find((s) => s.id === id);
          if (!d) return;
          pushUndo(); W.props[id] = d.props.map((p) => [p.name, p.icon, p.price, p.fame]); markDirty(); drawForm(); drawList();
        } }, 'この駅の物件を元にもどす'),
        h('button.btn.btn--sm.btn--lav.btn--outline', { type: 'button', onclick: () => { ed.tab = 'map'; ed.sel = id; render(); } }, '地図で見る')));
    }
    drawList(); drawForm();
  }

  A.Editor = { open };
})(typeof globalThis !== 'undefined' ? globalThis : this);
