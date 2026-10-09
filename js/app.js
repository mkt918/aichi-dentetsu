/* あいち電鉄 — 画面の流れ（タイトル → 設定 → ゲーム → 結果）とターン進行の UI */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const L = A.Logic, B = A.Board, UI = A.UI, Art = A.Art, AI = A.AI, Au = A.Audio;
  const { h, $, $$, esc, sleep, modal } = UI;
  const fmt = L.fmt;
  const SAVE_KEY = 'aichi-dentetsu-save-v3', PREF_KEY = 'aichi-dentetsu-pref-v1';
  const LEVELS = { 1: 'よわい', 2: 'ふつう', 3: 'つよい' };
  const SPEEDS = [{ v: 1, name: 'ふつう' }, { v: 0.5, name: 'はやい' }, { v: 0.2, name: 'とてもはやい' }, { v: 0, name: 'さいそく' }];

  const app = { state: null, view: null, setup: null, lastCfg: null, prefs: { sound: true, speed: 1, route: false }, cash: [], dom: {} };

  // ---------- 保存 ----------
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても遊べる */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* 無視 */ } }
  function loadPrefs() { Object.assign(app.prefs, lsGet(PREF_KEY) || {}); UI.rt.speed = app.prefs.speed; Au.setEnabled(app.prefs.sound); }
  const savePrefs = () => lsSet(PREF_KEY, app.prefs);
  function saveGame() { if (app.state && !app.state.finished) lsSet(SAVE_KEY, { state: app.state, at: Date.now() }); }

  // ---------- 小さなアイコン ----------
  const ICO = {
    dice: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="8.500" cy="8.500" r="1.700" fill="currentColor"/><circle cx="15.500" cy="15.500" r="1.700" fill="currentColor"/><circle cx="12" cy="12" r="1.700" fill="currentColor"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 11 12 3l9 8v10H3z" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round"/><rect x="9.500" y="14" width="5" height="7" fill="currentColor"/></svg>',
    route: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5.500" cy="18.500" r="2.600" fill="currentColor"/><circle cx="18.500" cy="5.500" r="2.600" fill="none" stroke="currentColor" stroke-width="2.200"/><path d="M8 18c6 0 2-12 8.500-12.500" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-dasharray="1 4.500"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.600" stroke-linecap="round"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9.500h4l5-4v13l-5-4H4z" fill="currentColor"/><path d="M16 9c1.500 1.800 1.500 4.200 0 6M18.500 6.500c3 3.200 3 7.800 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9.500h4l5-4v13l-5-4H4z" fill="currentColor"/><path d="M16 9.500l5 5M21 9.500l-5 5" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/></svg>',
    fit: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    follow: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.200"/><circle cx="12" cy="12" r="1.800" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/></svg>',
    bug: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><ellipse cx="12" cy="14" rx="5" ry="6.500" fill="none" stroke="currentColor" stroke-width="2.200"/><path d="M9 6.500 7.500 4M15 6.500 16.500 4M3 12h4M17 12h4M4 19l3-2M20 19l-3-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    fast: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 5l8 7-8 7zM12 5l8 7-8 7z" fill="currentColor"/></svg>',
  };

  // ======================================================================
  //  タイトル / 設定
  // ======================================================================
  const MODES = {
    solo: { title: 'ひとりで練習', sub: '動作確認モード（デバッグ機能つき）', lead: 'ひとりで遊んで、ルールや動きをじっくり確かめるモードです。サイコロの目を指定したり、お金やカードを増やせる「デバッグ」ボタンがつきます。', char: 0, players: [['human', 2]], fixed: true },
    cpu: { title: 'CPUと対戦', sub: '1〜3体のCPUと勝負', lead: 'あなたと、CPUの対戦です。CPUの強さ（よわい・ふつう・つよい）は1体ずつえらべます。', char: 1, players: [['human', 2], ['cpu', 2], ['cpu', 2]] },
    versus: { title: 'みんなで対戦', sub: '同じパソコンで2〜4人', lead: '1台のパソコンを交代で使って遊びます。自分の番になったら「サイコロをふる」を押します。CPUを混ぜることもできます。', char: 2, players: [['human', 2], ['human', 2]] },
    watch: { title: 'CPU観戦', sub: 'CPUだけで勝負させて見る', lead: 'CPU同士の対戦をながめるモードです。「はやさ」を上げると、あっという間に結果までいきます。', char: 3, players: [['cpu', 3], ['cpu', 2], ['cpu', 1]] },
  };
  const YEARS = [
    { y: 1, label: '1年', note: 'おためし（5〜10分）' },
    { y: 3, label: '3年', note: 'ふつう（20〜30分）' },
    { y: 5, label: '5年', note: 'じっくり（40分〜）' },
    { y: 10, label: '10年', note: 'ロング（1時間〜）' },
  ];

  function showScreen(id) {
    $$('.screen').forEach((s) => { s.hidden = s.id !== id; });
    document.body.dataset.screen = id.replace('screen-', '');
  }

  function renderTitle() {
    $('#logo-slot').innerHTML = Art.logo();
    const list = $('#mode-list');
    list.innerHTML = '';
    Object.keys(MODES).forEach((k) => {
      const m = MODES[k];
      const b = h('button.mode-card', { type: 'button', 'data-mode': k },
        h('span.mode-art', { html: Art.character(m.char, 56) }),
        h('span.mode-text', h('strong', m.title), h('small', m.sub)));
      b.addEventListener('click', () => { Au.unlock(); Au.play('click'); openSetup(k); });
      list.appendChild(b);
    });
    const save = lsGet(SAVE_KEY);
    const cont = $('#btn-continue');
    cont.hidden = !(save && save.state && !save.state.finished);
    if (!cont.hidden) {
      const cal = L.calendar(save.state);
      cont.textContent = 'つづきから（' + cal.year + '年目 ' + cal.month + '月）';
    }
    syncSoundButtons();
    showScreen('screen-title');
  }

  function openSetup(mode) {
    const m = MODES[mode];
    const slots = m.players.map(([type, level], i) => ({ type, level, name: A.CHARS[i].name }));
    while (slots.length < 4) slots.push({ type: 'none', level: 2, name: A.CHARS[slots.length].name });
    app.setup = { mode, years: mode === 'solo' ? 1 : 3, slots };
    if (mode === 'watch') app.setup.years = 1;
    renderSetup();
    showScreen('screen-setup');
  }

  function renderSetup() {
    const st = app.setup, m = MODES[st.mode];
    $('#setup-title').textContent = m.title;
    $('#setup-lead').textContent = m.lead;
    const yp = $('#years-pick');
    yp.innerHTML = '';
    YEARS.forEach((o) => {
      const b = h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': st.years === o.y ? 'true' : 'false' }, h('strong', o.label), h('small', o.note));
      b.addEventListener('click', () => { Au.play('click'); st.years = o.y; renderSetup(); });
      yp.appendChild(b);
    });
    $('#years-note').textContent = '1年 = 12か月。3月の終わりに「決算」があり、持っている物件の収入が入ります。';

    const box = $('#slots');
    box.innerHTML = '';
    st.slots.forEach((sl, i) => {
      if (m.fixed && i > 0) return;
      const sel = h('select.slot-type', { 'aria-label': (i + 1) + '人目のタイプ', disabled: m.fixed });
      [['human', 'にんげん'], ['cpu:1', 'CPU（よわい）'], ['cpu:2', 'CPU（ふつう）'], ['cpu:3', 'CPU（つよい）'], ['none', 'いない']].forEach(([v, t]) => {
        if (m.fixed && v !== 'human') return;
        const o = h('option', { value: v }, t);
        if ((sl.type === 'human' && v === 'human') || (sl.type === 'cpu' && v === 'cpu:' + sl.level) || (sl.type === 'none' && v === 'none')) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        const v = sel.value;
        if (v === 'human') sl.type = 'human'; else if (v === 'none') sl.type = 'none'; else { sl.type = 'cpu'; sl.level = Number(v.split(':')[1]); }
        renderSetup();
      });
      const name = h('input.slot-name', { type: 'text', value: sl.name, maxlength: 8, 'aria-label': (i + 1) + '人目の名前', disabled: sl.type === 'none' });
      name.addEventListener('input', () => { sl.name = name.value; });
      const row = h('div.slot' + (sl.type === 'none' ? '.is-off' : ''),
        h('span.slot-badge', { html: Art.character(i, 44) }), name, sel);
      box.appendChild(row);
    });
    const active = st.slots.filter((s) => s.type !== 'none').length;
    const humans = st.slots.filter((s) => s.type === 'human').length;
    let note = '';
    if (m.fixed) note = 'ひとりで遊びます。';
    else if (active < 2) note = '2人以上にしてください。';
    else note = '人間 ' + humans + '人 / CPU ' + (active - humans) + '体';
    $('#slots-note').textContent = note;
    $('#btn-start').disabled = !m.fixed && active < 2;
  }

  function buildConfig() {
    const st = app.setup, m = MODES[st.mode];
    const players = [];
    st.slots.forEach((sl, i) => {
      if (sl.type === 'none') return;
      players.push({ name: (sl.name || A.CHARS[i].name).trim() || A.CHARS[i].name, type: sl.type, level: sl.level, char: i });
    });
    return { years: st.years, mode: st.mode, debug: st.mode === 'solo', players, fixed: m.fixed };
  }

  // ======================================================================
  //  ゲームの開始と全体ループ
  // ======================================================================
  function startGame(state) {
    UI.closeAllModals();
    UI.rt.runId++;
    UI.setPaused(false);
    app.state = state;
    app.cash = state.players.map((p) => p.cash);
    showScreen('screen-game');
    $('#log').innerHTML = '';
    $('#dice-box').innerHTML = '';
    $('#banner').className = 'banner';
    document.body.dataset.mode = state.config.mode;
    if (!app.view) {
      app.view = new A.MapView($('#map'), $('#stage'));
      app.view.onStationTap = (id) => showStationInfo(id);
      bindGameChrome();
    }
    app.view.cancelPick();
    app.view.routeOn = !!app.prefs.route;
    app.view.setFollow(true);
    app.view.init(state);
    renderHud(true);
    app.view.fit(0); // HUD が出そろって地図の高さが決まってから、全体表示に合わせ直す
    const hasCpu = state.players.some((p) => p.type === 'cpu');
    $('#speed-box').hidden = !hasCpu;
    renderSpeedBox();
    saveGame();
    UI.log('ゲームスタート! 目的地は<b>' + L.STATION[state.dest].name + '</b>です。', 'sys');
    loop(UI.rt.runId);
  }

  async function loop(tok) {
    const s = app.state;
    try {
      await sleep(60);
      while (!s.finished) {
        await L.runTurn(s, driver);
        UI.guard(tok);
        const info = L.advance(s);
        app.view.refresh(s);
        renderHud();
        if (info.monthEnded && !info.finished) await announceMonth(s);
        if (info.settlement) await showSettlement(info.settlement);
        UI.guard(tok);
        if (!s.finished) saveGame();
      }
      lsDel(SAVE_KEY);
      await finishGame();
    } catch (e) {
      if (tok !== UI.rt.runId) return; // タイトルへ戻った/新しいゲームが始まったあとの古いループは静かに終わる
      if (!(e instanceof UI.Aborted)) { console.error(e); UI.alert('エラー', 'ゲームの進行中にエラーが起きました。タイトルに戻ります。<br><small>' + esc(e.message) + '</small>').then(() => quitToTitle()); }
    }
  }

  async function announceMonth(s) {
    const cal = L.calendar(s);
    if (cal.month === 4) {
      Au.play('turn');
      await UI.banner({ title: cal.year + '年目のスタート!', sub: '4月になりました', kind: 'info', art: Art.season(4).svg.replace(/width="22" height="22"/, 'width="46" height="46"') }, 1200);
    } else if (s.players.length > 1 || s.config.years > 1) {
      UI.log(cal.month + '月になりました。', 'sys');
    }
  }

  function quitToTitle() {
    // 保存は各ターンの区切りで済んでいる。途中の番の状態は保存しない（再開時は番のはじめから）
    UI.rt.runId++;
    UI.setPaused(false);
    UI.closeAllModals();
    if (app.view) app.view.cancelPick();
    app.state = null;
    renderTitle();
  }

  // ======================================================================
  //  HUD
  // ======================================================================
  const isHuman = (idx) => app.state.players[idx].type === 'human';
  const cpuLabel = (p) => (p.type === 'cpu' ? 'CPU ' + LEVELS[p.level] : '');

  function renderHud(first) {
    const s = app.state;
    const cal = L.calendar(s), total = s.config.years * 12, left = Math.max(0, total - s.round);
    const se = Art.season(cal.month);
    $('#hud-date').innerHTML = '<span class="season" title="' + se.name + '">' + se.svg + '</span><span class="date-main"><strong>' + cal.year + '年目 ' + cal.month + '月</strong><small>全' + s.config.years + '年・あと' + left + 'か月</small></span>';
    const cur = L.current(s), d = B.distFrom(s.dest)[s.players[cur].pos];
    $('#hud-dest').innerHTML = Art.flag(26) + '<span class="dest-main"><small>目的地</small><strong>' + L.STATION[s.dest].name + '</strong></span><span class="dest-dist">あと<b>' + d + '</b>マス</span><span class="dest-bonus">' + Art.coin(16) + fmt(L.destBonus(s)) + '</span>';
    renderPlayers(first);
    syncSoundButtons();
    syncFollowButton();
  }

  function renderPlayers(first) {
    const s = app.state, wrap = $('#players');
    const rank = L.ranking(s), cur = L.current(s);
    if (!first && wrap.children.length === s.players.length) {
      s.players.forEach((p, i) => updatePlayerCard(wrap.children[i], p, rank, cur));
      return;
    }
    wrap.innerHTML = '';
    s.players.forEach((p) => {
      const ch = A.CHARS[p.char % A.CHARS.length];
      const card = h('button.pcard', { type: 'button', 'data-i': p.id, style: { '--pc': ch.color } },
        h('span.pcard-badge', { html: Art.character(p.char, 46) }),
        h('span.pcard-main',
          h('span.pcard-name', esc(p.name), p.type === 'cpu' ? h('em.tag', 'CPU ' + LEVELS[p.level]) : null),
          h('span.pcard-cash', { 'data-cash': '' }, fmt(p.cash)),
          h('span.pcard-meta')));
      card.addEventListener('click', () => { Au.play('click'); showPlayerInfo(p.id); });
      wrap.appendChild(card);
      updatePlayerCard(card, p, rank, cur, true);
    });
  }
  function updatePlayerCard(card, p, rank, cur, init) {
    const s = app.state;
    card.classList.toggle('is-current', p.id === cur);
    card.classList.toggle('has-god', !!p.god);
    const cashEl = card.querySelector('[data-cash]');
    const prev = app.cash[p.id] != null ? app.cash[p.id] : p.cash;
    if (!init && prev !== p.cash) {
      UI.countUp(cashEl, prev, p.cash, 600 * UI.rt.speed, fmt);
      cashEl.classList.remove('flash-up', 'flash-down'); void cashEl.offsetWidth;
      cashEl.classList.add(p.cash > prev ? 'flash-up' : 'flash-down');
    } else cashEl.textContent = fmt(p.cash);
    cashEl.classList.toggle('is-neg', p.cash < 0);
    app.cash[p.id] = p.cash;
    const props = L.ownedProps(s, p.id).length;
    card.querySelector('.pcard-meta').innerHTML =
      '<span class="chip chip--rank r' + (rank.indexOf(p.id) + 1) + '">' + (rank.indexOf(p.id) + 1) + '位</span>' +
      '<span class="chip" title="手札">' + Art.cardMini(14) + p.cards.length + '</span>' +
      '<span class="chip" title="物件">' + Art.icon('museum', 14) + props + '</span>' +
      (p.god ? '<span class="chip chip--god" title="貧乏神">' + Art.god(16) + '</span>' : '');
  }

  function setMsg(html) { $('#action-msg').innerHTML = html; }
  function setActions(btns) {
    const box = $('#action-buttons');
    box.innerHTML = '';
    box.classList.remove('is-compact');
    btns.forEach((b) => b && box.appendChild(b));
  }
  function actBtn(o) {
    const cls = 'btn' + (o.color ? ' btn--' + o.color : ' btn--pear') + (o.kind === 'soft' ? ' btn--soft' : o.kind === 'outline' ? ' btn--outline' : '');
    const b = h('button', { type: 'button', class: cls + (o.big ? ' btn--lg' : ''), disabled: !!o.disabled, 'aria-pressed': o.pressed != null ? String(o.pressed) : null });
    b.innerHTML = (o.icon || '') + '<span class="btn-label">' + o.label + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</span>';
    b.addEventListener('click', () => { Au.unlock(); Au.play('click'); o.onClick(b); });
    return b;
  }

  function syncSoundButtons() {
    const on = app.prefs.sound;
    const b = $('#btn-sound');
    if (b) { b.innerHTML = on ? ICO.soundOn : ICO.soundOff; b.setAttribute('aria-pressed', String(on)); }
    const t = $('#btn-sound-title');
    if (t) { t.textContent = '効果音 ' + (on ? 'ON' : 'OFF'); t.setAttribute('aria-pressed', String(on)); }
  }
  function syncFollowButton() {
    const f = $('#map-tools [data-act="follow"]');
    if (f && app.view) f.setAttribute('aria-pressed', String(app.view.follow));
  }
  function renderSpeedBox() {
    const box = $('#speed-box'), cur = SPEEDS.find((x) => x.v === UI.rt.speed) || SPEEDS[0];
    box.innerHTML = '';
    const b = h('button.speed-btn', { type: 'button', 'aria-label': 'はやさをかえる' }, h('span', { html: ICO.fast }), h('span', 'はやさ: ' + cur.name));
    b.addEventListener('click', () => {
      const i = SPEEDS.findIndex((x) => x.v === UI.rt.speed);
      const nx = SPEEDS[(i + 1) % SPEEDS.length];
      UI.rt.speed = nx.v; app.prefs.speed = nx.v; savePrefs(); Au.play('click'); renderSpeedBox();
    });
    box.appendChild(b);
  }

  function bindGameChrome() {
    $('#btn-sound').addEventListener('click', toggleSound);
    $('#btn-menu').innerHTML = ICO.menu;
    $('#btn-menu').addEventListener('click', openMenu);
    $('#hud-dest').addEventListener('click', () => {
      const s = app.state; if (!s) return;
      app.view.setFollow(false); syncFollowButton();
      app.view.setCam({ cx: B.byId[s.dest].x, cy: B.byId[s.dest].y, w: 560 }, 500);
    });
    const tools = $('#map-tools');
    tools.querySelector('[data-act="fit"]').innerHTML = ICO.fit;
    tools.querySelector('[data-act="follow"]').innerHTML = ICO.follow;
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const v = app.view, act = b.getAttribute('data-act');
      Au.play('click');
      if (act === 'zoom-in') v.zoomBy(0.72);
      else if (act === 'zoom-out') v.zoomBy(1.4);
      else if (act === 'fit') { v.setFollow(false); v.fit(); }
      else if (act === 'follow') {
        v.setFollow(!v.follow);
        if (v.follow && app.state) v.focusNode(app.state.players[L.current(app.state)].pos, v.comfyWidth(), 400);
      }
      syncFollowButton();
    });
    $('#stage').addEventListener('followchange', syncFollowButton);
    document.addEventListener('keydown', (e) => {
      if (document.body.dataset.screen !== 'game' || e.target.closest('input,select,textarea')) return;
      if (e.key === '+' || e.key === '=') app.view.zoomBy(0.72);
      else if (e.key === '-') app.view.zoomBy(1.4);
    });
  }

  function toggleSound() {
    app.prefs.sound = !app.prefs.sound;
    Au.setEnabled(app.prefs.sound); savePrefs(); syncSoundButtons();
    if (app.prefs.sound) Au.play('click');
  }

  // ======================================================================
  //  メニュー / ルール / 情報モーダル
  // ======================================================================
  async function openMenu() {
    const s = app.state; if (!s) return;
    UI.setPaused(true);
    try {
      for (;;) {
        const body = h('div.menu-list');
        const items = [
          ['resume', '続ける', 'push'], ['props', '物件ぜんぶを見る', 'soft'], ['log', 'できごとログ', 'soft'], ['rules', 'あそびかた', 'soft'],
          ['route', 'ルート表示: ' + (app.prefs.route ? 'ON' : 'OFF'), 'soft'], ['sound', '効果音: ' + (app.prefs.sound ? 'ON' : 'OFF'), 'soft'],
          ['speed', 'CPUのはやさ: ' + (SPEEDS.find((x) => x.v === UI.rt.speed) || SPEEDS[0]).name, 'soft'],
          ['title', '保存してタイトルへ', 'outline'],
        ];
        const m = modal({ title: 'メニュー', body, actions: [] , cls: 'modal--menu'});
        items.forEach(([v, t, k]) => {
          const b = h('button.btn.btn--' + (k === 'push' ? 'pear' : 'ink') + (k === 'soft' ? '.btn--soft' : k === 'outline' ? '.btn--outline' : ''), { type: 'button' }, t);
          b.addEventListener('click', () => { Au.play('click'); m.close(v); });
          body.appendChild(b);
        });
        const r = await m.promise;
        if (!r || r === 'resume') return;
        if (r === 'props') await showAllProps();
        else if (r === 'log') await showLogModal();
        else if (r === 'rules') await showRules();
        else if (r === 'route') { app.prefs.route = !app.prefs.route; savePrefs(); app.view.setRoute(app.prefs.route, s); }
        else if (r === 'sound') toggleSound();
        else if (r === 'speed') {
          const i = SPEEDS.findIndex((x) => x.v === UI.rt.speed), nx = SPEEDS[(i + 1) % SPEEDS.length];
          UI.rt.speed = nx.v; app.prefs.speed = nx.v; savePrefs(); renderSpeedBox();
        } else if (r === 'title') {
          const ok = await UI.confirm('タイトルにもどる', '進行は1人の番が終わるたびに自動で保存されます。タイトルの「つづきから」で再開できます（いまの番の途中だった場合は、番のはじめからになります）。', 'もどる', 'やめる');
          if (ok) { UI.setPaused(false); quitToTitle(); return; }
        }
      }
    } finally { UI.setPaused(false); }
  }

  function showRules() {
    const html = `
      <div class="rules">
        <h3>ゲームの目的</h3>
        <p>愛知県の36の駅をめぐって<b>物件</b>を買い、決められた年数が終わったときに<b>資産（お金＋物件）がいちばん多い人</b>が勝ちです。</p>
        <h3>1回の番</h3>
        <ol>
          <li><b>カード</b>を1枚だけ使えます（使わなくてもOK）。</li>
          <li><b>サイコロ</b>をふって、出た数だけ線路を進みます。分かれ道では進む方向をえらびます。</li>
          <li>止まったマスの効果が起きます。<b>駅</b>に止まったら物件を買えます。</li>
        </ol>
        <h3>マスの種類</h3>
        <ul class="rules-sq">
          <li><i class="sqd sqd--blue"></i><b>青マス</b> お金がもらえる</li>
          <li><i class="sqd sqd--red"></i><b>赤マス</b> お金をとられる</li>
          <li><i class="sqd sqd--yellow"></i><b>黄マス</b> カードがもらえる</li>
          <li><i class="sqd sqd--event"></i><b>紫マス</b> ランダムなできごと</li>
        </ul>
        <h3>目的地</h3>
        <p>地図の旗が<b>目的地</b>です。<b>いちばんに着いた人</b>は大きなボーナスがもらえます（途中で通りかかっても、そこで止まります）。到着すると新しい目的地が決まります。</p>
        <h3>貧乏神</h3>
        <p>目的地に誰かが着くと、目的地から<b>いちばん遠い人</b>に貧乏神がとりつきます。とりつかれると、番の終わりにお金やカード、ときには物件をうしないます。<b>貧乏神がついた人が、ほかの人と同じマスに止まる</b>と、その人になすりつけられます。</p>
        <h3>物件と決算</h3>
        <p>駅の物件は、買った人のものになります。<b>3月の終わりの決算</b>で、物件の価格 × 利回りのお金が毎年入ります。<b>1つの駅の物件をぜんぶ買う</b>（独占）と、その駅の収入は<b>2倍</b>になります。</p>
        <h3>増資</h3>
        <p>自分の物件がある駅に止まると、<b>増資</b>ができます。物件の価格が元の半分ずつ上がり（最大3回）、収入も増えます。安い物件ほど利回りが高いので、増資のもとが取りやすいです。</p>
        <h3>カードとカード駅</h3>
        <p>急行・特急・新幹線（サイコロが2〜4個）、ワープ、足踏み、足止め、お祓い、ご祝儀、半額セール、買収などがあります。持てるのは6枚までです。物件のない<b>カード駅</b>に止まるとカードが1枚もらえ、<b>カード売り場</b>のある駅ではお金でカードを買えます。</p>
        <h3>食品日本一</h3>
        <p>2年目から、決算のたびに名物の食べものが「日本一」に選ばれて、その持ち主に臨時収入が入ります。</p>
        <h3>そうさ</h3>
        <p>地図は、ドラッグで動かし、ホイール／ピンチで拡大・縮小できます。駅をタップすると物件の情報が見られます。</p>
      </div>`;
    return modal({ title: 'あそびかた', body: html, cls: 'modal--wide', actions: [{ label: 'とじる', value: true }] }).promise;
  }

  function propRow(s, prop, opts) {
    const o = s.owners[prop.id], own = o !== undefined ? s.players[o] : null;
    const lv = (s.levels && s.levels[prop.id]) || 0, price = L.propPrice(s, prop);
    const inc = Math.round(price * prop.rate / 100);
    const act = h('span.prop-act');
    if (own) act.appendChild(h('span.prop-owner', { html: Art.character(own.char, 22) + '<b>' + esc(own.name) + '</b>' }));
    if (opts && opts.extra) act.appendChild(opts.extra);
    return h('div.prop' + (own ? '.is-owned' : ''), { style: own ? { '--pc': A.CHARS[own.char % A.CHARS.length].color } : {} },
      h('span.prop-ico', { html: Art.icon(prop.icon, 26) }),
      h('span.prop-main',
        h('strong.prop-name', prop.name, lv ? h('em.tag', '増資 Lv.' + lv) : null),
        h('span.prop-stats', h('span.stat', '価格 ' + fmt(price)), h('span.stat', '利回り ' + prop.rate + '%'), h('span.stat', '年収 ' + fmt(inc)))),
      act.children.length ? act : null);
  }

  function showStationInfo(id) {
    const s = app.state; if (!s) return;
    const st = L.STATION[id];
    const mono = L.monopolyOwner(s, id);
    const body = h('div.station-info',
      h('p.station-desc', st.desc),
      h('p.station-meta', h('span.chip', REGION[st.region]), s.dest === id ? h('span.chip.chip--dest', { html: Art.flag(14) + '目的地' }) : null,
        st.card ? h('span.chip.chip--card', 'カード駅') : null, st.shop ? h('span.chip.chip--card', 'カード売り場') : null,
        mono >= 0 ? h('span.chip.chip--mono', '独占中（収入2倍）') : null),
      st.plain ? h('p.hint', '通過駅です。物件はありません。止まると、少しおこづかいがもらえます。') : st.card ? h('p.hint', '物件はありません。止まると、カードが1枚もらえます。') : h('div.props', st.props.map((p) => propRow(s, p))));
    return modal({ title: esc(st.name) + '駅', body, actions: [{ label: 'とじる', value: true }] }).promise;
  }
  const REGION = A.REGION;

  function showPlayerInfo(i) {
    const s = app.state; if (!s) return;
    const p = s.players[i], rank = L.ranking(s);
    const props = L.ownedProps(s, i).sort((a, b) => L.propPrice(s, a) - L.propPrice(s, b));
    const seeCards = L.current(s) === i && p.type === 'human';
    const body = h('div.player-info',
      h('div.pi-head', h('span', { html: Art.character(p.char, 56) }),
        h('div', h('strong', esc(p.name)), h('small', (p.type === 'cpu' ? 'CPU（' + LEVELS[p.level] + '）' : 'にんげん') + ' ・ ' + (rank.indexOf(i) + 1) + '位'))),
      h('dl.pi-stats',
        h('div', h('dt', '所持金'), h('dd', fmt(p.cash))), h('div', h('dt', '物件の価値'), h('dd', fmt(L.assets(s, i) - p.cash))),
        h('div', h('dt', '資産ごうけい'), h('dd', fmt(L.assets(s, i)))), h('div', h('dt', '目的地一番乗り'), h('dd', p.stats.dest + '回'))),
      p.god ? h('p.pi-god', { html: Art.god(28) + ' 貧乏神がとりついています!' }) : null,
      h('h4', 'カード（' + p.cards.length + '枚）'),
      seeCards ? h('div.pi-cards', p.cards.map((c) => h('span.chip.chip--card', A.CARDS[c].name))) : h('p.hint', p.cards.length ? 'ほかの人のカードは見えません。' : 'カードを持っていません。'),
      h('h4', '物件（' + props.length + '件）'),
      props.length ? h('div.props', props.map((pr) => propRow(s, pr))) : h('p.hint', 'まだ物件がありません。'));
    return modal({ title: '', body, cls: 'modal--wide', actions: [{ label: 'とじる', value: true }] }).promise;
  }

  function showAllProps() {
    const s = app.state;
    const body = h('div.allprops');
    A.STATIONS.filter((st) => st.props.length).forEach((st) => {
      const sec = h('section.ap-st', h('h4', st.name, h('small', REGION[st.region])));
      st.props.forEach((pr) => sec.appendChild(propRow(s, pr)));
      body.appendChild(sec);
    });
    return modal({ title: '物件ぜんぶ', body, cls: 'modal--wide', actions: [{ label: 'とじる', value: true }] }).promise;
  }
  function showLogModal() {
    const items = $$('#log .log-item').map((li) => '<li class="log-item">' + li.innerHTML + '</li>').join('');
    return modal({ title: 'できごとログ', body: '<ol class="log log--modal">' + items + '</ol>', cls: 'modal--wide', actions: [{ label: 'とじる', value: true }] }).promise;
  }

  // ======================================================================
  //  ドライバ（ターン進行から呼ばれる）
  // ======================================================================
  // 各メソッドの終わりで「まだ同じゲームか」を確かめる（タイトルに戻ったあとに古い進行が続かないように）
  const guarded = (fn) => async (...args) => { const tok = UI.rt.runId; const r = await fn(...args); UI.guard(tok); return r; };
  const driver = {
    emit: guarded((e) => handleEvent(e)),
    menu: guarded((s, idx, ctx) => (isHuman(idx) ? humanMenu(s, idx, ctx) : cpuMenu(s, idx))),
    branch: guarded((s, idx, ctx) => (isHuman(idx) ? humanBranch(s, idx, ctx) : cpuBranch(s, idx, ctx))),
    target: guarded((s, idx, ctx) => (isHuman(idx) ? humanTarget(s, idx, ctx) : null)), // CPUは分かれ道ごとに自分で決める
    discard: guarded((s, idx, card) => (isHuman(idx) ? humanDiscard(s, idx, card) : Promise.resolve(AI.chooseDiscard(s, idx, card)))),
    shop: guarded((s, idx, st) => (isHuman(idx) ? humanShop(s, idx, st) : cpuShop(s, idx, st))),
    cardShop: guarded((s, idx, st) => (isHuman(idx) ? humanCardShop(s, idx, st) : cpuCardShop(s, idx, st))),
  };

  // ---------- 行動の選択 ----------
  async function cpuMenu(s, idx) {
    const p = s.players[idx];
    setActions([]);
    setMsg('<b>' + esc(p.name) + '</b>（' + cpuLabel(p) + '）が考え中…');
    await sleep(420);
    return AI.chooseMenu(s, idx);
  }

  function humanMenu(s, idx, ctx) {
    return new Promise((resolve) => {
      const p = s.players[idx];
      const cardsLeft = ctx.canCard;
      const done = (v) => { setActions([]); resolve(v); };
      setMsg('<b>' + esc(p.name) + '</b>の番です。' + (s.turn.cardUsed ? 'カードは使用ずみ。' : cardsLeft ? 'カードを使うか、サイコロをふろう!' : 'サイコロをふろう!'));
      const roll = actBtn({ label: 'サイコロをふる', icon: ICO.dice, big: true, onClick: () => done({ action: 'roll' }) });
      const btns = [roll];
      btns.push(actBtn({
        label: 'カード', sub: p.cards.length + '枚', kind: 'soft', color: 'cyan', icon: Art.cardMini(22), disabled: !cardsLeft,
        onClick: async () => { const r = await chooseCardFlow(s, idx); if (r) done(r); },
      }));
      btns.push(actBtn({ label: '物件', kind: 'soft', color: 'mint', icon: ICO.home, onClick: () => showPlayerInfo(idx) }));
      btns.push(actBtn({ label: 'ルート', kind: 'soft', color: 'lav', icon: ICO.route, pressed: !!app.prefs.route, onClick: (b) => {
        app.prefs.route = !app.prefs.route; savePrefs(); app.view.setRoute(app.prefs.route, s); b.setAttribute('aria-pressed', String(app.prefs.route));
      } }));
      if (s.config.debug) btns.push(actBtn({ label: 'デバッグ', kind: 'outline', color: 'ink', icon: ICO.bug, onClick: () => openDebug() }));
      setActions(btns);
      setTimeout(() => roll.focus({ preventScroll: true }), 50);
    });
  }

  async function chooseCardFlow(s, idx) {
    const p = s.players[idx];
    for (;;) {
      const body = h('div.cards-grid');
      const m = modal({ title: 'カードをえらぶ', body, actions: [{ label: 'もどる', value: null, kind: 'outline', color: 'ink' }] });
      const counts = {};
      p.cards.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
      Object.keys(counts).forEach((cid) => {
        const c = A.CARDS[cid], chk = L.canUseCard(s, idx, cid);
        const tile = h('button.card-tile.tone-' + c.tone, { type: 'button', disabled: !chk.ok, title: chk.ok ? '' : chk.reason },
          h('span.card-art', { html: Art.cardArt(cid) }),
          h('strong', c.name + (counts[cid] > 1 ? ' ×' + counts[cid] : '')),
          h('small', c.desc),
          !chk.ok ? h('em.card-why', chk.reason) : null);
        tile.addEventListener('click', () => { Au.play('click'); m.close(cid); });
        body.appendChild(tile);
      });
      if (!p.cards.length) body.appendChild(h('p.hint', 'カードがありません。'));
      if (s.players.some((q) => q.type === 'human' && q.id !== idx)) body.appendChild(h('p.hint.cards-hint', 'ほかの人は画面を見ないでね'));
      const cid = await m.promise;
      if (!cid) return null;
      const c = A.CARDS[cid];
      let arg = null;
      if (c.kind === 'warp') { arg = await pickStation(s); if (!arg) continue; }
      else if (c.kind === 'target') { arg = await pickTarget(s, idx); if (arg == null) continue; }
      else if (c.kind === 'buyout') { arg = await pickBuyout(s, idx); if (!arg) continue; }
      else if (c.kind === 'dice' || c.kind === 'sale' || c.kind === 'money' || c.kind === 'self' || c.kind === 'stay') {
        const ok = await UI.confirm(c.name, esc(c.desc) + '<br>使いますか?', '使う', 'やめる');
        if (!ok) continue;
      }
      return { action: 'card', cardId: cid, arg };
    }
  }

  async function pickStation(s) {
    const body = h('div.station-pick');
    const m = modal({ title: 'ワープ先をえらぶ', body, cls: 'modal--wide', actions: [{ label: 'もどる', value: null, kind: 'outline', color: 'ink' }] });
    Object.keys(REGION).forEach((rg) => {
      const sec = h('section', h('h4', REGION[rg]));
      const row = h('div.pick-row');
      A.STATIONS.filter((st) => st.region === rg).forEach((st) => {
        const b = h('button.btn.btn--ink.btn--soft.btn--sm', { type: 'button', html: (s.dest === st.id ? Art.flag(16) : '') + esc(st.name) });
        b.addEventListener('click', () => { Au.play('click'); m.close(st.id); });
        row.appendChild(b);
      });
      sec.appendChild(row); body.appendChild(sec);
    });
    return m.promise;
  }
  async function pickTarget(s, idx) {
    const body = h('div.target-pick');
    const m = modal({ title: 'だれを足止めする?', body, actions: [{ label: 'もどる', value: null, kind: 'outline', color: 'ink' }] });
    s.players.filter((q) => q.id !== idx).forEach((q) => {
      const b = h('button.btn.btn--ink.btn--soft', { type: 'button', html: Art.character(q.char, 30) + '<span>' + esc(q.name) + '<small>目的地まで' + B.distFrom(s.dest)[q.pos] + 'マス</small></span>' });
      b.addEventListener('click', () => { Au.play('click'); m.close(q.id); });
      body.appendChild(b);
    });
    const r = await m.promise;
    return r === undefined ? null : r;
  }
  async function pickBuyout(s, idx) {
    const body = h('div.props');
    const m = modal({ title: 'どの物件を買収する?', body, actions: [{ label: 'もどる', value: null, kind: 'outline', color: 'ink' }] });
    L.buyoutTargets(s, idx).forEach((pr) => {
      const b = h('button.btn.btn--coral.btn--sm', { type: 'button', html: '買収 ' + fmt(L.propPrice(s, pr) * 2) });
      b.addEventListener('click', () => { Au.play('click'); m.close(pr.id); });
      body.appendChild(propRow(s, pr, { extra: b }));
    });
    return m.promise;
  }

  // ---------- 分かれ道 ----------
  async function cpuBranch(s, idx, ctx) {
    await sleep(160);
    return AI.chooseBranch(s, idx, ctx);
  }
  async function humanBranch(s, idx, ctx) {
    const p = s.players[idx], dd = B.distFrom(s.dest);
    setMsg('<b>分かれ道!</b> あと' + ctx.remaining + 'マス。どちらへ進む?');
    const opts = ctx.options.map((id) => ({ id, hd: B.heading(p.pos, id) }));
    // 選択肢が見える広さにカメラを寄せる
    const xs = opts.map((o) => B.byId[o.id].x).concat([B.byId[p.pos].x]), ys = opts.map((o) => B.byId[o.id].y).concat([B.byId[p.pos].y]);
    if (app.view.follow) {
      const w = Math.max(app.view.comfyWidth(), (Math.max.apply(null, xs) - Math.min.apply(null, xs)) * 2.4, (Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 2.4 / Math.max(0.3, app.view.aspect()));
      app.view.setCam({ cx: (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2, cy: (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2, w }, 300);
    }
    const best = Math.min.apply(null, opts.map((o) => dd[o.id]));
    const many = opts.length > 3;
    setActions(opts.map((o) => actBtn({
      label: L.STATION[o.hd.station].name + '方面', sub: 'あと' + dd[o.id] + 'マス' + (dd[o.id] === best ? ' ★' : ''),
      kind: 'soft', color: dd[o.id] === best ? 'pear' : 'cyan', icon: many ? '' : ICO.route, onClick: () => app.view.resolvePick(o.id),
    })));
    if (many) $('#action-buttons').classList.add('is-compact');
    const id = await app.view.pickNode(ctx.options);
    setActions([]);
    return id;
  }

  // ---------- 行きたい場所をタッチして進む ----------
  /** サイコロの目で止まれる場所に印が出る。ふれた場所まで、駒が自動で進む */
  async function humanTarget(s, idx, ctx) {
    const p = s.players[idx], v = app.view;
    setMsg('<b>あと' + ctx.total + 'マス。</b>行きたい場所（光っているマス・駅）をタッチしてね。');
    setActions([]);
    const xs = ctx.endpoints.map((id) => B.byId[id].x).concat([B.byId[p.pos].x]), ys = ctx.endpoints.map((id) => B.byId[id].y).concat([B.byId[p.pos].y]);
    const w = Math.max(v.comfyWidth(), (Math.max.apply(null, xs) - Math.min.apply(null, xs)) * 1.3, (Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 1.3 / Math.max(0.3, v.aspect()));
    v.setCam({ cx: (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2, cy: (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2, w }, 350);
    const id = await v.pickNode(ctx.endpoints);
    setActions([]);
    return id;
  }

  // ---------- 手札があふれたとき ----------
  async function humanDiscard(s, idx, newCard) {
    const p = s.players[idx];
    const body = h('div.cards-grid');
    const m = modal({ title: '手札がいっぱい!', body, dismiss: false, actions: [] });
    body.appendChild(h('p.hint.span-all', '新しい「' + A.CARDS[newCard].name + '」を持つには、1枚すてる必要があります。すてるカードをえらんでください。'));
    const pool = p.cards.concat([newCard]);
    const seen = {};
    pool.forEach((cid, i) => {
      const c = A.CARDS[cid], isNew = i === pool.length - 1;
      const key = cid + (isNew ? ':new' : '');
      if (seen[key]) return; seen[key] = true;
      const tile = h('button.card-tile.tone-' + c.tone, { type: 'button' },
        h('span.card-art', { html: Art.cardArt(cid) }), h('strong', c.name + (isNew ? '（新）' : '')), h('small', 'これをすてる'));
      tile.addEventListener('click', () => { Au.play('click'); m.close(cid); });
      body.appendChild(tile);
    });
    return m.promise;
  }

  // ---------- 買い物 ----------
  function stationBanner(st) {
    const icon = st.props.length ? st.props.reduce((a, b) => (b.price > a.price ? b : a)).icon : st.plain ? 'train' : 'card';
    return UI.banner({ title: esc(st.name) + '駅', sub: esc(st.tag || st.desc), kind: 'station', art: Art.icon(icon, 44) }, 900);
  }

  async function cpuShop(s, idx, st) {
    const p = s.players[idx];
    for (let i = 0; i < 6; i++) {
      await sleep(250);
      const id = AI.chooseBuy(s, idx, st);
      if (!id) break;
      const r = L.buy(s, idx, id);
      if (!r.ok) break;
      Au.play('buy');
      UI.log('<b>' + esc(p.name) + '</b>が「' + esc(r.prop.name) + '」を' + fmt(r.price) + 'で購入。', 'buy');
      app.view.refresh(s); renderHud(); app.view.pulseStation(st.id);
      await UI.banner({ title: esc(p.name) + 'が購入!', sub: esc(r.prop.name) + '（' + fmt(r.price) + '）', kind: 'buy', art: Art.icon(r.prop.icon, 44) }, 950);
    }
    for (let i = 0; i < 6; i++) {
      const id = AI.chooseInvest(s, idx, st);
      if (!id) break;
      const r = L.invest(s, idx, id);
      if (!r.ok) break;
      Au.play('coin');
      UI.log('<b>' + esc(p.name) + '</b>が「' + esc(r.prop.name) + '」に増資（Lv.' + r.level + '）。', 'buy');
      renderHud();
      await UI.banner({ title: esc(p.name) + 'が増資!', sub: esc(r.prop.name) + ' Lv.' + r.level + '（' + fmt(r.cost) + '）', kind: 'buy', art: Art.icon(r.prop.icon, 44) }, 850);
    }
  }

  async function humanShop(s, idx, st) {
    const p = s.players[idx];
    const canAny = () => st.props.some((pr) => s.owners[pr.id] === undefined || (s.owners[pr.id] === idx && (s.levels[pr.id] || 0) < L.MAX_LEVEL));
    if (!canAny()) {
      UI.log(esc(st.name) + 'の物件はすべて売れています。');
      await UI.banner({ title: '物件はすべて売れています', sub: esc(st.name) + '駅', kind: 'info' }, 900);
      return;
    }
    const body = h('div.shop');
    const m = modal({ title: esc(st.name) + '駅の物件', body, dismiss: false, cls: 'modal--wide', actions: [{ label: '買い物をおわる', value: true, color: 'pear' }] });
    const render = () => {
      body.innerHTML = '';
      const sale = s.turn.sale;
      body.appendChild(h('div.shop-head', h('span', { html: Art.coin(20) + ' 所持金 <b>' + fmt(p.cash) + '</b>' }),
        sale ? h('span.chip.chip--sale', '半額セール中!') : null));
      body.appendChild(h('div.shop-about', h('span.chip', REGION[st.region]), h('p.station-desc', st.desc)));
      const mono = L.monopolyOwner(s, st.id);
      body.appendChild(h('p.hint', mono === idx ? 'この駅を独占しています（収入2倍）!' : 'この駅の物件を全部買うと収入が2倍に。自分の物件は「増資」で価格と収入を増やせます（最大3回）。'));
      const list = h('div.props');
      st.props.forEach((pr) => {
        const owner = s.owners[pr.id], lv = s.levels[pr.id] || 0;
        let extra = null;
        if (owner === undefined) {
          const price = L.priceFor(s, pr), can = p.cash >= price;
          extra = h('button.btn.btn--pear.btn--sm', { type: 'button', disabled: !can, html: '買う<small>' + fmt(price) + '</small>' });
          extra.addEventListener('click', () => {
            const r = L.buy(s, idx, pr.id);
            if (!r.ok) return;
            Au.play('buy'); UI.confetti($('#modal-root'), 18);
            UI.log('<b>' + esc(p.name) + '</b>が「' + esc(pr.name) + '」を' + fmt(r.price) + 'で購入。', 'buy');
            app.view.refresh(s); renderHud(); app.view.pulseStation(st.id);
            render();
          });
        } else if (owner === idx && lv < L.MAX_LEVEL) {
          const cost = L.investCost(s, pr);
          extra = h('button.btn.btn--cyan.btn--sm', { type: 'button', disabled: p.cash < cost, html: '増資<small>' + fmt(cost) + '</small>' });
          extra.addEventListener('click', () => {
            const r = L.invest(s, idx, pr.id);
            if (!r.ok) return;
            Au.play('coin');
            UI.log('<b>' + esc(p.name) + '</b>が「' + esc(pr.name) + '」に増資（Lv.' + r.level + '）。', 'buy');
            app.view.refresh(s); renderHud();
            render();
          });
        }
        list.appendChild(propRow(s, pr, { extra }));
      });
      body.appendChild(list);
    };
    render();
    await m.promise;
  }

  // ---------- カード売り場 ----------
  async function cpuCardShop(s, idx, st) {
    const p = s.players[idx];
    for (let i = 0; i < 3; i++) {
      await sleep(200);
      const id = AI.chooseCardBuy(s, idx, st);
      if (!id) break;
      const r = L.buyCard(s, idx, id);
      if (!r.ok) break;
      Au.play('card'); renderHud();
      UI.log('<b>' + esc(p.name) + '</b>がカード売り場で<b>' + esc(A.CARDS[id].name) + '</b>を購入。', 'card');
      await UI.banner({ title: esc(p.name) + 'がカードを購入', sub: esc(A.CARDS[id].name) + '（' + fmt(r.cost) + '）', kind: 'card', art: Art.cardArt(id) }, 900);
    }
  }

  async function humanCardShop(s, idx, st) {
    const p = s.players[idx];
    const body = h('div.cards-grid');
    const m = modal({ title: esc(st.name) + 'のカード売り場', body, dismiss: false, cls: 'modal--wide', actions: [{ label: 'おわる', value: true, color: 'pear' }] });
    const render = () => {
      body.innerHTML = '';
      body.appendChild(h('p.hint.span-all', { html: Art.coin(18) + ' 所持金 <b>' + fmt(p.cash) + '</b> ・ 手札 ' + p.cards.length + '/' + A.HAND_LIMIT + '枚。ほしいカードをえらんでね（買わなくてもOK）。' }));
      L.cardStock(s, st.id).forEach((cid) => {
        const c = A.CARDS[cid], price = L.cardPrice(s, cid);
        const full = p.cards.length >= A.HAND_LIMIT;
        const tile = h('button.card-tile.tone-' + c.tone, { type: 'button', disabled: p.cash < price || full, title: full ? '手札がいっぱいです' : '' },
          h('span.card-art', { html: Art.cardArt(cid) }), h('strong', c.name), h('small', c.desc), h('b.card-price', fmt(price)));
        tile.addEventListener('click', () => {
          const r = L.buyCard(s, idx, cid);
          if (!r.ok) return;
          Au.play('card');
          UI.log('<b>' + esc(p.name) + '</b>がカード売り場で<b>' + esc(c.name) + '</b>を購入。', 'card');
          renderHud(); render();
        });
        body.appendChild(tile);
      });
    };
    render();
    await m.promise;
  }

  // ======================================================================
  //  イベント演出
  // ======================================================================
  const pname = (i) => esc(app.state.players[i].name);

  async function handleEvent(e) {
    const s = app.state, v = app.view, sp = UI.rt.speed;
    const p = e.p != null ? s.players[e.p] : null;
    switch (e.t) {
      case 'turnStart': {
        v.setCurrent(e.p);
        renderHud();
        v.setRoute(app.prefs.route, s);
        v.focusNode(p.pos, v.comfyWidth(), 500);
        Au.play('turn');
        if (p.slow) UI.log('<b>' + pname(e.p) + '</b>は足止めされている…', 'bad');
        if (s.players.length > 1) await UI.banner({ title: esc(p.name) + 'の番', sub: p.type === 'cpu' ? 'CPU（' + LEVELS[p.level] + '）' : '', kind: 'turn', art: Art.character(p.char, 54) }, 750);
        else await sleep(150);
        break;
      }
      case 'cardDenied': UI.log(esc(e.reason), 'bad'); await UI.banner({ title: 'そのカードは使えません', sub: esc(e.reason), kind: 'bad' }, 1200); break;
      case 'card': await cardEvent(e); break;
      case 'roll': await rollEvent(e); break;
      case 'step': {
        Au.play('step');
        v.setCount(e.p, e.remaining > 0 ? e.remaining : null);
        v.focusNode(e.to, null, Math.round(260 * sp));
        await v.movePiece(s, e.p, e.to, Math.round(190 * sp));
        v.layoutPieces(s, false);
        renderHud();
        break;
      }
      case 'stopped': {
        v.setCount(e.p, null);
        const n = B.byId[e.node];
        if (n.type === 'station') v.pulseStation(n.station);
        break;
      }
      case 'arrive': await arriveEvent(e); break;
      case 'station': {
        const st = L.STATION[e.station];
        UI.log('<b>' + pname(e.p) + '</b>は' + esc(st.name) + '駅に止まった。');
        await stationBanner(st);
        break;
      }
      case 'square': await squareEvent(e); break;
      case 'cardStation': {
        Au.play('card'); renderHud();
        const c = A.CARDS[e.card];
        if (e.got && e.got.added) {
          UI.log('<b>' + pname(e.p) + '</b>はカード駅で<b>' + esc(c.name) + '</b>をもらった。', 'card');
          await UI.banner({ title: 'カード駅!', sub: esc(c.name) + 'をゲット', kind: 'card', art: Art.cardArt(e.card) }, 1300);
        } else await UI.banner({ title: 'カード駅!', sub: '手札がいっぱいで受け取れませんでした', kind: 'bad' }, 1200);
        break;
      }
      case 'godMove': {
        Au.play('god'); v.refresh(s); renderHud();
        UI.log('貧乏神が<b>' + pname(e.tr.from) + '</b>から<b>' + pname(e.tr.to) + '</b>へ移った!', 'bad');
        await UI.banner({ title: '貧乏神をなすりつけた!', sub: pname(e.tr.to) + 'に取りついた', kind: 'god', art: Art.god(46) }, 1500);
        break;
      }
      case 'godEffect': await godEffectEvent(e); break;
      case 'turnEnd': {
        v.setCount(e.p, null); v.refresh(s); renderHud();
        break;
      }
      default: break;
    }
  }

  async function cardEvent(e) {
    const s = app.state, v = app.view, c = A.CARDS[e.cardId], p = s.players[e.p], r = e.res;
    Au.play('card');
    UI.log('<b>' + pname(e.p) + '</b>が<b>' + esc(c.name) + '</b>を使った。', 'card');
    await UI.banner({ title: esc(c.name) + '!', sub: esc(c.desc), kind: 'card', art: Art.cardArt(e.cardId) }, 1000);
    if (r.kind === 'warp') { Au.play('warp'); await v.warpPiece(s, e.p, r.to); }
    else if (r.kind === 'stop') { UI.log('<b>' + pname(r.target) + '</b>は次の番、1マスしか進めない!', 'bad'); await UI.banner({ title: pname(r.target) + 'を足止め!', sub: '次の番は1マスしか進めません', kind: 'bad' }, 1100); }
    else if (r.kind === 'harai') { v.refresh(s); renderHud(); Au.play('coin'); await UI.banner({ title: '貧乏神が逃げていった!', sub: '次の目的地到着まで現れません', kind: 'win', art: Art.god(46) }, 1200); }
    else if (r.kind === 'bonus') { Au.play('coin'); v.pop(p.pos, '+' + fmt(r.amount), 'good'); }
    else if (r.kind === 'buyout') { Au.play('buy'); v.refresh(s); UI.log('<b>' + pname(e.p) + '</b>が「' + esc(r.prop.name) + '」を' + fmt(r.cost) + 'で買収!', 'buy'); await UI.banner({ title: '買収成功!', sub: esc(r.prop.name), kind: 'buy', art: Art.icon(r.prop.icon, 44) }, 1100); }
    v.refresh(s); renderHud();
  }

  async function rollEvent(e) {
    const box = $('#dice-box'), sp = UI.rt.speed;
    const dice = e.dice;
    Au.play('dice');
    box.className = 'dice-box is-rolling';
    const show = (vals) => { box.innerHTML = '<div class="dice-row">' + vals.map((x) => '<span class="die">' + Art.dice(x, dice.length > 2 ? 58 : 72) + '</span>').join('') + '</div>'; };
    const t0 = performance.now(), dur = 640 * sp;
    if (dur > 0 && !UI.rt.reduceMotion) {
      while (performance.now() - t0 < dur) {
        show(dice.map(() => 1 + Math.floor(Math.random() * 6)));
        await sleep(70);
      }
    }
    show(dice);
    box.className = 'dice-box is-result';
    const total = '<div class="dice-total">' + (e.slow ? '足止め中… 1マスだけ進む' : (dice.length > 1 ? dice.join(' + ') + ' = ' : '') + 'あと <b>' + e.total + '</b> マス') + '</div>';
    box.insertAdjacentHTML('beforeend', total);
    UI.log('<b>' + pname(e.p) + '</b>がサイコロ: ' + (e.slow ? '足止めで1マス' : dice.join(' + ') + (dice.length > 1 ? ' = ' + e.total : '')), 'roll');
    app.view.setCount(e.p, e.total);
    await sleep(750);
    box.className = 'dice-box';
    box.innerHTML = '';
  }

  async function arriveEvent(e) {
    const s = app.state, v = app.view, r = e.res, p = s.players[e.p], dest = L.STATION[r.oldDest];
    Au.play('fanfare'); UI.confetti($('#stage'), 50);
    v.pop(p.pos, '+' + fmt(r.bonus), 'good');
    UI.log('<b>' + pname(e.p) + '</b>が目的地<b>' + esc(dest.name) + '</b>に一番乗り! ボーナス ' + fmt(r.bonus), 'win');
    v.refresh(s); renderHud();
    await UI.banner({ title: '目的地に到着!', sub: esc(p.name) + 'に ' + fmt(r.bonus) + ' のボーナス', kind: 'win', art: Art.flag(50) }, 1900);
    if (r.godTo !== r.godFrom || r.hadGod) {
      if (r.godTo >= 0 && r.godTo !== r.godFrom) {
        Au.play('god');
        UI.log('貧乏神が<b>' + pname(r.godTo) + '</b>に取りついた!', 'bad');
        await UI.banner({ title: '貧乏神が出た!', sub: pname(r.godTo) + 'に取りついた', kind: 'god', art: Art.god(46) }, 1700);
      } else if (r.godTo < 0 && r.hadGod) {
        UI.log('貧乏神が' + pname(e.p) + 'から離れた。', 'win');
        await UI.banner({ title: '貧乏神が離れた!', kind: 'win', art: Art.god(46) }, 1200);
      }
    }
    v.refresh(s); renderHud();
    // 新しい目的地を見せる
    if (v.follow) {
      v.setCam({ cx: B.byId[r.newDest].x, cy: B.byId[r.newDest].y, w: 620 }, 500);
      await UI.banner({ title: '次の目的地は…', sub: esc(L.STATION[r.newDest].name) + '!', kind: 'info', art: Art.flag(46) }, 1400);
      v.focusNode(p.pos, v.comfyWidth(), 500);
    } else await UI.banner({ title: '次の目的地は' + esc(L.STATION[r.newDest].name) + '!', kind: 'info', art: Art.flag(46) }, 1200);
  }

  async function squareEvent(e) {
    const s = app.state, v = app.view, eff = e.eff, p = s.players[e.p];
    switch (eff.kind) {
      case 'blue':
        Au.play('coin'); v.pop(p.pos, '+' + fmt(eff.amount), 'good'); renderHud();
        UI.log('<b>' + pname(e.p) + '</b>は青マスで ' + fmt(eff.amount) + ' もらった。', 'good');
        await sleep(520); break;
      case 'red':
        Au.play('bad'); v.pop(p.pos, '-' + fmt(eff.amount), 'bad'); renderHud();
        UI.log('<b>' + pname(e.p) + '</b>は赤マスで ' + fmt(eff.amount) + ' とられた。', 'bad');
        await sleep(520); break;
      case 'yellow': {
        const c = A.CARDS[eff.card];
        Au.play('card'); renderHud();
        if (eff.got && eff.got.added) {
          UI.log('<b>' + pname(e.p) + '</b>は黄マスで<b>' + esc(c.name) + '</b>をもらった。', 'card');
          await UI.banner({ title: 'カードをゲット!', sub: esc(c.name) + (isHuman(e.p) || s.players.every((q) => q.type === 'cpu') ? '（' + esc(c.desc) + '）' : ''), kind: 'card', art: Art.cardArt(eff.card) }, 1300);
        } else await UI.banner({ title: 'カードがもらえたけど…', sub: '手札がいっぱいで受け取れませんでした', kind: 'bad' }, 1200);
        break;
      }
      case 'event': await eventSquare(e, eff); break;
      default: break;
    }
  }

  async function eventSquare(e, eff) {
    const s = app.state, v = app.view, p = s.players[e.p];
    const good = eff.delta > 0 || (eff.card && !eff.delta);
    Au.play(good ? 'coin' : (eff.delta < 0 || eff.lostCard) ? 'bad' : 'card');
    if (eff.delta) v.pop(p.pos, (eff.delta > 0 ? '+' : '-') + fmt(Math.abs(eff.delta)), eff.delta > 0 ? 'good' : 'bad');
    let sub = '';
    if (eff.delta) sub = (eff.delta > 0 ? '+' : '-') + fmt(Math.abs(eff.delta));
    if (eff.card) sub += (sub ? ' ・ ' : '') + (eff.got && eff.got.added ? A.CARDS[eff.card].name + 'をゲット' : '手札がいっぱいで受け取れない');
    if (eff.lostCard) sub += (sub ? ' ・ ' : '') + A.CARDS[eff.lostCard].name + 'をなくした';
    renderHud();
    UI.log('<b>' + pname(e.p) + '</b> ' + esc(eff.ev.text) + (sub ? ' (' + esc(sub) + ')' : ''), good ? 'good' : 'bad');
    await UI.banner({ title: esc(eff.ev.text), sub: esc(sub), kind: good ? 'win' : 'bad', art: Art.icon('festival', 44) }, 2100);
  }

  async function godEffectEvent(e) {
    const s = app.state, v = app.view, ge = e.ge;
    Au.play('god');
    let sub = '';
    if (ge.kind === 'money') { sub = fmt(ge.amount) + ' をとられた'; v.pop(s.players[e.p].pos, '-' + fmt(ge.amount), 'bad'); }
    else if (ge.kind === 'card') sub = A.CARDS[ge.card].name + 'をなくした';
    else if (ge.kind === 'sell') { sub = '「' + ge.prop.name + '」を半額で売られた'; v.refresh(s); }
    UI.log('貧乏神のいたずら! <b>' + pname(e.p) + '</b>は' + esc(sub) + '。', 'bad');
    renderHud();
    await UI.banner({ title: '貧乏神のいたずら!', sub: pname(e.p) + ': ' + esc(sub), kind: 'god', art: Art.god(46) }, 1700);
  }

  // ======================================================================
  //  決算・結果
  // ======================================================================
  async function showSettlement(res) {
    const s = app.state;
    Au.play('settle');
    const maxA = Math.max.apply(null, res.results.map((r) => r.assets).concat([1]));
    const body = h('div.settle');
    const list = h('ol.settle-list');
    res.ranking.forEach((idx, rank) => {
      const r = res.results[idx], p = s.players[idx];
      const mono = r.items.filter((it) => it.mono).length;
      const top = r.items.slice().sort((a, b) => b.income - a.income).slice(0, 3);
      const li = h('li.settle-row.r' + (rank + 1), { style: { '--pc': A.CHARS[p.char % A.CHARS.length].color } },
        h('span.settle-rank', String(rank + 1)),
        h('span.settle-badge', { html: Art.character(p.char, 40) }),
        h('div.settle-main',
          h('strong', esc(p.name)),
          h('small', '物件 ' + r.items.length + '件' + (mono ? '（独占 ' + mono + '駅分）' : '') + ' ・ 収入 ' + fmt(r.total) + (r.bonus ? '（食品日本一 +' + fmt(r.bonus) + '）' : '')),
          top.length ? h('small.settle-top', top.map((it) => it.prop.name + ' +' + fmt(it.income)).join(' / ')) : null,
          h('span.bar', h('i', { style: { width: Math.max(2, Math.round(Math.max(0, r.assets) / maxA * 100)) + '%' } }))),
        h('span.settle-assets', h('small', '資産'), h('b', { 'data-n': r.assets }, fmt(r.assets))));
      list.appendChild(li);
    });
    body.appendChild(list);
    if (res.foodAwards && res.foodAwards.length) {
      body.appendChild(h('div.food-awards', h('strong', { html: Art.icon('food', 20) + ' 今年の食品日本一' }),
        res.foodAwards.map((a) => h('p', '「' + a.prop.name + '」' + (a.owner >= 0 ? ' → 持ち主の' + esc(s.players[a.owner].name) + 'に ' + fmt(a.amount) + ' の臨時収入!' : '（持ち主がいなかった…）')))));
    }
    body.appendChild(h('p.hint', '3月の決算です。持っている物件の収入が入りました。'));
    const everyCpu = s.players.every((p) => p.type === 'cpu');
    const m = modal({ title: res.year + '年目の決算', body, dismiss: false, cls: 'modal--wide', actions: [{ label: s.finished || res.year >= s.config.years ? '結果を見る' : '次の年へ', value: true }] });
    renderHud(); app.view.refresh(s);
    UI.log(res.year + '年目の決算。1位は<b>' + esc(s.players[res.ranking[0]].name) + '</b>(' + fmt(res.results[res.ranking[0]].assets) + ')', 'sys');
    if (everyCpu) { setTimeout(() => m.close(true), Math.max(400, 2600 * UI.rt.speed)); }
    await m.promise;
  }

  function lineChart(s) {
    const data = s.yearly, n = s.players.length;
    if (data.length < 2) return '';
    const W = 560, H = 190, pad = { l: 12, r: 12, t: 12, b: 24 };
    let max = 1, min = 0;
    data.forEach((d) => d.assets.forEach((v) => { max = Math.max(max, v); min = Math.min(min, v); }));
    const x = (i) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
    let g = '';
    for (let k = 0; k < n; k++) {
      const col = A.CHARS[s.players[k].char % A.CHARS.length].color;
      const pts = data.map((d, i) => x(i).toFixed(1) + ',' + y(d.assets[k]).toFixed(1)).join(' ');
      g += '<polyline points="' + pts + '" fill="none" style="stroke:' + col + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>';
      g += data.map((d, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(d.assets[k]).toFixed(1) + '" r="4.500" style="fill:' + col + '" stroke="var(--color-paper)" stroke-width="2"/>').join('');
    }
    const labels = data.map((d, i) => '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="chart-lab">' + d.year + '年目</text>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="資産のうつりかわり"><line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="chart-zero"/>' + g + labels + '</svg>';
  }

  async function finishGame() {
    const s = app.state;
    lsDel(SAVE_KEY);
    UI.closeAllModals();
    const rank = L.ranking(s), awards = L.awards(s);
    const top = s.players[rank[0]];
    const topTied = rank.filter((i) => L.assets(s, i) === L.assets(s, rank[0]));
    const scr = $('#screen-result');
    scr.innerHTML = '';
    const podiumOrder = [1, 0, 2].filter((k) => rank[k] != null);
    const podium = h('div.podium');
    podiumOrder.forEach((k) => {
      const p = s.players[rank[k]];
      podium.appendChild(h('div.pod.pod' + (k + 1), { style: { '--pc': A.CHARS[p.char % A.CHARS.length].color } },
        k === 0 ? h('span.pod-trophy', { html: Art.trophy(46) }) : null,
        h('span.pod-char', { html: Art.character(p.char, k === 0 ? 84 : 64) }),
        h('strong', esc(p.name)),
        h('small', fmt(L.assets(s, p.id))),
        h('span.pod-step', String(k + 1))));
    });
    const best = s.players.length === 1 ? updateBest(s) : null;
    const table = h('table.result-table',
      h('thead', h('tr', ['順位', 'なまえ', '所持金', '物件', '資産ごうけい'].map((t) => h('th', t)))),
      h('tbody', rank.map((i, r) => {
        const p = s.players[i], props = L.ownedProps(s, i);
        return h('tr.rt-row.r' + (r + 1), h('td', String(r + 1)), h('td', { html: Art.character(p.char, 26) + '<span>' + esc(p.name) + '</span>' }),
          h('td', fmt(p.cash)), h('td', props.length + '件 (' + fmt(props.reduce((a, b) => a + L.propPrice(s, b), 0)) + ')'), h('td', h('b', fmt(L.assets(s, i)))));
      })));
    const aw = h('div.awards', awards.map((a) => h('div.award', h('strong', a.title), h('span', a.who.map((i) => esc(s.players[i].name)).join('・')), h('small', a.desc))));
    const wrap = h('div.result-wrap',
      h('h2', s.players.length === 1 ? 'ゲームしゅうりょう!' : topTied.length > 1 ? '同点で引き分け!' : esc(top.name) + 'の優勝!'),
      s.players.length === 1 ? h('p.result-solo', '最終資産 ', h('b', fmt(L.assets(s, 0))), best ? h('small', best) : null) : podium,
      h('div.result-card', h('h3', '最終結果'), h('div.table-scroll', table)),
      s.yearly.length > 1 ? h('div.result-card', h('h3', '資産のうつりかわり'), h('div', { html: lineChart(s) }),
        h('div.legend', s.players.map((p) => h('span', { style: { '--pc': A.CHARS[p.char % A.CHARS.length].color } }, h('i'), esc(p.name))))) : null,
      awards.length ? h('div.result-card', h('h3', 'ひょうしょう'), aw) : null,
      h('div.result-actions',
        h('button.btn.btn--pear', { type: 'button', onclick: () => { Au.play('click'); startGame(L.newGame(app.lastCfg)); } }, 'おなじ設定でもう一度'),
        h('button.btn.btn--cyan.btn--soft', { type: 'button', onclick: () => { Au.play('click'); openSetup(app.lastCfg.mode); } }, '設定をかえる'),
        h('button.btn.btn--ink.btn--outline', { type: 'button', onclick: () => { Au.play('click'); renderTitle(); } }, 'タイトルへ')));
    scr.appendChild(wrap);
    showScreen('screen-result');
    Au.play('fanfare'); UI.confetti(scr, 70);
    scr.scrollTop = 0;
  }
  function updateBest(s) {
    const key = 'aichi-dentetsu-best-' + s.config.years;
    const prev = lsGet(key), now = L.assets(s, 0);
    if (prev == null || now > prev) { lsSet(key, now); return prev == null ? '' : 'ベスト更新!（前回 ' + fmt(prev) + '）'; }
    return 'ベスト ' + fmt(prev);
  }

  // ======================================================================
  //  デバッグ（ひとりモード専用）
  // ======================================================================
  async function openDebug() {
    const s = app.state, p = s.players[L.current(s)], idx = p.id;
    const stOpts = (sel) => A.STATIONS.map((st) => '<option value="' + st.id + '"' + (st.id === sel ? ' selected' : '') + '>' + st.name + '</option>').join('');
    const body = h('div.debug');
    body.innerHTML = `
      <section><h4>サイコロの目を決める</h4>
        <div class="dbg-row"><input id="dbg-n" type="number" min="1" max="40" value="${s.debugDice ? s.debugDice[0] : 6}" aria-label="進むマス数"><button class="btn btn--pear btn--sm" data-d="dice" type="button">次の目にする</button>
        <span class="hint" id="dbg-dice-note">${s.debugDice ? '次の目: ' + s.debugDice[0] : '指定なし'}</span></div></section>
      <section><h4>お金・カード・貧乏神</h4>
        <div class="dbg-row">
          <button class="btn btn--mint btn--soft btn--sm" data-d="money1" type="button">+1000万円</button>
          <button class="btn btn--mint btn--soft btn--sm" data-d="money2" type="button">+1億円</button>
          <button class="btn btn--cyan btn--soft btn--sm" data-d="cards" type="button">カードを全種類</button>
          <button class="btn btn--coral btn--soft btn--sm" data-d="god" type="button">貧乏神 ON/OFF</button></div></section>
      <section><h4>目的地・ワープ</h4>
        <div class="dbg-row"><select id="dbg-dest" aria-label="目的地">${stOpts(s.dest)}</select><button class="btn btn--ink btn--soft btn--sm" data-d="dest" type="button">目的地にする</button></div>
        <div class="dbg-row"><select id="dbg-warp" aria-label="ワープ先">${stOpts(p.pos)}</select><button class="btn btn--ink btn--soft btn--sm" data-d="warp" type="button">ここへ移動</button></div></section>
      <section><h4>物件・決算</h4>
        <div class="dbg-row">
          <button class="btn btn--pear btn--soft btn--sm" data-d="buyhere" type="button">いまの駅の物件を全部もらう</button>
          <button class="btn btn--lav btn--soft btn--sm" data-d="settle" type="button">決算を今すぐ実行</button></div></section>
      <p class="hint">動作確認用の機能です。ここでの変更は、そのままゲームに反映されます。</p>`;
    const m = modal({ title: 'デバッグ', body, cls: 'modal--wide', actions: [{ label: 'とじる', value: true }] });
    const refresh = () => { app.view.refresh(s); renderHud(); };
    body.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-d]'); if (!b) return;
      const d = b.getAttribute('data-d'); Au.play('click');
      if (d === 'dice') { const n = Math.max(1, Math.min(40, Number($('#dbg-n', body).value) || 1)); s.debugDice = [n]; $('#dbg-dice-note', body).textContent = '次の目: ' + n; }
      else if (d === 'money1') { p.cash += 1000; refresh(); }
      else if (d === 'money2') { p.cash += 10000; refresh(); }
      else if (d === 'cards') { Object.keys(A.CARDS).forEach((c) => L.gainCard(s, p, c)); refresh(); UI.log('デバッグ: カードを追加（手札は最大' + A.HAND_LIMIT + '枚）', 'sys'); }
      else if (d === 'god') { p.god = !p.god; s.godHolder = p.god ? idx : -1; refresh(); }
      else if (d === 'dest') { s.dest = $('#dbg-dest', body).value; refresh(); }
      else if (d === 'warp') { p.prev = null; p.pos = $('#dbg-warp', body).value; refresh(); app.view.forceFocus(p.pos, null, 300); }
      else if (d === 'buyhere') {
        const n = B.byId[p.pos];
        if (n.type === 'station') { L.STATION[n.station].props.forEach((pr) => { s.owners[pr.id] = idx; }); refresh(); } else UI.log('駅のマスにいるときだけ使えます。', 'bad');
      } else if (d === 'settle') { m.close(true); const r = L.settle(s); await showSettlement(r); }
    });
    await m.promise;
  }

  // ======================================================================
  //  起動
  // ======================================================================
  function init() {
    loadPrefs();
    renderTitle();
    $('#btn-rules').addEventListener('click', () => { Au.unlock(); Au.play('click'); showRules(); });
    $('#btn-sound-title').addEventListener('click', toggleSound);
    $('#btn-editor').addEventListener('click', () => { Au.unlock(); Au.play('click'); A.Editor.open(); });
    $('#btn-setup-back').addEventListener('click', () => { Au.play('click'); renderTitle(); });
    $('#btn-start').addEventListener('click', () => {
      Au.unlock(); Au.play('click');
      const cfg = buildConfig();
      app.lastCfg = cfg;
      startGame(L.newGame(cfg));
    });
    $('#btn-continue').addEventListener('click', () => {
      Au.unlock(); Au.play('click');
      const save = lsGet(SAVE_KEY);
      if (!save || !save.state) return renderTitle();
      app.lastCfg = { years: save.state.config.years, mode: save.state.config.mode, debug: save.state.config.debug, players: save.state.players.map((p) => ({ name: p.name, type: p.type, level: p.level, char: p.char })) };
      startGame(save.state);
    });
  }

  /** 自動テストや動作確認から呼べる入口（ブラウザの console から A.app.quickStart(...) など） */
  function quickStart(cfg, seed) {
    app.lastCfg = cfg;
    startGame(L.newGame(cfg, seed));
  }

  Object.assign(A, { app: Object.assign(app, { init, quickStart, startGame, quitToTitle }) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
