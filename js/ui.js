/* あいち電鉄 — 画面まわりの共通部品（DOM 生成・モーダル・バナー・待ち時間） */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const doc = root.document;

  class Aborted extends Error {}

  const rt = { speed: 1, paused: false, runId: 0, waiters: [], reduceMotion: false };
  try { rt.reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* 無視 */ }

  const $ = (sel, el) => (el || doc).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || doc).querySelectorAll(sel));

  /** h('div.cls#id', {attr}, ...children) — 小さな DOM ビルダー */
  function h(spec, attrs, ...kids) {
    const m = /^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i.exec(spec);
    const el = doc.createElement(m && m[1] ? m[1] : 'div');
    if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; return ''; });
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    } else if (attrs != null) kids.unshift(attrs);
    kids.flat().forEach((c) => { if (c == null || c === false) return; el.appendChild(c instanceof Node ? c : doc.createTextNode(String(c))); });
    return el;
  }
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 待ち時間（速度・一時停止・中断に対応） ----------
  function sleep(ms) {
    const tok = rt.runId;
    return new Promise((resolve, reject) => {
      const done = async () => {
        while (rt.paused) await new Promise((r) => rt.waiters.push(r));
        if (tok !== rt.runId) reject(new Aborted()); else resolve();
      };
      const wait = rt.speed <= 0 ? 0 : ms * rt.speed;
      setTimeout(done, wait);
    });
  }
  function setPaused(v) {
    rt.paused = !!v;
    if (!v) { const w = rt.waiters.splice(0); w.forEach((r) => r()); }
  }
  function guard(tok) { if (tok !== rt.runId) throw new Aborted(); }

  // ---------- モーダル ----------
  const stack = [];
  function modal(opts) {
    const o = Object.assign({ title: '', body: '', actions: [], cls: '', dismiss: true }, opts);
    const root_ = $('#modal-root');
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const back = h('div.modal-back');
    const box = h('div.modal' + (o.cls ? '.' + o.cls.split(' ').join('.') : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'ダイアログ' });
    if (o.title) box.appendChild(h('h2.modal-title', { html: o.title }));
    const content = h('div.modal-body');
    if (typeof o.body === 'string') content.innerHTML = o.body; else if (o.body) content.appendChild(o.body);
    box.appendChild(content);
    let closed = false;
    const api = { el: box, body: content, promise, close };
    function close(value) {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      back.classList.add('is-leaving');
      setTimeout(() => back.remove(), rt.reduceMotion ? 0 : 160);
      resolve(value);
    }
    if (o.actions.length) {
      const bar = h('div.modal-actions');
      o.actions.forEach((a) => {
        const b = h('button.btn.btn--' + (a.color || 'pear') + (a.kind === 'soft' ? '.btn--soft' : a.kind === 'outline' ? '.btn--outline' : ''), { type: 'button', html: a.label, disabled: !!a.disabled });
        b.addEventListener('click', () => { A.Audio.play('click'); close(a.value); });
        bar.appendChild(b);
      });
      box.appendChild(bar);
    }
    if (o.dismiss) {
      back.addEventListener('pointerdown', (e) => { if (e.target === back) close(undefined); });
      const x = h('button.modal-x', { type: 'button', 'aria-label': '閉じる', html: '×' });
      x.addEventListener('click', () => close(undefined));
      box.appendChild(x);
    }
    back.appendChild(box);
    root_.appendChild(back);
    stack.push(api);
    const first = $('.btn:not([disabled])', box);
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    return api;
  }
  function closeAllModals() { stack.slice().forEach((m) => m.close(undefined)); }
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) { const top = stack[stack.length - 1]; if (top.el.querySelector('.modal-x')) top.close(undefined); }
  });
  const alertBox = (title, body) => modal({ title, body, actions: [{ label: 'OK', value: true }] }).promise;
  const confirmBox = (title, body, yes, no) => modal({ title, body, actions: [{ label: no || 'やめる', value: false, kind: 'outline', color: 'ink' }, { label: yes || 'OK', value: true }] }).promise;

  // ---------- バナー・ログ ----------
  // バナーは時間で消える。タップすると、待たずにすぐ次へ進む
  let bannerSkip = null;
  async function banner(o, ms) {
    const el = $('#banner');
    el.className = 'banner is-show banner--' + (o.kind || 'info');
    el.innerHTML = (o.art ? '<div class="banner-art">' + o.art + '</div>' : '') +
      '<div class="banner-text"><strong>' + (o.title || '') + '</strong>' + (o.sub ? '<span>' + o.sub + '</span>' : '') + '</div>';
    const wait = sleep(ms || 1100);
    wait.catch(() => {}); // タップで先に進んだあとに中断されても、エラーにしない
    try { await Promise.race([wait, new Promise((r) => { bannerSkip = r; })]); } finally {
      bannerSkip = null;
      el.classList.remove('is-show');
    }
  }
  doc.addEventListener('click', (e) => { if (bannerSkip && e.target.closest && e.target.closest('#banner')) bannerSkip(); });
  function log(text, kind) {
    const ol = $('#log');
    if (!ol) return;
    const li = h('li.log-item' + (kind ? '.log-' + kind : ''), { html: text });
    ol.insertBefore(li, ol.firstChild);
    while (ol.children.length > 80) ol.removeChild(ol.lastChild);
  }

  // ---------- 数字のカウントアップ ----------
  function countUp(el, from, to, ms, fmt) {
    const f = fmt || String;
    if (rt.reduceMotion || ms <= 0 || from === to) { el.textContent = f(to); return; }
    const t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      el.textContent = f(Math.round(from + (to - from) * e));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- 紙吹雪（SVG） ----------
  function confetti(host, n) {
    if (rt.reduceMotion) return;
    const colors = ['var(--color-accent)', 'var(--color-accent-2)', 'var(--color-accent-3)', 'var(--color-mint)', 'var(--color-lavender)'];
    const layer = h('div.confetti');
    for (let i = 0; i < (n || 40); i++) {
      const s = 6 + Math.random() * 8;
      const piece = h('i', { style: {
        left: Math.random() * 100 + '%', width: s + 'px', height: s * (0.5 + Math.random() * 0.8) + 'px',
        background: colors[i % colors.length], animationDelay: Math.random() * 0.4 + 's', animationDuration: 1.4 + Math.random() * 1.2 + 's',
        '--dx': (Math.random() * 120 - 60) + 'px', '--rot': (Math.random() * 720 - 360) + 'deg',
      } });
      layer.appendChild(piece);
    }
    host.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  Object.assign(A, { UI: { Aborted, rt, $, $$, h, esc, sleep, setPaused, guard, modal, closeAllModals, alert: alertBox, confirm: confirmBox, banner, log, countUp, confetti } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
