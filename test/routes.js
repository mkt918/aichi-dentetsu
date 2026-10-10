/* 「行き方が複数ある駅」の割合を調べる: node test/routes.js */
['stations','realmap','stationtext','overrides','data','layout','mapdata','board'].forEach(f=>require('../js/'+f+'.js'));
const A=globalThis.Aichi,B=A.Board;
// 橋(切り離すと分断される道)をさがして、名古屋と同じ「2重につながった部分」にある駅を数える
const ids=B.nodes.map(n=>n.id);const tin={},low={};let t=0;const bridges=new Set();
function dfs(v,p){tin[v]=low[v]=++t;for(const u of B.byId[v].adj){if(u===p)continue;if(tin[u]){low[v]=Math.min(low[v],tin[u]);}else{dfs(u,v);low[v]=Math.min(low[v],low[u]);if(low[u]>tin[v])bridges.add(v<u?v+'|'+u:u+'|'+v);}}}
dfs(A.START_STATION,null);
// 橋を除いた連結成分
const comp={};let c=0;
for(const v of ids){if(comp[v]!==undefined)continue;const q=[v];comp[v]=c;for(let i=0;i<q.length;i++){for(const u of B.byId[q[i]].adj){const k=q[i]<u?q[i]+'|'+u:u+'|'+q[i];if(bridges.has(k)||comp[u]!==undefined)continue;comp[u]=c;q.push(u);}}c++;}
const sizes={};ids.forEach(v=>sizes[comp[v]]=(sizes[comp[v]]||0)+1);
// 駅が「橋でない道だけで、名古屋とつながる／ほかの駅ともつながる」＝ 行き方が複数ある。ここでは「駅の成分が2マス以上（輪の中）」を数える
const multi=A.STATIONS.filter(s=>sizes[comp[s.id]]>1 && (()=>{ // 輪に属する
  return B.byId[s.id].adj.some(u=>{const k=s.id<u?s.id+'|'+u:u+'|'+s.id;return !bridges.has(k);});})());
const mainComp=comp[A.START_STATION];
const same=A.STATIONS.filter(s=>comp[s.id]===mainComp);
console.log('橋の数',bridges.size,' 輪にのっている駅',multi.length,'/'+A.STATIONS.length+' ・名古屋と同じ輪(2通り以上で行ける)',same.length,'/'+A.STATIONS.length);
console.log('行き方が1通りの駅:',A.STATIONS.filter(s=>comp[s.id]!==mainComp).map(s=>s.name).join(' '));
