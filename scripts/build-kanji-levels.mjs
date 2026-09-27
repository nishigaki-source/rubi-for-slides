// 「省く漢字」の判定に使う、漢字ごとの段階のデータ public/data/kanji-levels.json を作る。
//
//   grade: 学年別漢字配当表(小学1〜6年、1,026字)。KANJIDIC2 の <grade> 1〜6 から。
//          学年ごとの字数(80/160/200/202/193/191)は 2020 年度からの配当表と一致する。
//   jlpt:  JLPT のレベル(5 = N5 … 1 = N1)。JLPT は 2010 年以降、公式の漢字リストを公表していないため、
//          学習者に広く使われている Jonathan Waller 氏のリスト(tanos.co.uk)を使う。
//
// 元データとライセンス:
//   - KANJIDIC2 https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
//     (Electronic Dictionary Research and Development Group、CC BY-SA 4.0)
//   - JLPT kanji lists https://www.tanos.co.uk/jlpt/ (Jonathan Waller、Creative Commons BY。
//     https://www.tanos.co.uk/jlpt/sharing/ に「出典を示せば自由に使ってよい」とある)
//     レベルごとの配布ファイル nX-kanji-char-eng.anki(Anki の SQLite 形式)を使う。
//     各レベルの Kanji のページ https://www.tanos.co.uk/jlpt/jlptX/kanji/ からダウンロードできる。
// 出典は JSON 内・README・プライバシーポリシー(docs/index.html)に記載する。
//
// 使い方:
//   node scripts/build-kanji-levels.mjs path/to/kanjidic2.xml path/to/dir-with-n1..n5.anki
// (元のファイルはリポジトリには含めない)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [kanjidicPath, ankiDir] = process.argv.slice(2);
if (!kanjidicPath || !ankiDir) {
  console.error('使い方: node scripts/build-kanji-levels.mjs path/to/kanjidic2.xml path/to/anki-dir');
  process.exit(1);
}
const OUT = new URL('../public/data/kanji-levels.json', import.meta.url);

const isSingleKanji = (s) => Array.from(s).length === 1 && /[一-鿿㐀-䶿々]/u.test(s);

// --- 学年(KANJIDIC2) ---
const xml = readFileSync(kanjidicPath, 'utf8');
const grade = {};
for (const block of xml.split('<character>').slice(1)) {
  const literal = block.match(/<literal>([^<]+)<\/literal>/)?.[1];
  const g = Number(block.match(/<grade>(\d+)<\/grade>/)?.[1]);
  if (literal && g >= 1 && g <= 6) grade[literal] = g;
}

// --- JLPT(tanos.co.uk) ---
const jlpt = {};
for (const n of [5, 4, 3, 2, 1]) {
  const db = new DatabaseSync(path.join(ankiDir, `n${n}.anki`), { readOnly: true });
  const rows = db
    .prepare("SELECT f.value AS value FROM fields f JOIN fieldModels m ON f.fieldModelId = m.id WHERE m.name = 'Front'")
    .all();
  db.close();
  for (const { value } of rows) {
    const kanji = String(value).replace(/<[^>]+>/g, '').trim();
    if (!isSingleKanji(kanji)) continue;
    if (jlpt[kanji] !== undefined) {
      console.error(`重複: ${kanji} が N${jlpt[kanji]} と N${n} の両方にある`);
      process.exit(1);
    }
    jlpt[kanji] = n;
  }
}

const count = (obj, v) => Object.values(obj).filter((x) => x === v).length;
const out = {
  _source: [
    'grade: KANJIDIC2 (https://www.edrdg.org/kanjidic/kanjidic2.xml.gz) by the Electronic Dictionary Research and Development Group, CC BY-SA 4.0.',
    'jlpt: JLPT kanji lists by Jonathan Waller (https://www.tanos.co.uk/jlpt/), Creative Commons BY. There is no official JLPT kanji list since 2010.',
  ],
  grade,
  jlpt,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(
  `wrote public/data/kanji-levels.json: grade ${[1, 2, 3, 4, 5, 6].map((g) => count(grade, g)).join('/')}` +
    `, jlpt N5..N1 ${[5, 4, 3, 2, 1].map((n) => count(jlpt, n)).join('/')}`
);
