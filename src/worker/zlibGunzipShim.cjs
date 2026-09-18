/**
 * kuromoji.js の BrowserDictionaryLoader は内部で
 *   var zlib = require("zlibjs/bin/gunzip.min.js");
 *   var gz = new zlib.Zlib.Gunzip(uint8array);
 *   var typed_array = gz.decompress();
 * という形で gzip 展開を行う。
 *
 * しかし zlibjs の該当ファイルは Google Closure Compiler 形式のエクスポート
 * (ファイル末尾の `.call(this)` で渡された `this` にプロパティを生やす方式)を
 * 使っており、Vite のバンドル処理(esbuild/RollupのCJS変換)ではこの `this` が
 * 期待通りに引き継がれず、`zlib.Zlib` が undefined になってしまう
 * (実機テストで発見: "TypeError: Cannot read properties of undefined (reading 'Gunzip')")。
 *
 * この既知の非互換性を避けるため、vite.config.ts の resolve.alias で
 * "zlibjs/bin/gunzip.min.js" の解決先をこのファイルに差し替え、
 * pako (純JS・同期API) を使って同じインターフェース
 * ({ Zlib: { Gunzip: class { decompress() {...} } } }) を提供する。
 * kuromoji.js 本体には一切手を加えていない。
 */
const pako = require('pako');

class Gunzip {
  constructor(buffer) {
    this.buffer = buffer;
  }
  decompress() {
    return pako.ungzip(this.buffer);
  }
}

module.exports = { Zlib: { Gunzip } };
