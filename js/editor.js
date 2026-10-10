/* あいち電鉄 — エディター（マップ / 物件）
 * マップ: 駅編集（駅の追加・移動・削除）と線路編集（線路の追加・削除）の2つのモード。どちらもマスをタップして直す。
 *   ドラッグは地図の移動、ホイール／ピンチは拡大・縮小だけに使う。となりあうマスは自動で線路がつながる。
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
  const EDIT_MAP_KEY = A.EDIT_MAP_KEY; // 縮尺のちがうマップをエディターで開くとき、読みこみ直しのあいだ覚えておく（data.js が読む）
  const ALL = () => A.ALL_STATIONS || A.STATIONS;
  // マップの一覧（用意されたもの＋自作。自作は保存のたびに変わるので、毎回 localStorage から読む）
  function mapsNow() {
    const own = A.Overrides.load().maps || {};
    return (A.MAPPRESETS || []).map((m) => Object.assign({ builtin: true }, m))
      .concat(Object.keys(own).filter((id) => own[id] && Array.isArray(own[id].cells)).map((id) => ({ id, name: own[id].name || '自作マップ', start: own[id].start || 'nagoya', scale: +own[id].scale || 1, cells: own[id].cells, builtin: false })));
  }
  const mapById = (id) => mapsNow().find((m) => m.id === id) || mapsNow()[0];
  function loadWork(mapId) {
    const o = A.Overrides.load();
    const M = mapById(mapId);
    ed.mapId = M.id;
    const map = {};
    M.cells.forEach(([x, y, t, st]) => { map[KEY(x, y)] = t === 'S' ? [x, y, 'S', st] : [x, y, t]; });
    const props = {};
    ALL().forEach((s) => { props[s.id] = (o.props && o.props[s.id] ? o.props[s.id] : s.props.map((p) => [p.name, p.icon, p.price, p.fame])).map((r) => r.slice()); });
    (o.extra || []).forEach((x) => { if (!props[x.id]) props[x.id] = (o.props && o.props[x.id]) || [[x.name + 'の名物', 'park', 1000, 2]]; });
    return { map, mapName: M.name, start: M.start, builtin: !!M.builtin, props, meta: clone(o.meta || {}), extra: clone(o.extra || []) };
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
    ed.W = loadWork(ed.mapId || (A.MAP_INFO && A.MAP_INFO.id));
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
    const start = stationCell(W.start);
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
    if (!stationCell(ed.W.start)) { UI.alert('スタートの駅がありません', 'スタートの' + esc(nameOf(ed.W.start)) + '駅を盤面に置くか、「スタート」で別の駅をえらんでください。'); return false; }
    if (p.lost) { UI.alert('つながっていないマスがあります', 'スタートの駅から線路でつながっていないマスが ' + p.lost + ' 個あります。消すか、線路でつないでください。'); return false; }
    if (p.noProp.length) { UI.alert('物件のない駅があります', esc(p.noProp.map(nameOf).join('、')) + '<br>物件を1つ以上入れてください。'); return false; }
    if (p.dupName.length) { UI.alert('物件の名前がかぶっています', esc(p.dupName.map(([n, s]) => '「' + n + '」(' + s.map(nameOf).join('・') + ')').join('、')) + '<br>ちがう名前にしてください。'); return false; }
    const W = ed.W;
    const map = Object.values(W.map).sort((u, v) => u[1] - v[1] || u[0] - v[0]);
    const out = Object.assign(A.Overrides.load(), { props: {}, meta: W.meta, extra: W.extra });
    delete out.map;
    out.maps = out.maps || {};
    const base = mapById(ed.mapId);
    const changed = JSON.stringify(map) !== JSON.stringify(base.cells.slice().sort((u, v) => u[1] - v[1] || u[0] - v[0])) || W.start !== base.start || W.mapName !== base.name;
    if (W.builtin && changed) {
      // 用意されたマップは書きかえず、自作マップとして別に保存する
      ed.mapId = 'my' + Date.now().toString(36);
      if (W.mapName === base.name) W.mapName = base.name + '（改）';
      W.builtin = false;
    }
    if (!W.builtin) out.maps[ed.mapId] = { name: W.mapName, start: W.start, cells: map, scale: base.scale || 1 };
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
    try { root.sessionStorage.removeItem(EDIT_MAP_KEY); } catch (e) { /* 無視 */ }
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
      h('button.btn.btn--sm.btn--pear' + (ed.dirty ? '.is-dirty' : ''), { id: 'ed-save', type: 'button', onclick: () => { if (save()) UI.alert('保存しました', '「' + esc(ed.W.mapName) + '」と物件を保存しました。「ゲームにもどる」を押すと、ゲームに反映されます。').then(() => render()); } }, '保存')));
    const body = h('div.ed-body');
    scr.appendChild(body);
    if (ed.tab === 'map') { body.appendChild(mapSlotBar()); mapEditor(body); } else propEditor(body);
  }

  // ---------- マップのえらび・コピー・名前・スタート ----------
  function switchMap(id) {
    // 縮尺のちがうマップは、駅の位置や県の形の大きさが変わるので、そのマップで読みこみ直してエディターを開きなおす
    const reload = (mapById(id).scale || 1) !== ((A.MAP_INFO && A.MAP_INFO.scale) || 1);
    const go = reload ? () => { try { root.sessionStorage.setItem(EDIT_MAP_KEY, mapById(id).id); } catch (e) { /* 無視 */ } location.reload(); } : () => { ed.W = Object.assign(loadWork(id), { props: ed.W.props, meta: ed.W.meta, extra: ed.W.extra }); ed.undo = []; ed.redo = []; ed.selSt = null; render(); };
    if (ed.dirty) UI.confirm('保存していない変更があります', '保存しないで、別のマップに切りかえますか?', '切りかえる', 'やめる').then((ok) => { if (ok) { ed.dirty = false; go(); } });
    else go();
  }
  function mapSlotBar() {
    const W = ed.W;
    const sel = h('select', { 'aria-label': '編集するマップ' });
    mapsNow().forEach((m) => { const o = h('option', { value: m.id }, m.name + (m.builtin ? '（用意されたマップ）' : '（自作）')); if (m.id === ed.mapId) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => switchMap(sel.value));
    const placed = Object.values(W.map).filter((c) => c[2] === 'S').map((c) => c[3]);
    const st = h('select', { 'aria-label': 'スタートの駅' });
    placed.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ja')).forEach((id) => { const o = h('option', { value: id }, nameOf(id)); if (id === W.start) o.selected = true; st.appendChild(o); });
    st.addEventListener('change', () => { pushUndo(); W.start = st.value; markDirty(); });
    const playing = A.Overrides.load().mapId ? A.Overrides.load().mapId === ed.mapId : ed.mapId === 'full';
    return h('div.ed-slots',
      h('label', 'マップ ', sel),
      h('label', 'スタート ', st),
      h('button.btn.btn--sm.btn--mint.btn--soft', { type: 'button', onclick: copyMap }, 'コピーして新しく作る'),
      W.builtin ? null : h('button.btn.btn--sm.btn--outline', { type: 'button', onclick: renameMap }, '名前を変える'),
      W.builtin ? null : h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: deleteMap }, 'このマップを消す'),
      h('button.btn.btn--sm.btn--pear' + (playing ? '.btn--outline' : ''), { type: 'button', disabled: playing, onclick: playMap }, playing ? 'いま遊ぶマップ' : 'このマップで遊ぶ'),
      W.builtin ? h('small.hint', '用意されたマップは書きかわりません。変えて保存すると「（改）」の自作マップとして別に保存されます。') : null);
  }
  function askName(title, init) {
    const inp = h('input', { type: 'text', maxlength: 20, value: init, 'aria-label': 'マップの名前' });
    return UI.modal({ title, body: h('div.ed-add', h('label', '名前', inp)), actions: [{ label: 'やめる', value: false, kind: 'outline', color: 'ink' }, { label: 'OK', value: true }] }).promise.then((ok) => (ok && inp.value.trim() ? inp.value.trim() : null));
  }
  function copyMap() {
    askName('コピーして新しいマップを作る', ed.W.mapName + 'のコピー').then((nm) => {
      if (!nm) return;
      const o = A.Overrides.load(); o.maps = o.maps || {};
      const id = 'my' + Date.now().toString(36);
      o.maps[id] = { name: nm, start: ed.W.start, cells: Object.values(ed.W.map), scale: mapById(ed.mapId).scale || 1 };
      A.Overrides.save(o);
      ed.dirty = false; switchMap(id);
    });
  }
  function renameMap() { askName('名前を変える', ed.W.mapName).then((nm) => { if (!nm) return; ed.W.mapName = nm; markDirty(); render(); }); }
  function deleteMap() {
    UI.confirm('マップを消す', '「' + esc(ed.W.mapName) + '」を消します。元にはもどせません。', '消す', 'やめる').then((ok) => {
      if (!ok) return;
      const o = A.Overrides.load(); if (o.maps) delete o.maps[ed.mapId]; if (o.mapId === ed.mapId) o.mapId = 'full'; A.Overrides.save(o);
      ed.dirty = false; switchMap('full');
    });
  }
  function playMap() {
    if (ed.dirty && !save()) return;
    const o = A.Overrides.load(); o.mapId = ed.mapId; A.Overrides.save(o);
    UI.alert('このマップで遊びます', '「' + esc(ed.W.mapName) + '」をえらびました。「ゲームにもどる」で反映されます。').then(() => render());
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

    // ドラッグ＝地図を動かす、ホイール／ピンチ＝拡大・縮小はどちらのモードでも同じ。編集はタップだけで行う
    const TOOLS = [['station', '駅編集'], ['rail', '線路編集']];
    if (!TOOLS.some(([k]) => k === ed.tool)) ed.tool = 'station';
    function refreshBar() {
      bar.innerHTML = '';
      TOOLS.forEach(([k, t]) => bar.appendChild(h('button.btn.btn--sm.btn--lav' + (ed.tool === k ? '' : '.btn--outline'), { type: 'button', onclick: () => { ed.tool = k; ed.selSt = null; refreshAll(); } }, t)));
      bar.append(
        h('button.btn.btn--sm.btn--outline', { type: 'button', disabled: !ed.undo.length, onclick: () => { ed.redo.push(snapshot()); restore(ed.undo.pop()); refreshAll(); } }, '↶ もどす'),
        h('button.btn.btn--sm.btn--outline', { type: 'button', disabled: !ed.redo.length, onclick: () => { ed.undo.push(snapshot()); restore(ed.redo.pop()); refreshAll(); } }, '↷ やりなおす'),
        h('button.btn.btn--sm.btn--ink.btn--outline', { type: 'button', onclick: exportJson }, '書き出し/読みこみ'),
        h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: resetAll }, '保存した状態にもどす'));
      pal.innerHTML = '';
      if (ed.tool === 'rail') PAINT.forEach(([k, t]) => pal.appendChild(h('button.ed-pal-b.pal-' + (CLS[k] || 'track') + (ed.paint === k ? '.is-on' : ''), { type: 'button', onclick: () => { ed.paint = k; refreshBar(); } }, t)));
      if (ed.tool === 'station' && ed.selSt) pal.appendChild(stationPanel(ed.selSt));
    }
    function setMsg() {
      msg.textContent = {
        rail: '空いているマスを押すと、えらんだ色の線路をおきます。線路を押すと消えます（ちがう色をえらんでいるときは、その色にぬりかえます）。となりあうマスは自動でつながります。',
        station: ed.selSt ? '「' + nameOf(ed.selSt) + '」をえらんでいます。動かしたい場所のマスを押すと、そこへ動きます（もう一度その駅を押すと、えらぶのをやめます）。' : '空いているマスや線路を押すと、駅を追加できます。置いてある駅を押すと、その駅をえらんで動かしたり消したりできます。',
      }[ed.tool] + '（ドラッグで地図を動かし、ホイールやピンチで拡大・縮小）';
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
    let gL, gC, view;
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
      svg.append(bg, gL, gC);
      drawCells();
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

    // ---- タップ（ドラッグ・ピンチは MapView が地図の移動・拡大に使う） ----
    function onTap(cx, cy) {
      const w = view.toWorld(cx, cy), x = Math.round(w.x / G), y = Math.round(w.y / G);
      if (ed.tool === 'station') stationTap(x, y);
      else railTap(x, y);
    }
    function railTap(x, y) {
      const W = ed.W, k = KEY(x, y), cur = W.map[k];
      if (cur && cur[2] === 'S') return; // 駅は駅編集で
      pushUndo();
      if (!cur) W.map[k] = [x, y, ed.paint];
      else if (cur[2] === ed.paint) delete W.map[k];
      else W.map[k] = [x, y, ed.paint];
      markDirty(); drawCells(); drawStatus(); refreshBar();
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
        h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: () => { const c = stationCell(id); if (!c) return; pushUndo(); ed.W.map[KEY(c[0], c[1])] = [c[0], c[1], 'b']; ed.selSt = null; markDirty(); refreshAll(); } }, 'この駅を消す'),
        h('button.btn.btn--sm.btn--outline', { type: 'button', onclick: () => { ed.selSt = null; refreshAll(); } }, 'えらぶのをやめる'));
    }

    function resetAll() {
      UI.confirm('保存した状態にもどす', '盤面を、保存した状態（用意されたマップならその元の形）にもどします。物件や説明の変更は残ります。', 'もどす', 'やめる').then((ok) => {
        if (!ok) return;
        pushUndo();
        const M = mapById(ed.mapId);
        ed.W.map = {}; M.cells.forEach(([x, y, t, st]) => { ed.W.map[KEY(x, y)] = t === 'S' ? [x, y, 'S', st] : [x, y, t]; });
        ed.W.start = M.start;
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
    view.onTap = onTap;
    refreshAll();
    view.fit(0);
  }

  // ======================================================================
  //  物件エディター（駅ごと／全物件の一覧）
  // ======================================================================
  const FAME = [[1, 'ふつう'], [2, '名物'], [3, '超名物']];
  const yen = (man) => A.Logic.fmt(Math.max(0, Math.round(Number(man) || 0)));
  // 価格を「きりのいい数」で上げ下げする（100万→200万…、1億→1.2億…）
  function stepPrice(p, dir) {
    p = Math.max(100, Number(p) || 100);
    const mag = Math.pow(10, Math.max(2, Math.floor(Math.log10(p)) - 1));
    const n = Math.round(p / mag) + dir * (p / mag >= 50 ? 5 : p / mag >= 20 ? 2 : 1);
    return Math.max(100, n * mag);
  }

  function propEditor(body) {
    const W = ed.W;
    ed.pmode = ed.pmode || 'station';
    if (!ed.cur || !allIds().includes(ed.cur)) ed.cur = allIds()[0];
    const dupes = () => { const all = {}; allIds().forEach((i) => (W.props[i] || []).forEach((r) => { all[r[0]] = (all[r[0]] || 0) + 1; })); return all; };

    /** 物件1行（名前・アイコン・価格・名物度・利回りと年収）。onDel があれば「消す」、onDup があれば「複製」 */
    function propRow(r, opts) {
      const o = opts || {};
      const ico = h('button.ed-ico', { type: 'button', title: 'アイコンを変える', 'aria-label': 'アイコンを変える', html: Art.icon(r[1], 26) });
      const sel = h('select.ed-ico-sel', { 'aria-label': 'アイコン' });
      Object.keys(ICONS).forEach((k) => { const op = h('option', { value: k }, ICONS[k]); if (k === r[1]) op.selected = true; sel.appendChild(op); });
      sel.addEventListener('change', () => { r[1] = sel.value; ico.innerHTML = Art.icon(r[1], 26); markDirty(); });
      ico.addEventListener('click', () => sel.focus());
      const nm = h('input.ed-in-name', { type: 'text', value: r[0], maxlength: 20, 'aria-label': '物件の名前' });
      const warn = h('small.ed-warn');
      const chkName = () => { warn.textContent = dupes()[nm.value] > 1 ? '同じ名前がほかにもあります' : ''; };
      nm.addEventListener('input', () => { r[0] = nm.value; markDirty(); chkName(); });
      chkName();
      const pr = h('input.ed-in-price', { type: 'number', min: 100, step: 100, value: r[2], 'aria-label': '価格（万円）' });
      const prTxt = h('small.ed-price-txt');
      const fm = h('select', { 'aria-label': '名物度' });
      FAME.forEach(([v, t]) => { const op = h('option', { value: v }, t); if (Number(r[3]) === v) op.selected = true; fm.appendChild(op); });
      const info = h('small.ed-rate');
      const upd = () => {
        const price = Number(pr.value) || 0, rate = A.rateFor(price, Number(fm.value));
        prTxt.textContent = yen(price);
        info.textContent = '利回り ' + rate + '% ・ 年収 ' + yen(price * rate / 100);
        if (o.onChange) o.onChange();
      };
      const setP = (v) => { pr.value = v; r[2] = v; markDirty(); upd(); };
      pr.addEventListener('input', () => { r[2] = Number(pr.value) || 0; markDirty(); upd(); });
      fm.addEventListener('change', () => { r[3] = Number(fm.value); markDirty(); upd(); });
      upd();
      const priceBox = h('div.ed-price',
        h('button.ed-step', { type: 'button', 'aria-label': '安くする', onclick: () => setP(stepPrice(pr.value, -1)) }, '−'),
        h('div.ed-price-in', pr, prTxt),
        h('button.ed-step', { type: 'button', 'aria-label': '高くする', onclick: () => setP(stepPrice(pr.value, 1)) }, '＋'));
      const acts = h('div.ed-acts',
        o.onDup ? h('button.ed-mini', { type: 'button', onclick: o.onDup }, '複製') : null,
        o.onDel ? h('button.ed-mini.is-del', { type: 'button', onclick: o.onDel }, '消す') : null,
        o.onGo ? h('button.ed-mini', { type: 'button', onclick: o.onGo }, o.goLabel) : null);
      return h('div.ed-prow', h('div.ed-icobox', ico, sel), h('div.ed-name', nm, warn), priceBox, h('div.ed-fame', fm, info), acts);
    }

    const tabs = h('div.ed-pmodes',
      h('button.btn.btn--sm.btn--lav' + (ed.pmode === 'station' ? '' : '.btn--outline'), { type: 'button', onclick: () => { ed.pmode = 'station'; render(); } }, '駅ごとに直す'),
      h('button.btn.btn--sm.btn--lav' + (ed.pmode === 'all' ? '' : '.btn--outline'), { type: 'button', onclick: () => { ed.pmode = 'all'; render(); } }, '全物件の一覧で直す'));
    body.classList.add('ed-body--props');
    body.appendChild(tabs);
    if (ed.pmode === 'all') { allList(body, propRow); return; }

    const list = h('div.ed-list');
    const form = h('div.ed-form');
    const search = h('input.ed-search', { type: 'search', placeholder: '駅や物件をさがす', value: ed.search, 'aria-label': '駅や物件をさがす' });
    body.append(h('div.ed-pwrap', h('div.ed-listwrap', search, list), form));

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
      const nm = h('input', { type: 'text', value: nameOf(id), maxlength: 12, 'aria-label': '駅の名前' });
      nm.addEventListener('change', () => { if (nm.value.trim()) { setMeta(id, 'name', nm.value.trim()); drawList(); } });
      form.appendChild(h('div.ed-sthead', h('label', '駅の名前 ', nm), h('label', '地域 ', regionSelect(id, (v) => { setMeta(id, 'region', v); drawList(); }))));
      form.appendChild(descBox(id));
      const total = h('p.ed-total');
      const sum = () => { total.textContent = rows.length + '件 ・ 合計 ' + yen(rows.reduce((a, r) => a + (Number(r[2]) || 0), 0)) + (rows.length < 5 ? '（5件未満）' : ''); };
      const table = h('div.ed-ptable');
      const draw = () => {
        table.innerHTML = '';
        table.appendChild(h('div.ed-phead', h('span', 'アイコン'), h('span', '名前'), h('span', '価格（万円）'), h('span', '名物度・利回り'), h('span', '')));
        rows.forEach((r, i) => table.appendChild(propRow(r, {
          onChange: sum,
          onDup: () => { pushUndo(); rows.splice(i + 1, 0, [r[0] + '2', r[1], r[2], r[3]]); markDirty(); draw(); drawList(); },
          onDel: () => { pushUndo(); rows.splice(i, 1); markDirty(); draw(); drawList(); },
        })));
        sum();
      };
      draw();
      form.append(h('h4', '物件（ゲームでは安い順にならびます）'), table, total);
      form.appendChild(h('div.ed-bar',
        h('button.btn.btn--sm.btn--mint', { type: 'button', onclick: () => { pushUndo(); rows.push(['新しい物件', 'park', 1000, 2]); markDirty(); draw(); drawList(); const last = table.querySelectorAll('.ed-in-name'); if (last.length) { last[last.length - 1].focus(); last[last.length - 1].select(); } } }, '＋ 物件をふやす'),
        h('button.btn.btn--sm.btn--outline', { type: 'button', onclick: () => { pushUndo(); rows.sort((a, b) => a[2] - b[2]); markDirty(); draw(); } }, '安い順にならべる'),
        h('button.btn.btn--sm.btn--outline', { type: 'button', disabled: !ed.undo.length, onclick: () => { ed.redo.push(snapshot()); restore(ed.undo.pop()); render(); } }, '↶ もどす'),
        h('button.btn.btn--sm.btn--ink.btn--outline', { type: 'button', onclick: () => {
          const d = ALL().find((s) => s.id === id);
          if (!d) return;
          pushUndo(); W.props[id] = d.props.map((p) => [p.name, p.icon, p.price, p.fame]); markDirty(); drawForm(); drawList();
        } }, 'この駅を元にもどす'),
        h('button.btn.btn--sm.btn--lav.btn--outline', { type: 'button', onclick: () => { ed.tab = 'map'; ed.tool = 'station'; ed.selSt = id; render(); } }, '地図で見る')));
      form.appendChild(h('p.hint', '価格は「−」「＋」でも上げ下げできます。利回りは価格と名物度で自動に決まります（安いほど高く、名物ほど高い。10%以上は5%刻み）。'));
    }
    drawList(); drawForm();
  }

  /** 全物件の一覧（さがす・並べかえて、まとめて直す） */
  function allList(body, propRow) {
    const W = ed.W;
    const bar = h('div.ed-bar');
    const q = h('input.ed-search', { type: 'search', placeholder: '物件・駅の名前でさがす', value: ed.search, 'aria-label': '物件・駅の名前でさがす' });
    const sort = h('select', { 'aria-label': '並べかえ' });
    [['priceDesc', '高い順'], ['priceAsc', '安い順'], ['station', '駅ごと'], ['rate', '利回りの高い順']].forEach(([v, t]) => { const o = h('option', { value: v }, t); if ((ed.psort || 'priceDesc') === v) o.selected = true; sort.appendChild(o); });
    const count = h('small.ed-total');
    bar.append(q, h('label', '並べかえ ', sort), count);
    const table = h('div.ed-ptable.ed-ptable--all');
    body.append(bar, table);
    const LIMIT = 150;
    function draw() {
      ed.search = q.value; ed.psort = sort.value;
      const term = q.value.trim();
      let items = [];
      allIds().forEach((id) => (W.props[id] || []).forEach((r) => { if (!term || String(r[0]).includes(term) || nameOf(id).includes(term)) items.push({ id, r }); }));
      const s = sort.value;
      items.sort((a, b) => (s === 'priceAsc' ? a.r[2] - b.r[2] : s === 'station' ? nameOf(a.id).localeCompare(nameOf(b.id), 'ja') || a.r[2] - b.r[2] : s === 'rate' ? A.rateFor(b.r[2], b.r[3]) - A.rateFor(a.r[2], a.r[3]) : b.r[2] - a.r[2]));
      count.textContent = items.length + '件' + (items.length > LIMIT ? '（はじめの' + LIMIT + '件を表示。さがすとしぼれます）' : '');
      table.innerHTML = '';
      table.appendChild(h('div.ed-phead', h('span', 'アイコン'), h('span', '名前'), h('span', '価格（万円）'), h('span', '名物度・利回り'), h('span', '駅')));
      items.slice(0, LIMIT).forEach(({ id, r }) => table.appendChild(propRow(r, { onGo: () => { ed.pmode = 'station'; ed.cur = id; render(); }, goLabel: nameOf(id) })));
    }
    q.addEventListener('input', draw); sort.addEventListener('change', draw);
    draw();
  }

  A.Editor = { open };
})(typeof globalThis !== 'undefined' ? globalThis : this);
