// kuromoji の辞書ファイル(node_modules/kuromoji/dict/*.dat.gz)を
// public/dict/ にコピーする。npm install 後に自動実行される(package.json の postinstall)。
// 辞書ファイル自体はリポジトリに含めない(.gitignore 参照)ため、
// クローン直後や CI では必ずこのスクリプトを経由する必要がある。
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const srcDir = join(projectRoot, 'node_modules', 'kuromoji', 'dict');
const destDir = join(projectRoot, 'public', 'dict');

if (!existsSync(srcDir)) {
  console.warn('[sync-dict] node_modules/kuromoji/dict が見つかりません。npm install を先に実行してください。');
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith('.dat.gz'));
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}

console.log(`[sync-dict] ${files.length} 個の辞書ファイルを public/dict/ にコピーしました`);
