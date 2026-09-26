// KANJIDIC2(EDRDG)から、常用漢字・人名用漢字の音読み・訓読みだけを抜き出して
// public/data/kanji-readings.json を作る。「漢字ごとにルビを振る」機能
// (src/core/kanjiSplit.ts)が、熟語の読みを1文字ずつに分けるために使う。
//
// 元データ: https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
// ライセンス: CC BY-SA 4.0(Electronic Dictionary Research and Development Group)
//   https://www.edrdg.org/edrdg/licence.html
// 生成した JSON も同じライセンスで配布する(出典表示は JSON 内・README・プライバシーポリシーに記載)。
//
// 使い方:
//   curl -O https://www.edrdg.org/kanjidic/kanjidic2.xml.gz && gunzip kanjidic2.xml.gz
//   node scripts/build-kanji-readings.mjs path/to/kanjidic2.xml
// (元の XML は約15MBあるためリポジトリには含めない)
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2];
if (!input) {
  console.error('使い方: node scripts/build-kanji-readings.mjs path/to/kanjidic2.xml');
  process.exit(1);
}
const OUT = new URL('../public/data/kanji-readings.json', import.meta.url);

const xml = readFileSync(input, 'utf8');
const dbVersion = xml.match(/<database_version>([^<]+)<\/database_version>/)?.[1] ?? 'unknown';
const created = xml.match(/<date_of_creation>([^<]+)<\/date_of_creation>/)?.[1] ?? 'unknown';

function katakanaToHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 「はじ.める」「-はじ.める」「あ.く-」→「はじ」「はじ」「あ」(送り仮名・接頭/接尾の印を除く) */
function normalizeKun(r) {
  return r.replace(/^-|-$/g, '').split('.')[0];
}

const readings = {};
let count = 0;
for (const block of xml.split('<character>').slice(1)) {
  const literal = block.match(/<literal>([^<]+)<\/literal>/)?.[1];
  // <grade>: 1〜6 = 教育漢字、8 = その他の常用漢字、9・10 = 人名用漢字。無いものは表外字として除く。
  const grade = block.match(/<grade>(\d+)<\/grade>/)?.[1];
  if (!literal || !grade) continue;

  const set = new Set();
  for (const m of block.matchAll(/<reading r_type="ja_on">([^<]+)<\/reading>/g)) {
    set.add(katakanaToHiragana(m[1]).replace(/^-|-$/g, ''));
  }
  for (const m of block.matchAll(/<reading r_type="ja_kun">([^<]+)<\/reading>/g)) {
    set.add(normalizeKun(m[1]));
  }
  const list = [...set].filter((r) => /^[ぁ-ゖー]+$/.test(r));
  if (list.length === 0) continue;
  readings[literal] = list.join(',');
  count += 1;
}

const out = {
  _source:
    'KANJIDIC2 (https://www.edrdg.org/kanjidic/kanjidic2.xml.gz) by the Electronic Dictionary Research and Development Group, used under CC BY-SA 4.0 (https://www.edrdg.org/edrdg/licence.html). Extracted: jōyō and jinmeiyō kanji, on/kun readings only (hiragana, okurigana removed).',
  _version: `${dbVersion} (${created})`,
  readings,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${count} kanji to public/data/kanji-readings.json`);
