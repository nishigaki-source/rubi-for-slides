// Chromeウェブストア提出用の zip を作る。
//
// 【重要・実機(Developer Dashboard)で発見した制約】manifest.json に "key" フィールドが
// あると、ストアへの新規アップロードは
// 「マニフェストでは key フィールドを使用できません」というエラーで拒否される。
// "key" はローカルで `chrome://extensions` の「パッケージ化されていない拡張機能を
// 読み込む」を使う際に拡張機能IDを固定するためのもので(README参照)、ストア側は
// 初回公開時に独自のIDを発行する仕組みのため、意図的に許可していない。
//
// ローカルの動作確認は `dist/`(key 付き、固定ID)のままにしておきたいので、
// このスクリプトは `dist/` を `dist-store/` にコピーしてから "key" だけを取り除き、
// そちらを zip 化する(`dist/` 自体は一切変更しない)。
//
// 使い方: npm run build && node scripts/build-store-zip.mjs
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

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
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

rmSync(ZIP_PATH, { force: true });
execSync(`zip -r "${ZIP_PATH}" . -x ".*"`, { cwd: DIST_STORE, stdio: 'inherit' });

console.log(`\n✓ ${ZIP_PATH} を作成しました(key フィールド${hadKey ? 'を除去' : 'は元々なし'})。`);
