/* あいち電鉄 — CPU の思考（level 1=よわい / 2=ふつう / 3=つよい） */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const B = A.Board, L = A.Logic;

  const CARD_VALUE = { shinkansen: 9, limited: 8, warp: 8, harai: 7, buyout: 6, stop: 6, sale: 5, express: 5, bonus: 4, six: 3 };

  const distTo = (s, id) => B.distFrom(s.dest)[id];
  const lvl = (s, idx) => s.players[idx].level || 2;

  /** 駅の「買いたさ」: 利回りと独占ボーナスを見て点数化 */
  function propScore(s, idx, prop) {
    const st = L.STATION[prop.station];
    let sc = prop.rate;
    const mine = st.props.filter((p) => s.owners[p.id] === idx).length;
    const others = st.props.filter((p) => s.owners[p.id] !== undefined && s.owners[p.id] !== idx).length;
    if (!others && mine + 1 === st.props.length) sc += 14;          // 独占が完成する
    else if (!others && mine > 0) sc += 4;                         // 独占に近づく
    if (others) sc -= 3;                                           // 独占できない駅は少し魅力が落ちる
    return sc;
  }

  /** 止まった場所の良さ（つよいCPUが分かれ道で使う） */
  function endpointScore(s, idx, nodeId) {
    const p = s.players[idx], node = B.byId[nodeId], f = L.yf(s);
    let sc = -distTo(s, nodeId) * 10;
    if (nodeId === s.dest) sc += 400 + L.destBonus(s) / 20;
    if (node.type === 'blue') sc += 22; else if (node.type === 'red') sc -= 22;
    else if (node.type === 'yellow') sc += 16;
    else if (node.type === 'station') {
      const st = L.STATION[node.station];
      if (st.card) sc += 14;
      if (st.plain) sc += 5;
      if (st.shop && p.cash > 3000 * f) sc += 5;
      const buyable = st.props.filter((pr) => s.owners[pr.id] === undefined && pr.price + 400 * f <= p.cash);
      if (buyable.length) sc += Math.max.apply(null, buyable.map((pr) => propScore(s, idx, pr))) * 1.6;
    }
    if (p.god) sc += 35 * s.players.filter((q) => q.id !== idx && q.pos === nodeId).length; // 貧乏神をなすりつけたい
    return sc;
  }

  // ---------- 分かれ道 ----------
  function chooseBranch(s, idx, ctx) {
    const { options, remaining } = ctx;
    const p = s.players[idx], level = lvl(s, idx);
    const dd = B.distFrom(s.dest);
    if (level === 1 && Math.random() < 0.6) return options[Math.floor(Math.random() * options.length)];
    if (level <= 2) {
      if (level === 2 && Math.random() < 0.2) return options[Math.floor(Math.random() * options.length)]; // ふつうはときどき迷う
      let best = [], bd = Infinity;
      options.forEach((o) => { if (dd[o] < bd) { bd = dd[o]; best = [o]; } else if (dd[o] === bd) best.push(o); });
      return best[Math.floor(Math.random() * best.length)];
    }
    // level 3: 残り歩数ぶん先読みして、止まれる場所の中でいちばん良い所へ向かう
    const reach = B.reachable(p.pos, p.prev, remaining, s.dest);
    // ctx.options は「最初の一歩」ではなく、いまの分かれ道での候補。reach は pos 起点なので
    // 現在地(p.pos)からの first を使う。ここでは options そのものが first になる。
    const scores = new Map(options.map((o) => [o, -Infinity]));
    reach.forEach((firsts, node) => {
      const sc = endpointScore(s, idx, node);
      firsts.forEach((f) => { if (scores.has(f) && sc > scores.get(f)) scores.set(f, sc); });
    });
    let best = options[0], bs = -Infinity;
    options.forEach((o) => { const v = scores.get(o); if (v > bs) { bs = v; best = o; } });
    return best;
  }

  // ---------- 買い物 ----------
  function chooseBuy(s, idx, st) {
    const p = s.players[idx], level = lvl(s, idx), f = L.yf(s);
    const cands = st.props.filter((pr) => s.owners[pr.id] === undefined && p.cash >= L.priceFor(s, pr));
    if (!cands.length) return null;
    if (level === 1) return Math.random() < 0.5 ? cands[Math.floor(Math.random() * cands.length)].id : null;
    const reserve = (level === 3 ? 300 : 700) * f;
    const ranked = cands.map((pr) => ({ pr, sc: propScore(s, idx, pr) })).sort((a, b) => b.sc - a.sc);
    for (const { pr, sc } of ranked) {
      const price = L.priceFor(s, pr);
      if (p.cash - price < reserve) continue;
      const need = level === 3 ? 7 : 11;
      if (sc >= need || (level === 3 && s.turn.sale)) return pr.id;
    }
    return null;
  }

  /** 増資する物件を選ぶ（なければ null） */
  function chooseInvest(s, idx, st) {
    const level = lvl(s, idx);
    if (level === 1) return null;
    const p = s.players[idx], f = L.yf(s);
    const reserve = (level === 3 ? 300 : 800) * f;
    const need = level === 3 ? 12 : 30;
    let best = null;
    st.props.forEach((pr) => {
      if (s.owners[pr.id] !== idx || (s.levels[pr.id] || 0) >= L.MAX_LEVEL) return;
      const cost = L.investCost(s, pr);
      if (p.cash - cost < reserve || pr.rate < need) return;
      if (!best || pr.rate > best.rate) best = pr;
    });
    return best ? best.id : null;
  }

  /** カード売り場で買うカード（なければ null） */
  function chooseCardBuy(s, idx, st) {
    const level = lvl(s, idx), p = s.players[idx];
    if (level === 1 || p.cards.length >= A.HAND_LIMIT) return null;
    const want = level === 3 ? ['harai', 'warp', 'limited', 'express', 'stay'] : ['express', 'limited'];
    for (const id of L.cardStock(s, st.id)) {
      if (!want.includes(id)) continue;
      if (id === 'harai' && !p.god) continue;
      if (id === 'stay') continue;
      const price = L.cardPrice(s, id);
      if (p.cash >= price * (level === 3 ? 3 : 5)) return id;
    }
    return null;
  }

  function chooseDiscard(s, idx, newCard) {
    const p = s.players[idx];
    const pool = p.cards.concat([newCard]);
    let worst = pool[0], w = Infinity;
    pool.forEach((c) => {
      let v = CARD_VALUE[c] || 1;
      if (c === 'harai' && !p.god) v -= 3;
      if (v < w) { w = v; worst = c; }
    });
    return worst;
  }

  // ---------- カードを使うか、サイコロを振るか ----------
  function chooseMenu(s, idx) {
    const p = s.players[idx], level = lvl(s, idx);
    const roll = { action: 'roll' };
    if (s.turn.cardUsed || !p.cards.length) return roll;
    const has = (id) => p.cards.includes(id) && L.canUseCard(s, idx, id).ok;
    const dist = distTo(s, p.pos);
    if (level === 1) {
      if (Math.random() < 0.12) {
        const usable = p.cards.filter((c) => L.canUseCard(s, idx, c).ok && A.CARDS[c].kind === 'dice');
        if (usable.length) return { action: 'card', cardId: usable[0] };
      }
      return roll;
    }
    if (has('harai')) return { action: 'card', cardId: 'harai' };
    if (has('bonus')) return { action: 'card', cardId: 'bonus' };
    if (has('stay') && level >= 2) {
      const node = B.byId[p.pos];
      const st = node.type === 'station' ? L.STATION[node.station] : null;
      const f = L.yf(s);
      if (st && st.props.length && p.cash > 3000 * f) {
        const good = st.props.some((pr) => (s.owners[pr.id] === undefined && L.priceFor(s, pr) <= p.cash * 0.6 && propScore(s, idx, pr) >= (level === 3 ? 18 : 30)) ||
          (s.owners[pr.id] === idx && (s.levels[pr.id] || 0) < L.MAX_LEVEL && pr.rate >= (level === 3 ? 20 : 40)));
        if (good) return { action: 'card', cardId: 'stay' };
      }
    }
    if (has('buyout') && (level === 3 || Math.random() < 0.5)) {
      const tg = L.buyoutTargets(s, idx).sort((a, b) => propScore(s, idx, b) - propScore(s, idx, a))[0];
      if (tg && tg.rate >= 8) return { action: 'card', cardId: 'buyout', arg: tg.id };
    }
    const rivals = s.players.filter((q) => q.id !== idx).sort((a, b) => distTo(s, a.pos) - distTo(s, b.pos));
    const rivalMin = rivals.length ? distTo(s, rivals[0].pos) : 99;

    if (level === 2) {
      // ふつう: 遠いときだけ素直にカードを使う
      if (has('warp') && dist >= 10) return { action: 'card', cardId: 'warp', arg: s.dest };
      if (has('stop') && rivals.length && rivalMin <= 8 && Math.random() < 0.5) return { action: 'card', cardId: 'stop', arg: rivals[0].id };
      if (has('sale') && p.cash >= 4000) return { action: 'card', cardId: 'sale' };
      const dice = ['shinkansen', 'limited', 'express'].filter((c) => has(c));
      if (dice.length && dist >= 15) return { action: 'card', cardId: dice[0] };
      return roll;
    }

    // つよい: ライバルとの競争を見て、いちばん確実に先に着けるカードを選ぶ
    if (has('warp') && dist >= 6) return { action: 'card', cardId: 'warp', arg: s.dest };
    if (has('stop') && rivals.length && rivalMin <= 12 && rivalMin <= dist + 3) return { action: 'card', cardId: 'stop', arg: rivals[0].id };
    if (has('sale') && p.cash >= 2500) return { action: 'card', cardId: 'sale' };
    if (has('six') && dist <= 6 && dist >= 4) return { action: 'card', cardId: 'six' };
    const diceCards = ['express', 'limited', 'shinkansen'].filter((c) => has(c)); // 小さい順
    if (diceCards.length && dist > 6) {
      const racing = rivalMin <= dist + 2;
      for (const c of diceCards) {
        if (pReach(A.CARDS[c].dice, dist) >= (racing ? 0.45 : 0.7)) return { action: 'card', cardId: c };
      }
      const big = diceCards[diceCards.length - 1];
      if (dist >= 18 || racing) return { action: 'card', cardId: big };
    }
    return roll;
  }

  /** n 個のサイコロの合計が dist 以上になる確率 */
  function pReach(n, dist) {
    let probs = { 0: 1 };
    for (let i = 0; i < n; i++) {
      const next = {};
      Object.keys(probs).forEach((k) => { for (let f = 1; f <= 6; f++) next[+k + f] = (next[+k + f] || 0) + probs[k] / 6; });
      probs = next;
    }
    return Object.keys(probs).reduce((a, k) => a + (+k >= dist ? probs[k] : 0), 0);
  }

  /** 何もしない driver が使う共通の「CPUの頭脳」 */
  const brain = {
    menu: (s, idx) => chooseMenu(s, idx),
    branch: (s, idx, ctx) => chooseBranch(s, idx, ctx),
    discard: (s, idx, newCard) => chooseDiscard(s, idx, newCard),
    shop: (s, idx, st) => {
      for (let i = 0; i < 6; i++) {
        const id = chooseBuy(s, idx, st);
        if (!id) break;
        if (!L.buy(s, idx, id).ok) break;
      }
      for (let i = 0; i < 6; i++) {
        const id = chooseInvest(s, idx, st);
        if (!id || !L.invest(s, idx, id).ok) break;
      }
    },
    cardShop: (s, idx, st) => {
      for (let i = 0; i < 3; i++) {
        const id = chooseCardBuy(s, idx, st);
        if (!id || !L.buyCard(s, idx, id).ok) break;
      }
    },
  };

  Object.assign(A, { AI: { chooseBranch, chooseBuy, chooseInvest, chooseCardBuy, chooseDiscard, chooseMenu, propScore, endpointScore, brain } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
