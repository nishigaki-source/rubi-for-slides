// Chromeウェブストア提出用の zip を作る。
//
// 【重要・実機(Developer Dashboard)で発見した制約】manifest.json に "key" フィールドが
// あると、ストアへの新規アップロードは
// 「マニフェストでは key フィールドを使用できません」というエラーで拒否される。
// "key" はローカルで `chrome://extensions` の「パッケージ化されていない拡張機能を
// 読み込む」を使う際に拡張機能IDを固定するためのもので(README参照)、ストア側は
// 初回公開時に独自のIDを発行する仕組みのため、意図的に許可していない。
//
// もう1点、ストアが発行した拡張機能ID(boccgohdphepnoaenacpckicbdinihoc)は、
// ローカル用の固定ID(key 由来)とは別物。OAuth クライアントIDは拡張機能IDと
// 紐づくため、公開版には専用のクライアント(Cloud Console で「Chrome 拡張機能」
// タイプ、アイテムID = ストアのID で作成)のIDを使う必要がある。
//
// ローカルの動作確認は `dist/`(key 付き、固定ID、開発用クライアントID)のままに
// しておきたいので、このスクリプトは `dist/` を `dist-store/` にコピーしてから
// "key" の除去と `oauth2.client_id` の差し替えだけを行い、そちらを zip 化する
// (`dist/` 自体は一切変更しない)。
//
// 使い方: npm run build && node scripts/build-store-zip.mjs
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// 公開版(ストアID boccgohdphepnoaenacpckicbdinihoc)専用の OAuth クライアントID。
// クライアントIDは manifest に含まれて公開される値で、秘密情報ではない。
const STORE_OAUTH_CLIENT_ID = '665117522331-fj1fnhj4c7huepvtumq90t1m1fhe95ql.apps.googleusercontent.com';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = `${ROOT}dist`;
const DIST_STORE = `${ROOT}dist-store`;
const ZIP_PATH = `${ROOT}rubi-for-slides.zip`;

if (!existsSync(DIST)) {
  console.error('dist/ が見つかりません。先に `npm run build` を実行してください。');
  process.exit(1);
}

rmSync(DIST_STORE, { recursive: true, force: true });
cpSync(DIST, DIST_STORE, { recursive: true });

const manifestPath = `${DIST_STORE}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const hadKey = 'key' in manifest;
delete manifest.key;
if (!manifest.oauth2) {
  console.error('manifest.json に oauth2 がありません。');
  process.exit(1);
}
const devClientId = manifest.oauth2.client_id;
manifest.oauth2.client_id = STORE_OAUTH_CLIENT_ID;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

rmSync(ZIP_PATH, { force: true });
execSync(`zip -r "${ZIP_PATH}" . -x ".*"`, { cwd: DIST_STORE, stdio: 'inherit' });

console.log(`\n✓ ${ZIP_PATH} を作成しました(v${manifest.version})。`);
console.log(`  - key フィールド: ${hadKey ? '除去' : '元々なし'}`);
console.log(`  - oauth2.client_id: ${devClientId} -> ${STORE_OAUTH_CLIENT_ID}`);
