/* あいち電鉄 — エディター（マップエディター／物件エディター）
 * 保存先はブラウザの localStorage（js/overrides.js が起動時に読みこむ）。保存したあと、ゲームに反映するには再読みこみが必要。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const UI = A.UI, Art = A.Art, h = UI.h, $ = UI.$, esc = UI.esc;
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); return e; };

  const ed = { tab: 'map', dirty: false, data: null, view: null };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const readData = () => { const o = A.Overrides.load(); return { pos: o.pos || {}, edges: o.edges || null, props: o.props || {} }; };
  function persist() { ed.dirty = true; A.Overrides.save(ed.data); }

  function open(tab) {
    ed.data = readData();
    ed.tab = tab || ed.tab || 'map';
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-editor'; });
    document.body.dataset.screen = 'editor';
    render();
  }

  function render() {
    const scr = $('#screen-editor');
    scr.innerHTML = '';
    const tabBtn = (k, t) => h('button.btn.btn--sm.btn--lav' + (ed.tab === k ? '' : '.btn--outline'), { type: 'button', onclick: () => { ed.tab = k; render(); } }, t);
    scr.appendChild(h('header.ed-head',
      h('button.btn.btn--outline.btn--sm', { type: 'button', onclick: back }, '← もどる'),
      h('h2', 'エディター'),
      h('div.ed-tabs', tabBtn('map', 'マップ'), tabBtn('props', '物件'))));
    const body = h('div.ed-body');
    scr.appendChild(body);
    if (ed.tab === 'map') mapEditor(body); else propEditor(body);
  }

  function back() {
    if (ed.dirty) { location.reload(); return; } // 保存した内容をゲームに反映するため、読みこみ直す
    A.app.quitToTitle();
  }

  // ======================================================================
  //  マップエディター: 駅をドラッグで動かす／2つの駅をえらんで線路をつなぐ・切る
  // ======================================================================
  function mapEditor(body) {
    const pos = {}; // 現在の位置
    A.STATIONS.forEach((s) => { pos[s.id] = [s.x, s.y]; });
    let edges = (ed.data.edges && ed.data.edges.length ? ed.data.edges : A.EDGES).map((e) => e.slice());
    let mode = 'move', pick = null;

    const stage = h('div.ed-stage');
    const svg = sv('svg', { class: 'ed-map', preserveAspectRatio: 'xMidYMid meet' });
    stage.appendChild(svg);
    const msg = h('p.ed-msg');
    const setMsg = () => {
      msg.textContent = mode === 'move'
        ? '駅をドラッグして動かします。地図の何もない所をドラッグすると、地図が動きます。'
        : (pick ? '「' + nameOf(pick) + '」とつなぐ（またはつなぎ直す）駅をタッチしてください。' : '線路をつなぐ・切る: 1つ目の駅をタッチして、つぎに2つ目の駅をタッチします（すでにつながっていれば切れます）。');
    };
    const nameOf = (id) => (A.STATIONS.find((s) => s.id === id) || {}).name;

    const bar = h('div.ed-bar');
    const modeBtn = (k, t) => h('button.btn.btn--sm.btn--lav' + (mode === k ? '' : '.btn--outline'), { type: 'button', onclick: () => { mode = k; pick = null; draw(); refreshBar(); setMsg(); } }, t);
    function refreshBar() {
      bar.innerHTML = '';
      bar.append(modeBtn('move', '駅を動かす'), modeBtn('edge', '線路をつなぐ・切る'),
        h('button.btn.btn--sm.btn--pear', { type: 'button', onclick: save }, '保存'),
        h('button.btn.btn--sm.btn--ink.btn--outline', { type: 'button', onclick: exportJson }, '書き出し/読みこみ'),
        h('button.btn.btn--sm.btn--coral.btn--soft', { type: 'button', onclick: reset }, '初期状態にもどす'));
    }

    let gE, gS, view;
    function draw() {
      svg.innerHTML = '';
      const bg = sv('g'); bg.innerHTML = Art.mapBackground();
      gE = sv('g'); gS = sv('g');
      svg.append(bg, gE, gS);
      edges.forEach((e, i) => {
        const a = pos[e[0]], b = pos[e[1]];
        if (!a || !b) return;
        const ln = sv('line', { class: 'ed-edge' + (e[2] && e[2].sea ? ' is-sea' : '') + (e[2] && e[2].bridge ? ' is-bridge' : ''), x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'data-i': i });
        gE.appendChild(ln);
      });
      A.STATIONS.forEach((s) => {
        const g = sv('g', { class: 'ed-st' + (pick === s.id ? ' is-pick' : '') + (s.card ? ' is-card' : ''), transform: 'translate(' + pos[s.id][0] + ' ' + pos[s.id][1] + ')', 'data-id': s.id });
        g.appendChild(sv('rect', { x: -19, y: -19, width: 38, height: 38, rx: 8, class: 'ed-st-box' }));
        const t = sv('text', { y: 36, 'text-anchor': 'middle', class: 'ed-st-name' }); t.textContent = s.name;
        g.append(t);
        bindStation(g, s);
        gS.appendChild(g);
      });
    }
    function moveLines(id) {
      gE.querySelectorAll('line').forEach((ln) => {
        const e = edges[Number(ln.getAttribute('data-i'))];
        if (e[0] !== id && e[1] !== id) return;
        ln.setAttribute('x1', pos[e[0]][0]); ln.setAttribute('y1', pos[e[0]][1]); ln.setAttribute('x2', pos[e[1]][0]); ln.setAttribute('y2', pos[e[1]][1]);
      });
    }
    function bindStation(g, s) {
      let drag = null;
      g.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        g.setPointerCapture(ev.pointerId);
        drag = { moved: false, sx: ev.clientX, sy: ev.clientY };
      });
      g.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 5) drag.moved = true;
        if (mode !== 'move' || !drag.moved) return;
        const w = view.toWorld(ev.clientX, ev.clientY);
        pos[s.id] = [Math.round(w.x), Math.round(w.y)];
        g.setAttribute('transform', 'translate(' + pos[s.id][0] + ' ' + pos[s.id][1] + ')');
        moveLines(s.id);
      });
      g.addEventListener('pointerup', () => {
        const wasTap = drag && !drag.moved;
        drag = null;
        if (!wasTap || mode !== 'edge') return;
        if (!pick) { pick = s.id; draw(); setMsg(); return; }
        if (pick !== s.id) {
          const i = edges.findIndex((e) => (e[0] === pick && e[1] === s.id) || (e[1] === pick && e[0] === s.id));
          if (i >= 0) edges.splice(i, 1); else edges.push([pick, s.id]);
        }
        pick = null; draw(); setMsg();
      });
    }

    function save() {
      // つながっていない駅がないか確かめる
      const adj = {};
      A.STATIONS.forEach((s) => { adj[s.id] = []; });
      edges.forEach((e) => { if (adj[e[0]] && adj[e[1]]) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); } });
      const seen = new Set(['nagoya']), q = ['nagoya'];
      for (let i = 0; i < q.length; i++) adj[q[i]].forEach((n) => { if (!seen.has(n)) { seen.add(n); q.push(n); } });
      const lost = A.STATIONS.filter((s) => !seen.has(s.id));
      if (lost.length) { UI.alert('つながっていない駅があります', '名古屋から行けない駅: ' + esc(lost.map((s) => s.name).join('、')) + '<br>線路をつなぎ直してから保存してください。'); return; }
      const moved = {};
      A.STATIONS.forEach((s) => { if (pos[s.id][0] !== s.def[0] || pos[s.id][1] !== s.def[1]) moved[s.id] = pos[s.id]; });
      ed.data.pos = moved; ed.data.edges = edges;
      persist();
      UI.alert('保存しました', '「もどる」を押すと、ゲームに反映されます。<br><small>途中のマスの数は、駅と駅のきょりで自動で決まります。</small>');
    }
    function reset() {
      UI.confirm('初期状態にもどす', 'マップ（駅の位置・線路）を、最初の状態にもどします。', 'もどす', 'やめる').then((ok) => {
        if (!ok) return;
        ed.data.pos = {}; ed.data.edges = null; persist();
        location.reload();
      });
    }
    function exportJson() {
      const json = JSON.stringify({ pos: ed.data.pos, edges: ed.data.edges, props: ed.data.props });
      const ta = h('textarea.ed-json', { rows: 8, spellcheck: 'false' });
      ta.value = json;
      const m = UI.modal({ title: '書き出し / 読みこみ', body: h('div', h('p.hint', 'いまの保存内容です。コピーしてバックアップできます。貼りつけて「読みこむ」を押すと、この内容に置きかわります。'), ta), cls: 'modal--wide',
        actions: [{ label: 'とじる', value: false, kind: 'outline', color: 'ink' }, { label: '読みこむ', value: true }] });
      m.promise.then((ok) => {
        if (!ok) return;
        try { const o = JSON.parse(ta.value); A.Overrides.save({ pos: o.pos || {}, edges: o.edges || null, props: o.props || {} }); location.reload(); } catch (e) { UI.alert('読みこめませんでした', '形式がちがうようです。'); }
      });
    }

    body.append(bar, msg, stage);
    view = new A.MapView(svg, stage);
    draw(); refreshBar(); setMsg();
    view.fit(0);
  }

  // ======================================================================
  //  物件エディター: 駅ごとに、物件の名前・アイコン・価格・名物度を変える
  // ======================================================================
  const ICONS = { castle: 'お城', shrine: '神社・お寺', food: '食べもの', factory: '工場', pottery: '焼きもの', mountain: '山', sea: '海', park: '公園', onsen: '温泉', museum: '博物館・町並み', farm: '農産物', train: '鉄道', tower: 'タワー・ビル', airport: '空港', festival: 'お祭り', fish: '魚', bird: '鳥', leaf: '花・紅葉', craft: '工芸', card: 'カード' };

  function propEditor(body) {
    let cur = ed.cur && A.STATIONS.find((s) => s.id === ed.cur) ? ed.cur : A.STATIONS[0].id;
    const list = h('div.ed-list');
    const form = h('div.ed-form');
    body.append(list, form);

    const itemsNow = (id) => {
      const ov = ed.data.props[id];
      if (ov) return clone(ov);
      return A.STATIONS.find((s) => s.id === id).props.map((p) => [p.name, p.icon, p.price, p.fame]);
    };

    function drawList() {
      list.innerHTML = '';
      Object.keys(A.REGION).forEach((rg) => {
        list.appendChild(h('h4', A.REGION[rg]));
        A.STATIONS.filter((s) => s.region === rg).forEach((s) => {
          const changed = !!ed.data.props[s.id];
          list.appendChild(h('button.ed-st-btn' + (s.id === cur ? '.is-on' : ''), { type: 'button', onclick: () => { cur = s.id; ed.cur = cur; drawList(); drawForm(); } },
            s.name, changed ? h('em.tag', '変更') : null, s.card && !changed ? h('em.tag', 'カード駅') : null));
        });
      });
    }

    function drawForm() {
      form.innerHTML = '';
      const st = A.STATIONS.find((s) => s.id === cur);
      const rows = itemsNow(cur);
      form.appendChild(h('h3', st.name + '駅の物件'));
      form.appendChild(h('p.hint', '価格は万円。画面では安い順にならびます。利回りは価格と名物度で自動に決まります（10%以上は5%刻み）。物件を1つ以上入れると、カード駅は物件駅になります。'));
      const table = h('div.ed-rows');
      const draw = () => {
        table.innerHTML = '';
        rows.forEach((r, i) => {
          const rate = A.rateFor(Number(r[2]) || 0, Number(r[3]) || 2);
          const sel = h('select', { 'aria-label': 'アイコン' });
          Object.keys(ICONS).forEach((k) => { const o = h('option', { value: k }, ICONS[k]); if (k === r[1]) o.selected = true; sel.appendChild(o); });
          sel.addEventListener('change', () => { r[1] = sel.value; });
          const nm = h('input', { type: 'text', value: r[0], maxlength: 20, 'aria-label': '名前' });
          nm.addEventListener('input', () => { r[0] = nm.value; });
          const pr = h('input', { type: 'number', min: 100, step: 100, value: r[2], 'aria-label': '価格(万円)' });
          const info = h('span.ed-rate');
          const fm = h('select', { 'aria-label': '名物度' });
          [[1, '名物度 ふつう'], [2, '名物度 名物'], [3, '名物度 超名物']].forEach(([v, t]) => { const o = h('option', { value: v }, t); if (Number(r[3]) === v) o.selected = true; fm.appendChild(o); });
          const upd = () => { info.textContent = '利回り ' + A.rateFor(Number(pr.value) || 0, Number(fm.value)) + '% ・ ' + A.Logic.fmt(Number(pr.value) || 0); };
          pr.addEventListener('input', () => { r[2] = Number(pr.value) || 0; upd(); });
          fm.addEventListener('change', () => { r[3] = Number(fm.value); upd(); });
          upd();
          const del = h('button.btn.btn--coral.btn--soft.btn--sm', { type: 'button', onclick: () => { rows.splice(i, 1); draw(); } }, '消す');
          table.appendChild(h('div.ed-row', nm, sel, pr, fm, info, del));
        });
      };
      draw();
      form.appendChild(table);
      form.appendChild(h('div.ed-bar',
        h('button.btn.btn--sm.btn--mint.btn--soft', { type: 'button', onclick: () => { rows.push(['新しい物件', 'park', 1000, 2]); draw(); } }, '＋ 物件をふやす'),
        h('button.btn.btn--sm.btn--pear', { type: 'button', onclick: () => {
          const clean = rows.filter((r) => String(r[0]).trim() && Number(r[2]) > 0).map((r) => [String(r[0]).trim(), r[1], Math.round(Number(r[2])), Number(r[3]) || 2]);
          const names = clean.map((r) => r[0]);
          if (new Set(names).size !== names.length) { UI.alert('名前がかぶっています', '同じ駅の物件は、ちがう名前にしてください。'); return; }
          ed.data.props[cur] = clean; persist(); drawList();
          UI.alert('保存しました', st.name + '駅の物件を保存しました。「もどる」を押すと、ゲームに反映されます。');
        } }, 'この駅を保存'),
        h('button.btn.btn--sm.btn--ink.btn--outline', { type: 'button', onclick: () => { delete ed.data.props[cur]; persist(); location.reload(); } }, 'この駅を元にもどす')));
    }
    drawList(); drawForm();
  }

  A.Editor = { open };
})(typeof globalThis !== 'undefined' ? globalThis : this);
