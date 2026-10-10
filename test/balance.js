/* お金の出入りのバランスを見る: node test/balance.js [ゲーム数=60] [年数=3]
 * CPU（ふつう）3人で遊ばせ、どこからいくら入って出ていったかを、年ごとに集計する。 */
'use strict';
['stations', 'stationtext', 'overrides', 'mapdata', 'data', 'layout', 'board', 'logic', 'ai'].forEach((f) => require('../js/' + f + '.js'));
const A = globalThis.Aichi, L = A.Logic, AI = A.AI;
const games = Number(process.argv[2]) || 60, years = Number(process.argv[3]) || 3;

const sum = {};
const add = (y, k, v) => { sum[y] = sum[y] || {}; sum[y][k] = (sum[y][k] || 0) + v; };
let bought = [], props = 0;
(async () => {
  for (let g = 0; g < games; g++) {
    const s = L.newGame({ years, players: [1, 2, 3].map((lv, i) => ({ type: 'cpu', level: 2, char: i })) }, 300 + g);
    const drv = {
      emit: async (e) => {
        const y = L.calendar(s).year;
        if (e.t === 'square') { const f = e.eff; if (f.kind === 'blue') add(y, '青マス', f.amount); if (f.kind === 'red') add(y, '赤マス', -f.amount); if (f.kind === 'event') add(y, 'イベント', f.delta || 0); }
        if (e.t === 'arrive') add(y, '目的地', e.res.bonus);
        if (e.t === 'godEffect' && e.ge.kind === 'money') add(y, '貧乏神', -e.ge.amount);
      },
      menu: async (st, i) => AI.brain.menu(st, i), branch: async (st, i, c) => AI.brain.branch(st, i, c),
      discard: async (st, i, c) => AI.brain.discard(st, i, c), cardShop: async (st, i, x) => AI.brain.cardShop(st, i, x),
      shop: async (st, i, x) => { const c0 = st.players[i].cash; await AI.brain.shop(st, i, x); const spent = c0 - st.players[i].cash; if (spent > 0) { add(L.calendar(st).year, '物件購入', -spent); } },
    };
    while (!s.finished) {
      await L.runTurn(s, drv);
      const y = L.calendar(s).year;
      const info = L.advance(s);
      if (info.settlement) info.settlement.results.forEach((r) => add(y, '決算収入', r.total));
    }
    Object.keys(s.owners).forEach((id) => { bought.push(L.PROP[id].price); });
    props += Object.keys(s.owners).length;
    s.players.forEach((p) => add('最終', '資産', L.assets(s, p.id)));
  }
  const n = games * 3;
  Object.keys(sum).forEach((y) => {
    console.log(y === '最終' ? '最終' : y + '年目', Object.entries(sum[y]).map(([k, v]) => k + ' ' + L.fmt(Math.round(v / n))).join(' / '), '（1人あたり平均）');
  });
  bought.sort((a, b) => a - b);
  console.log('買われた物件 1ゲーム', (props / games).toFixed(0), '件 / 価格 中央', L.fmt(bought[bought.length >> 1]), '・上位10%', L.fmt(bought[Math.floor(bought.length * 0.9)]), '・最高', L.fmt(bought[bought.length - 1]));
})();
