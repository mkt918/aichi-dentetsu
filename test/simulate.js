/* CPU 同士で何ゲームも自動対戦して、ルールの破綻やバランスを確かめる
 * 使い方: node test/simulate.js [ゲーム数=60] */
'use strict';
['stations', 'overrides', 'data', 'layout', 'board', 'logic', 'ai'].forEach((f) => require('../js/' + f + '.js'));
const A = globalThis.Aichi, L = A.Logic, AI = A.AI;

const games = Number(process.argv[2]) || 60;
let failures = 0;
const fail = (m) => { failures++; console.log('✗ ' + m); };

function driver(log) {
  return {
    emit: async (e) => { log && log.push(e); },
    menu: async (s, i) => AI.brain.menu(s, i),
    branch: async (s, i, c) => AI.brain.branch(s, i, c),
    discard: async (s, i, c) => AI.brain.discard(s, i, c),
    shop: async (s, i, st) => AI.brain.shop(s, i, st),
    cardShop: async (s, i, st) => AI.brain.cardShop(s, i, st),
  };
}

function check(s, where) {
  s.players.forEach((p) => {
    if (!Number.isFinite(p.cash)) fail(`${where}: 所持金が数値でない`);
    if (p.cards.length > A.HAND_LIMIT) fail(`${where}: 手札オーバー ${p.cards.length}`);
    if (!A.Board.byId[p.pos]) fail(`${where}: 現在地が不正 ${p.pos}`);
    p.cards.forEach((c) => { if (!A.CARDS[c]) fail(`${where}: 不明なカード ${c}`); });
  });
  Object.keys(s.owners).forEach((id) => {
    if (!L.PROP[id]) fail(`${where}: 不明な物件 ${id}`);
    if (!s.players[s.owners[id]]) fail(`${where}: 持ち主が不正 ${id}`);
  });
  const holders = s.players.filter((p) => p.god).length;
  if (holders > 1) fail(`${where}: 貧乏神が複数`);
  if (holders === 1 && s.godHolder < 0) fail(`${where}: godHolder が未設定`);
  if (!L.STATION[s.dest]) fail(`${where}: 目的地が不正`);
}

async function playGame(cfg, seed) {
  const s = L.newGame(cfg, seed);
  const drv = driver();
  let turns = 0;
  while (!s.finished) {
    await L.runTurn(s, drv);
    turns++;
    check(s, `seed${seed} turn${turns}`);
    L.advance(s);
    if (turns > 5000) { fail('ターンが終わらない seed' + seed); break; }
  }
  return { s, turns };
}

(async () => {
  const t0 = Date.now();
  const winsByLevel = { 1: 0, 2: 0, 3: 0 };
  const playedByLevel = { 1: 0, 2: 0, 3: 0 };
  let totalDest = 0, totalTurns = 0, godEvents = 0;
  const finalAssets = [];
  for (let g = 0; g < games; g++) {
    // 3人対戦: レベル1・2・3 を座席を入れ替えて対戦させる
    const levels = [[1, 2, 3], [3, 1, 2], [2, 3, 1]][g % 3];
    const cfg = { years: 1 + (g % 3), mode: 'versus', players: levels.map((lv, i) => ({ name: 'CPU' + (i + 1), type: 'cpu', level: lv, char: i })) };
    const { s, turns } = await playGame(cfg, 1000 + g);
    const rk = L.ranking(s);
    winsByLevel[s.players[rk[0]].level]++;
    levels.forEach((lv) => { playedByLevel[lv]++; });
    totalDest += s.players.reduce((a, p) => a + p.stats.dest, 0);
    totalTurns += turns;
    s.players.forEach((p) => { finalAssets.push(L.assets(s, p.id)); godEvents += p.stats.godTurns; });
  }
  // 一人モード（動作確認）と4人
  for (const n of [1, 2, 4]) {
    const cfg = { years: 1, mode: n === 1 ? 'solo' : 'versus', debug: n === 1, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, type: 'cpu', level: 2, char: i })) };
    const { s, turns } = await playGame(cfg, 77 + n);
    console.log(`  ${n}人 1年: ${turns}ターン, 目的地到着 ${s.players.reduce((a, p) => a + p.stats.dest, 0)}回, 最終資産`, s.players.map((p) => L.fmt(L.assets(s, p.id))).join(' / '));
  }
  // セーブ＆ロード（JSON往復）で状態が変わらない
  const s1 = L.newGame({ years: 1, players: [{ type: 'cpu', level: 2 }, { type: 'cpu', level: 3 }] }, 5);
  for (let i = 0; i < 10; i++) { await L.runTurn(s1, driver()); L.advance(s1); }
  const s2 = JSON.parse(JSON.stringify(s1));
  for (let i = 0; i < 10; i++) { await L.runTurn(s1, driver()); L.advance(s1); await L.runTurn(s2, driver()); L.advance(s2); }
  // Math.random を使う CPU の判断はずれる可能性があるため、ここでは構造が壊れていないことだけ確認
  check(s2, 'セーブ復元後');

  // 強さの階段: 2人対戦でレベル差が勝率に表れるか
  for (const [lo, hi] of [[1, 2], [2, 3]]) {
    let hiWins = 0; const N = 300;
    for (let g = 0; g < N; g++) {
      const order = g % 2 ? [lo, hi] : [hi, lo];
      const { s } = await playGame({ years: 2, players: order.map((lv, i) => ({ type: 'cpu', level: lv, char: i })) }, 5000 + g);
      if (s.players[L.ranking(s)[0]].level === hi) hiWins++;
    }
    console.log(`  Lv${hi} vs Lv${lo}: Lv${hi} の勝率 ${(hiWins / N * 100).toFixed(0)}%`);
  }

  console.log(`\n${games}ゲーム 完走 (${Date.now() - t0}ms)`);
  console.log('勝利数(レベル別):', JSON.stringify(winsByLevel), ' 参加:', JSON.stringify(playedByLevel));
  console.log('平均ターン', (totalTurns / games).toFixed(1), ' 目的地到着/ゲーム', (totalDest / games).toFixed(1), ' 貧乏神ターン/ゲーム', (godEvents / games).toFixed(1));
  finalAssets.sort((a, b) => a - b);
  console.log('最終資産 最小/中央/最大:', L.fmt(finalAssets[0]), L.fmt(finalAssets[finalAssets.length >> 1]), L.fmt(finalAssets[finalAssets.length - 1]));
  console.log(failures ? `\n失敗 ${failures} 件` : '\nシミュレーション OK');
  process.exitCode = failures ? 1 : 0;
})();
