/* あいち電鉄 — 用意された盤面を作る（Node 専用）: node tools/genall.js
 * tools/genmap.js を動かし、js/mapdata.js に書き出す。PRESETS に regions（地域）をしぼった盤面を足すこともできる。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PRESETS = [
  { id: 'full', name: '愛知県', desc: '県の形も駅の位置も、実際の地図と同じ。名古屋の町なかは駅が少なめで、奥三河は遠い。', start: 'nagoya' },
];

const maps = PRESETS.map((p) => {
  const env = Object.assign({}, process.env, { OUT: 'json', START: p.start });
  if (p.regions) env.REGIONS = p.regions; else delete env.REGIONS;
  delete env.MAP;
  const rows = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'genmap.js')], { env, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] }).toString());
  const st = rows.filter((r) => r[2] === 'S').length;
  console.log(p.name, 'マス', rows.length, '駅', st);
  return Object.assign({}, p, { cells: rows });
});

const body = maps.map((m) => '    { id: ' + JSON.stringify(m.id) + ', name: ' + JSON.stringify(m.name) + ', desc: ' + JSON.stringify(m.desc) + ', start: ' + JSON.stringify(m.start) + ', cells: [\n' +
  m.cells.map((r) => '      ' + JSON.stringify(r)).join(',\n') + ',\n    ] },').join('\n');
const out = '/* あいち電鉄 — 盤面データ（tools/genall.js が作成）。エディターで作った盤面は localStorage に入る。\n' +
  ' * cells: [列, 行, 種類, 駅ID]  種類: S=駅 b=青(+) r=赤(-) y=カード e=イベント t=線路だけ（止まらない）\n' +
  ' * となりあう（上下左右の）マスどうしが、道でつながる。陸の外のマスは海路として描く。start はスタートの駅。 */\n' +
  '(function (root) {\n  \'use strict\';\n  const A = (root.Aichi = root.Aichi || {});\n  A.MAPPRESETS = [\n' + body + '\n  ];\n  A.MAPDATA = A.MAPPRESETS[0].cells;\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'mapdata.js'), out);
