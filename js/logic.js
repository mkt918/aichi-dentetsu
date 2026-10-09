/* あいち電鉄 — ゲームルール（画面に依存しない。Node でもそのままテストできる）
 * 状態(state)はすべて JSON にできるプレーンな値だけで持つ（途中セーブのため）。
 * ターンの進行は runTurn(state, driver) に集約し、画面や CPU は driver として差し込む。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const B = A.Board;

  const STATION = {}; const PROP = {};
  A.STATIONS.forEach((s) => { STATION[s.id] = s; s.props.forEach((p) => { PROP[p.id] = p; }); });

  const START_CASH = 3000;
  const START_STATION = 'nagoya';

  // ---------- 乱数（state.rng を進めるので、セーブ＆再現ができる） ----------
  function rnd(s) {
    s.rng = (s.rng + 0x6d2b79f5) >>> 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rint = (s, n) => Math.floor(rnd(s) * n);
  const round10 = (x) => Math.round(x / 10) * 10;

  // ---------- 表示用の整形 ----------
  function fmt(man) {
    const neg = man < 0;
    const v = Math.abs(Math.round(man));
    const oku = Math.floor(v / 10000), rest = v % 10000;
    let str;
    if (oku > 0) str = oku + '億' + (rest > 0 ? rest + '万' : '');
    else str = rest + '万';
    return (neg ? '-' : '') + str + '円';
  }

  // ---------- カレンダー ----------
  function calendar(s) {
    const r = Math.min(s.round, s.config.years * 12 - 1);
    return { year: Math.floor(r / 12) + 1, month: ((r + 3) % 12) + 1, round: s.round };
  }
  /** 金額の倍率。年が進むほど、また、みんなの資産がふえるほど大きくなる（青マスやボーナスが相場に合う） */
  function yf(s) {
    const avg = s.players.reduce((a, p) => a + assetsRaw(s, p.id), 0) / Math.max(1, s.players.length);
    return 1 + 0.25 * (calendar(s).year - 1) + Math.max(0, avg) / 40000;
  }

  function current(s) { return (s.round + s.turnIdx) % s.players.length; }

  // ---------- 新しいゲーム ----------
  function freshTurn() { return { cardUsed: false, dice: 1, fixed: null, sale: false, warped: false, slow: false }; }

  function newGame(cfg, seed) {
    const players = cfg.players.map((pc, i) => ({
      id: i, name: pc.name || 'プレイヤー' + (i + 1), type: pc.type || 'human', level: pc.level || 2,
      char: pc.char != null ? pc.char : i, pos: START_STATION, prev: null, cash: START_CASH, cards: [],
      god: false, slow: false,
      stats: { dest: 0, steps: 0, income: 0, bought: 0, godTurns: 0, bonus: 0 },
    }));
    const s = {
      v: 1, rng: ((seed != null ? seed : Math.random() * 4294967296) >>> 0),
      config: { years: cfg.years || 1, debug: !!cfg.debug, mode: cfg.mode || 'versus' },
      round: 0, turnIdx: 0, players, owners: {}, levels: {}, dest: null, destBase: 0, godHolder: -1,
      turn: freshTurn(), log: [], finished: false, yearly: [],
    };
    players.forEach((p) => gainCard(s, p, drawCard(s)));
    pickDest(s);
    return s;
  }

  // ---------- 資産・物件 ----------
  function ownedProps(s, idx) { return Object.keys(s.owners).filter((id) => s.owners[id] === idx).map((id) => PROP[id]); }
  /** 増資で値上がりした、いまの物件価格 */
  function propPrice(s, prop) { return Math.round(prop.price * (1 + 0.5 * ((s.levels && s.levels[prop.id]) || 0))); }
  const MAX_LEVEL = 3;
  function assetsRaw(s, idx) { return s.players[idx].cash + ownedProps(s, idx).reduce((a, p) => a + propPrice(s, p), 0); }
  function assets(s, idx) { return assetsRaw(s, idx); }
  function ranking(s) {
    return s.players.map((p) => p.id).sort((a, b) => assets(s, b) - assets(s, a) || ownedProps(s, b).length - ownedProps(s, a).length || a - b);
  }
  /** 駅の物件をすべて同じ人が持っていれば、その人の番号。そうでなければ -1 */
  function monopolyOwner(s, stationId) {
    const props = STATION[stationId].props;
    if (!props.length) return -1;
    const o = s.owners[props[0].id];
    if (o === undefined) return -1;
    return props.every((p) => s.owners[p.id] === o) ? o : -1;
  }
  function propIncome(s, prop) {
    const base = Math.round((propPrice(s, prop) * prop.rate) / 100);
    const o = s.owners[prop.id];
    return monopolyOwner(s, prop.station) === o && o !== undefined ? base * 2 : base;
  }
  const saleOf = (s, v) => (s.turn && s.turn.sale ? Math.round(v / 2) : v);
  function priceFor(s, prop) { return saleOf(s, prop.price); }
  /** 増資にかかるお金（元の価格の半分。半額セール中はさらに半分） */
  function investCost(s, prop) { return saleOf(s, Math.round(prop.price * 0.5)); }

  function buy(s, idx, propId) {
    const p = s.players[idx], prop = PROP[propId];
    if (!prop || s.owners[propId] !== undefined) return { ok: false, reason: 'owned' };
    const price = priceFor(s, prop);
    if (p.cash < price) return { ok: false, reason: 'cash' };
    p.cash -= price; s.owners[propId] = idx; p.stats.bought++;
    return { ok: true, price, prop };
  }
  /** 増資: 自分の物件の価格を元の価格の半分ずつ上げる（最大3回）。利回りはそのままなので、収入がふえる */
  function invest(s, idx, propId) {
    const p = s.players[idx], prop = PROP[propId];
    if (!prop || s.owners[propId] !== idx) return { ok: false, reason: 'notmine' };
    const lv = (s.levels[propId] || 0);
    if (lv >= MAX_LEVEL) return { ok: false, reason: 'max' };
    const cost = investCost(s, prop);
    if (p.cash < cost) return { ok: false, reason: 'cash' };
    p.cash -= cost; s.levels[propId] = lv + 1;
    return { ok: true, cost, level: lv + 1, prop };
  }

  // ---------- カード ----------
  function drawCard(s) {
    const ids = Object.keys(A.CARDS);
    const total = ids.reduce((a, id) => a + A.CARDS[id].weight, 0);
    let r = rnd(s) * total;
    for (const id of ids) { r -= A.CARDS[id].weight; if (r < 0) return id; }
    return ids[0];
  }
  function gainCard(s, p, cardId) {
    if (p.cards.length >= A.HAND_LIMIT) return false;
    p.cards.push(cardId); return true;
  }
  function buyoutTargets(s, idx) {
    const p = s.players[idx];
    const node = B.byId[p.pos];
    if (node.type !== 'station') return [];
    return STATION[node.station].props.filter((pr) => s.owners[pr.id] !== undefined && s.owners[pr.id] !== idx && p.cash >= propPrice(s, pr) * 2);
  }
  function canUseCard(s, idx, cardId) {
    const p = s.players[idx], c = A.CARDS[cardId];
    if (!c || !p.cards.includes(cardId)) return { ok: false, reason: '持っていません' };
    if (s.turn.cardUsed) return { ok: false, reason: 'カードは1回の番に1枚までです' };
    if (c.kind === 'target' && s.players.length < 2) return { ok: false, reason: '相手がいません' };
    if (c.kind === 'self' && !p.god) return { ok: false, reason: '貧乏神がついていません' };
    if (c.kind === 'stay' && B.byId[p.pos].type !== 'station') return { ok: false, reason: '駅にいるときだけ使えます' };
    if (c.kind === 'buyout' && !buyoutTargets(s, idx).length) return { ok: false, reason: '買収できる物件がありません(いまの駅にライバルの物件があり、お金が足りているときだけ)' };
    return { ok: true };
  }
  /** カードを使う。arg: warp=駅ID / target=相手の番号 / buyout=物件ID */
  function applyCard(s, idx, cardId, arg) {
    const chk = canUseCard(s, idx, cardId);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const p = s.players[idx], c = A.CARDS[cardId];
    if (c.kind === 'warp' && !STATION[arg]) return { ok: false, reason: '行き先を選んでください' };
    if (c.kind === 'target' && (arg == null || arg === idx || !s.players[arg])) return { ok: false, reason: '相手を選んでください' };
    if (c.kind === 'buyout' && !buyoutTargets(s, idx).some((pr) => pr.id === arg)) return { ok: false, reason: '物件を選んでください' };
    p.cards.splice(p.cards.indexOf(cardId), 1);
    s.turn.cardUsed = true;
    switch (c.kind) {
      case 'dice': s.turn.dice = c.dice; s.turn.fixed = c.fixed || null; return { ok: true, kind: 'dice', dice: c.dice, fixed: c.fixed || null };
      case 'warp': { const from = p.pos; p.prev = null; p.pos = arg; s.turn.warped = true; return { ok: true, kind: 'warp', from, to: arg }; }
      case 'target': s.players[arg].slow = true; return { ok: true, kind: 'stop', target: arg };
      case 'self': p.god = false; s.godHolder = -1; return { ok: true, kind: 'harai' };
      case 'money': { const amount = round10(1000 * yf(s)); p.cash += amount; return { ok: true, kind: 'bonus', amount }; }
      case 'sale': s.turn.sale = true; return { ok: true, kind: 'sale' };
      case 'stay': s.turn.warped = true; return { ok: true, kind: 'stay' };
      case 'buyout': {
        const prop = PROP[arg], from = s.owners[arg], cost = propPrice(s, prop) * 2;
        p.cash -= cost; s.players[from].cash += cost; s.owners[arg] = idx; p.stats.bought++;
        return { ok: true, kind: 'buyout', prop, from, cost };
      }
      default: return { ok: false, reason: '未対応のカード' };
    }
  }

  // ---------- カード売り場 ----------
  function cardPrice(s, cardId) { return round10(A.CARDS[cardId].price * yf(s)); }
  /** 売り場に並ぶカード（月と駅で決まるので、何度のぞいても同じ） */
  function cardStock(s, stationId) {
    const ids = Object.keys(A.CARDS).filter((id) => A.CARDS[id].price > 0);
    const seed = (s.round * 131 + A.STATIONS.findIndex((st) => st.id === stationId) * 17 + 7) >>> 0;
    const rnd2 = B.mulberry32(seed);
    const pool = ids.slice(), out = [];
    for (let i = 0; i < 4 && pool.length; i++) out.push(pool.splice(Math.floor(rnd2() * pool.length), 1)[0]);
    return out;
  }
  function buyCard(s, idx, cardId) {
    const p = s.players[idx];
    if (p.cards.length >= A.HAND_LIMIT) return { ok: false, reason: 'full' };
    const cost = cardPrice(s, cardId);
    if (p.cash < cost) return { ok: false, reason: 'cash' };
    p.cash -= cost; p.cards.push(cardId);
    return { ok: true, cost };
  }

  // ---------- 目的地・貧乏神 ----------
  function pickDest(s) {
    const cands = A.STATIONS.filter((st) => st.id !== s.dest && !s.players.some((p) => p.pos === st.id));
    const minD = (st) => Math.min.apply(null, s.players.map((p) => B.distFrom(st.id)[p.pos]));
    // 目的地は、いちばん近い人から 9〜30 マス先の駅をえらぶ（マスが多いぶん、遠すぎると遊びのテンポが落ちる）
    let pool = cands.filter((st) => minD(st) >= 9 && minD(st) <= 30);
    if (!pool.length) pool = cands.filter((st) => minD(st) >= 9);
    if (!pool.length) pool = cands;
    const st = pool[rint(s, pool.length)];
    const avg = s.players.reduce((a, p) => a + B.distFrom(st.id)[p.pos], 0) / s.players.length;
    s.dest = st.id;
    s.destBase = round10(2000 + 70 * avg);
    return st.id;
  }
  function destBonus(s) { return round10(s.destBase * yf(s)); }

  function arrive(s, idx) {
    const p = s.players[idx];
    const bonus = destBonus(s);
    p.cash += bonus; p.stats.dest++; p.stats.bonus += bonus;
    const oldDest = s.dest;
    const hadGod = p.god;
    const godFrom = s.godHolder;
    let godTo = -1;
    if (s.players.length > 1) {
      // 目的地からいちばん遠い「ほかの人」に貧乏神がつく
      const d = B.distFrom(oldDest);
      let max = -1, cand = [];
      s.players.forEach((q) => {
        if (q.id === idx) return;
        if (d[q.pos] > max) { max = d[q.pos]; cand = [q.id]; } else if (d[q.pos] === max) cand.push(q.id);
      });
      godTo = cand[rint(s, cand.length)];
    } else {
      godTo = hadGod ? -1 : idx; // 一人モードでは、到着のたびについたり離れたりする(動作確認用)
    }
    if (s.godHolder >= 0) s.players[s.godHolder].god = false;
    s.godHolder = godTo;
    if (godTo >= 0) s.players[godTo].god = true;
    pickDest(s);
    return { bonus, oldDest, newDest: s.dest, godFrom, godTo, hadGod };
  }

  function godTransfer(s, idx) {
    const p = s.players[idx];
    if (!p.god) return null;
    const others = s.players.filter((q) => q.id !== idx && q.pos === p.pos);
    if (!others.length) return null;
    const to = others[rint(s, others.length)].id;
    p.god = false; s.players[to].god = true; s.godHolder = to;
    return { from: idx, to };
  }

  function godEffect(s, idx) {
    const p = s.players[idx];
    if (!p.god) return null;
    if (rnd(s) > 0.6) return { kind: 'none' };
    const r = rnd(s);
    const money = () => { const amount = round10((300 + rint(s, 700)) * yf(s)); p.cash -= amount; return { kind: 'money', amount }; };
    if (r < 0.55) return money();
    if (r < 0.8) {
      if (!p.cards.length) return money();
      const card = p.cards.splice(rint(s, p.cards.length), 1)[0];
      return { kind: 'card', card };
    }
    const mine = ownedProps(s, idx);
    if (!mine.length) return money();
    const prop = mine[rint(s, mine.length)];
    delete s.owners[prop.id];
    const amount = Math.round(propPrice(s, prop) * 0.5);
    delete s.levels[prop.id];
    p.cash += amount;
    return { kind: 'sell', prop, amount };
  }

  // ---------- マスの効果 ----------
  function squareEffect(s, idx) {
    const p = s.players[idx], node = B.byId[p.pos], f = yf(s);
    switch (node.type) {
      case 'blue': { const amount = round10((200 + rint(s, 3) * 100) * f); p.cash += amount; return { kind: 'blue', amount }; }
      case 'red': { const amount = round10((100 + rint(s, 3) * 100) * f); p.cash -= amount; return { kind: 'red', amount }; }
      case 'yellow': return { kind: 'yellow', card: drawCard(s) };
      case 'event': return applyEvent(s, idx, A.EVENTS[rint(s, A.EVENTS.length)]);
      default: return { kind: 'station', station: node.station };
    }
  }
  function applyEvent(s, idx, ev) {
    const p = s.players[idx], f = yf(s);
    const res = { kind: 'event', ev, delta: 0, card: null, lostCard: null, takes: [] };
    const others = s.players.filter((q) => q.id !== idx);
    if (ev.money) res.delta += round10(ev.money * f);
    if (ev.takeEach) {
      if (others.length) { const a = round10(ev.takeEach * f); others.forEach((q) => { q.cash -= a; res.delta += a; res.takes.push({ who: q.id, amount: a }); }); }
      else res.delta += round10(300 * f);
    }
    if (ev.giveEach) {
      if (others.length) { const a = round10(ev.giveEach * f); others.forEach((q) => { q.cash += a; res.delta -= a; res.takes.push({ who: q.id, amount: -a }); }); }
      else res.delta -= round10(300 * f);
    }
    if (ev.loseCard && p.cards.length) res.lostCard = p.cards.splice(rint(s, p.cards.length), 1)[0];
    if (ev.card) res.card = drawCard(s);
    p.cash += res.delta;
    return res;
  }

  // ---------- 決算・月送り ----------
  /** 食品日本一: 2年目から、毎年の決算で名物の食べものが「日本一」に選ばれて、持ち主に臨時収入が入る */
  function foodAwards(s) {
    if (calendar(s).year < 2) return [];
    const foods = A.STATIONS.flatMap((st) => st.props).filter((pr) => pr.icon === 'food');
    const out = [];
    for (let i = 0; i < 2 && foods.length; i++) {
      const pr = foods.splice(rint(s, foods.length), 1)[0];
      const owner = s.owners[pr.id];
      out.push({ prop: pr, owner: owner === undefined ? -1 : owner, amount: owner === undefined ? 0 : round10(propPrice(s, pr) * 0.6) });
    }
    return out;
  }

  function settle(s) {
    const cal = calendar(s);
    const awards = foodAwards(s);
    const results = s.players.map((p) => {
      const items = ownedProps(s, p.id).map((prop) => ({ prop, income: propIncome(s, prop), mono: monopolyOwner(s, prop.station) === p.id }));
      const bonus = awards.filter((a) => a.owner === p.id).reduce((x, a) => x + a.amount, 0);
      const total = items.reduce((a, it) => a + it.income, 0) + bonus;
      p.cash += total; p.stats.income += total;
      return { idx: p.id, items, bonus, total, cash: p.cash, assets: assets(s, p.id) };
    });
    const out = { year: cal.year, results, ranking: ranking(s), foodAwards: awards };
    s.yearly.push({ year: cal.year, assets: s.players.map((p) => assets(s, p.id)) });
    return out;
  }

  /** 1人の番が終わったあとに呼ぶ。月の終わり・決算・ゲーム終了を知らせる */
  function advance(s) {
    const info = { monthEnded: false, settlement: null, finished: false };
    s.turnIdx++;
    if (s.turnIdx >= s.players.length) {
      s.turnIdx = 0;
      info.monthEnded = true;
      const cal = calendar(s);
      if (cal.month === 3) info.settlement = settle(s);
      s.round++;
      if (s.round >= s.config.years * 12) { s.finished = true; info.finished = true; }
    }
    return info;
  }

  function awards(s) {
    const best = (fn) => {
      let max = -Infinity, who = [];
      s.players.forEach((p) => { const v = fn(p); if (v > max) { max = v; who = [p.id]; } else if (v === max) who.push(p.id); });
      return { who, value: max };
    };
    const list = [];
    const d = best((p) => p.stats.dest); if (d.value > 0) list.push({ key: 'dest', title: '目的地王', desc: d.value + '回 一番乗り', who: d.who });
    const b = best((p) => ownedProps(s, p.id).length); if (b.value > 0) list.push({ key: 'prop', title: '物件王', desc: b.value + '件 所有', who: b.who });
    const g = best((p) => p.stats.godTurns); if (g.value > 0) list.push({ key: 'god', title: '貧乏神の友', desc: g.value + 'ターン 取りつかれた', who: g.who });
    const st = best((p) => p.stats.steps); if (st.value > 0) list.push({ key: 'steps', title: '歩き王', desc: st.value + 'マス 進んだ', who: st.who });
    return list;
  }

  // ---------- ターンの進行本体 ----------
  /** driver のメソッド（どれも Promise を返してよい）:
   *   emit(evt)            演出（待つ価値のあるもの）
   *   menu(s, idx, ctx)    {action:'roll'} か {action:'card', cardId, arg}
   *   branch(s, idx, ctx)  分かれ道でどこへ進むか（ノードID）
   *   shop(s, idx, st)     駅での物件購入（中で buy を呼ぶ）
   *   discard(s, idx, id)  手札がいっぱいのとき捨てるカードID（新しいカードを含む） */
  async function gainCardWithDiscard(s, idx, cardId, drv) {
    const p = s.players[idx];
    if (gainCard(s, p, cardId)) return { added: true, dropped: null };
    const drop = await drv.discard(s, idx, cardId);
    if (drop && drop !== cardId && p.cards.includes(drop)) {
      p.cards.splice(p.cards.indexOf(drop), 1); p.cards.push(cardId);
      return { added: true, dropped: drop };
    }
    return { added: false, dropped: cardId };
  }

  async function runTurn(s, drv) {
    const idx = current(s), p = s.players[idx];
    s.turn = freshTurn();
    if (p.slow) { s.turn.slow = true; p.slow = false; }
    if (p.god) p.stats.godTurns++;
    await drv.emit({ t: 'turnStart', p: idx });

    // 1) 行動の選択（カードを使うか、サイコロを振る）
    for (let guard = 0; guard < 20; guard++) {
      const act = await drv.menu(s, idx, { canCard: !s.turn.cardUsed && p.cards.length > 0 });
      if (!act || act.action !== 'card') break;
      const res = applyCard(s, idx, act.cardId, act.arg);
      if (!res.ok) { await drv.emit({ t: 'cardDenied', p: idx, reason: res.reason }); continue; }
      await drv.emit({ t: 'card', p: idx, cardId: act.cardId, res });
      if (res.kind === 'dice' || res.kind === 'warp' || res.kind === 'stay') break;
    }

    // 2) サイコロと移動
    if (!s.turn.warped) {
      const n = s.turn.dice;
      let dice = [];
      if (s.debugDice && s.debugDice.length) { dice = s.debugDice.slice(0, 4); s.debugDice = null; }
      else for (let i = 0; i < n; i++) dice.push(s.turn.fixed || 1 + rint(s, 6));
      let total = dice.reduce((a, b) => a + b, 0);
      const slow = s.turn.slow;
      if (slow) total = 1;
      await drv.emit({ t: 'roll', p: idx, dice, total, slow });
      let remaining = total;
      // サイコロの目で止まれる場所のうち、行きたい所をえらぶ（えらべない／1か所だけなら、そのまま進む）
      let forced = null, fi = 0;
      if (drv.target && total > 0) {
        const reach = B.reachable(p.pos, p.prev, total, s.dest);
        const endpoints = Array.from(reach.keys());
        let pick = endpoints.length === 1 ? endpoints[0] : await drv.target(s, idx, { endpoints, total });
        if (pick && reach.has(pick)) forced = B.pathTo(p.pos, p.prev, total, s.dest, pick);
      }
      while (remaining > 0) {
        const opts = B.stepOptions(p.pos, p.prev);
        let next = opts[0];
        if (forced && fi < forced.length && opts.includes(forced[fi])) next = forced[fi++];
        else if (opts.length > 1) {
          const pick = await drv.branch(s, idx, { options: opts, remaining });
          if (opts.includes(pick)) next = pick;
        }
        const from = p.pos;
        p.prev = from; p.pos = next; remaining--; p.stats.steps++;
        await drv.emit({ t: 'step', p: idx, from, to: next, remaining });
        if (p.pos === s.dest) break;
      }
    }
    await drv.emit({ t: 'stopped', p: idx, node: p.pos });

    // 3) 目的地ボーナス
    if (p.pos === s.dest) {
      const res = arrive(s, idx);
      await drv.emit({ t: 'arrive', p: idx, res });
    }

    // 4) 止まったマスの効果
    const eff = squareEffect(s, idx);
    if (eff.kind === 'station') {
      const st = STATION[eff.station];
      await drv.emit({ t: 'station', p: idx, station: eff.station });
      if (st.card) {
        // 物件のないカード駅: 止まるとカードがもらえる
        const card = drawCard(s);
        const got = await gainCardWithDiscard(s, idx, card, drv);
        await drv.emit({ t: 'cardStation', p: idx, card, got });
      } else await drv.shop(s, idx, st);
      if (st.shop) await drv.cardShop(s, idx, st);
    } else {
      if (eff.kind === 'yellow') eff.got = await gainCardWithDiscard(s, idx, eff.card, drv);
      if (eff.kind === 'event' && eff.card) eff.got = await gainCardWithDiscard(s, idx, eff.card, drv);
      await drv.emit({ t: 'square', p: idx, eff });
    }

    // 5) 貧乏神: なすりつけ → 悪さ
    const tr = godTransfer(s, idx);
    if (tr) await drv.emit({ t: 'godMove', p: idx, tr });
    const ge = godEffect(s, idx);
    if (ge && ge.kind !== 'none') await drv.emit({ t: 'godEffect', p: idx, ge });

    await drv.emit({ t: 'turnEnd', p: idx });
  }

  Object.assign(A, {
    Logic: {
      STATION, PROP, START_CASH, START_STATION,
      rnd, rint, round10, fmt, calendar, yf, current, newGame, freshTurn,
      ownedProps, assets, ranking, monopolyOwner, propIncome, propPrice, priceFor, investCost, MAX_LEVEL, buy, invest, cardPrice, cardStock, buyCard, foodAwards,
      drawCard, gainCard, canUseCard, applyCard, buyoutTargets,
      pickDest, destBonus, arrive, godTransfer, godEffect, squareEffect, applyEvent,
      settle, advance, awards, runTurn, gainCardWithDiscard,
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
