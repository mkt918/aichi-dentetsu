/* あいち電鉄 — エディターで保存した上書きデータ（ブラウザの localStorage）を読みこむ
 * props : { 駅ID: [[名前, アイコン, 価格, 名物度, 利回り?], ...] }  物件エディターで変えた物件（利回りは手で決めたときだけ）
 * meta  : { 駅ID: { name, region, desc } }  駅の名前・地域・説明の書きかえ
 * maps  : { ID: { name, start, scale, cells: [[列, 行, 種類, 駅ID], ...] } }  マップエディターで作った盤面
 * mapId : 遊ぶ盤面のID（用意された盤面 full/nagoya/… か、自作の盤面）
 * extra : [{ id, name, region, lon, lat, desc }]  エディターで足した駅
 * stations.js のあと、data.js より前に読みこまれ、駅の元データ（RAW_STATIONS）に反映する。 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const KEY = 'aichi-dentetsu-edit-v2'; // v2: 駅を実際の位置の92駅に作り直した（前の駅の書きかえ・自作マップは使えないので読まない）
  function load() {
    try { const o = JSON.parse(root.localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  function save(o) { try { root.localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  const OV = Object.assign({ props: {}, meta: {}, extra: [] }, load());
  if (!Array.isArray(OV.extra)) OV.extra = [];
  if (!OV.maps || typeof OV.maps !== 'object') OV.maps = {};
  if (!OV.meta || typeof OV.meta !== 'object') OV.meta = {};
  A.OVERRIDES = OV;
  A.Overrides = { KEY, load, save };

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
