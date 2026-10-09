/* あいち電鉄 — エディターで保存した上書きデータ（ブラウザの localStorage）を読みこむ
 * pos   : { 駅ID: [x, y] }                 マップエディターで動かした駅の位置
 * edges : [[駅A, 駅B, オプション], ...]      マップエディターで変えた路線のつながり
 * props : { 駅ID: [[名前, アイコン, 価格, 名物度], ...] }  物件エディターで変えた物件
 * meta  : { 駅ID: { name, region, desc } }  駅の名前・地域・説明の書きかえ
 * extra : [{ id, name, region, lon, lat, desc }]  エディターで足した駅
 * stations.js のあと、data.js より前に読みこまれ、駅の元データ（RAW_STATIONS）に反映する。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const KEY = 'aichi-dentetsu-edit-v1';
  function load() {
    try { const o = JSON.parse(root.localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  function save(o) { try { root.localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function clear() { try { root.localStorage.removeItem(KEY); } catch (e) { /* 無視 */ } }
  const OV = Object.assign({ pos: {}, edges: null, props: {}, meta: {}, extra: [] }, load());
  if (!Array.isArray(OV.extra)) OV.extra = [];
  if (!OV.meta || typeof OV.meta !== 'object') OV.meta = {};
  A.OVERRIDES = OV;
  A.Overrides = { KEY, load, save, clear };

  // 駅の元データに反映する（足した駅・名前・地域・説明）
  const RAW = A.RAW_STATIONS || [];
  OV.extra.forEach((x) => {
    if (!x || !x.id || RAW.some((r) => r.id === x.id)) return;
    RAW.push({ id: x.id, name: x.name || '新しい駅', region: x.region || 'owari', lon: +x.lon || 136.9, lat: +x.lat || 35.1, desc: x.desc || '', tag: x.tag || x.desc || '', items: [], custom: true });
  });
  RAW.forEach((r) => {
    const m = OV.meta[r.id];
    if (!m) return;
    if (m.name) r.name = m.name;
    if (m.region) r.region = m.region;
    if (m.desc != null && m.desc !== '') { r.desc = m.desc; if (r.custom) r.tag = m.desc.slice(0, 24); }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
