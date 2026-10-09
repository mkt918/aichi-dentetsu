/* あいち電鉄 — えらべる盤面をまとめて作る（Node 専用）: node tools/genall.js
 * tools/genmap.js を、地域をしぼって何回か動かし、js/mapdata.js に全部書き出す。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PRESETS = [
  { id: 'full', name: '愛知ぜんぶ', desc: '愛知県の145駅をぜんぶめぐる、いちばん大きな盤面。', start: 'nagoya' },
  { id: 'owari', name: '名古屋・尾張', desc: '名古屋市内と尾張だけ。地下鉄の駅が多く、物件が高い。', start: 'nagoya', regions: 'nagoya,owari' },
  { id: 'minami', name: '知多・三河・渥美', desc: '知多半島から三河、渥美半島まで。海と半島をめぐる盤面。', start: 'kariya', regions: 'chita,nishimikawa,higashimikawa,atsumi' },
  { id: 'mikawa', name: '三河・渥美', desc: '岡崎・豊田・豊橋を中心に、三河と渥美半島をまわる小さめの盤面。', start: 'okazaki', regions: 'nishimikawa,higashimikawa,atsumi' },
];

const maps = PRESETS.map((p) => {
  const env = Object.assign({}, process.env, { OUT: 'json', START: p.start });
  if (p.regions) env.REGIONS = p.regions; else delete env.REGIONS;
  const rows = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'genmap.js')], { env, maxBuffer: 1 << 26 }).toString());
  const st = rows.filter((r) => r[2] === 'S').length;
  console.log(p.name, 'マス', rows.length, '駅', st);
  return Object.assign({}, p, { cells: rows });
});

const body = maps.map((m) => '    { id: ' + JSON.stringify(m.id) + ', name: ' + JSON.stringify(m.name) + ', desc: ' + JSON.stringify(m.desc) + ', start: ' + JSON.stringify(m.start) + ', cells: [\n' +
  m.cells.map((r) => '      ' + JSON.stringify(r)).join(',\n') + ',\n    ] },').join('\n');
const out = '/* あいち電鉄 — 盤面データ（tools/genall.js が作成）。タイトル画面でえらべる。エディターで作った盤面は localStorage に入る。\n' +
  ' * cells: [列, 行, 種類, 駅ID]  種類: S=駅 b=青(+) r=赤(-) y=カード e=イベント t=線路だけ（止まらない）\n' +
  ' * となりあう（上下左右の）マスどうしが、道でつながる。陸の外のマスは海路として描く。start はスタートの駅。 */\n' +
  '(function (root) {\n  \'use strict\';\n  const A = (root.Aichi = root.Aichi || {});\n  A.MAPPRESETS = [\n' + body + '\n  ];\n  A.MAPDATA = A.MAPPRESETS[0].cells;\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'mapdata.js'), out);
