/* あいち電鉄 — エディターで保存した上書きデータ（ブラウザの localStorage）を読みこむ
 * pos   : { 駅ID: [x, y] }                 マップエディターで動かした駅の位置
 * edges : [[駅A, 駅B, オプション], ...]      マップエディターで変えた路線のつながり
 * props : { 駅ID: [[名前, アイコン, 価格, 名物度], ...] }  物件エディターで変えた物件 */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});
  const KEY = 'aichi-dentetsu-edit-v1';
  function load() {
    try { const o = JSON.parse(root.localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  function save(o) { try { root.localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function clear() { try { root.localStorage.removeItem(KEY); } catch (e) { /* 無視 */ } }
  A.OVERRIDES = Object.assign({ pos: {}, edges: null, props: {} }, load());
  A.Overrides = { KEY, load, save, clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);
