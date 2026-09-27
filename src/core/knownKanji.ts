/**
 * 「省く漢字」の判定(利用者がもう習った漢字にはルビを振らない)。chrome.* にも DOM にも依存しない。
 *
 * 基準は2種類から1つを選ぶ:
 *   - 小学校の学年(学年別漢字配当表、1〜6年): 'grade-3' なら小3までに習う漢字を省く
 *   - JLPT のレベル(N5〜N1): 'jlpt-n4' なら N5・N4 の漢字を省く
 * どちらも「段階(小さいほど易しい)」に直して、「この段階以下の漢字は習った」とみなす同じ判定を使う。
 * 表に無い漢字は「まだ習っていない」とみなし、ルビを振る(安全側に倒す)。
 *
 * データは public/data/kanji-levels.json(scripts/build-kanji-levels.mjs で生成)。
 */
import { isKanji } from './kana';

export type SkipKanjiSetting =
  | 'none'
  | 'grade-1'
  | 'grade-2'
  | 'grade-3'
  | 'grade-4'
  | 'grade-5'
  | 'grade-6'
  | 'jlpt-n5'
  | 'jlpt-n4'
  | 'jlpt-n3'
  | 'jlpt-n2'
  | 'jlpt-n1';

export const GRADE_SKIP_SETTINGS: readonly SkipKanjiSetting[] = [
  'grade-1',
  'grade-2',
  'grade-3',
  'grade-4',
  'grade-5',
  'grade-6',
];
/** 易しい順(N5 → N1) */
export const JLPT_SKIP_SETTINGS: readonly SkipKanjiSetting[] = ['jlpt-n5', 'jlpt-n4', 'jlpt-n3', 'jlpt-n2', 'jlpt-n1'];

export function isSkipKanjiSetting(value: unknown): value is SkipKanjiSetting {
  return (
    value === 'none' ||
    (GRADE_SKIP_SETTINGS as readonly unknown[]).includes(value) ||
    (JLPT_SKIP_SETTINGS as readonly unknown[]).includes(value)
  );
}

/** 旧設定(v0.7.0 までの gradeFilterMaxGrade: 1〜6 | null)を新しい形に移す。 */
export function skipKanjiFromLegacyGrade(maxGrade: unknown): SkipKanjiSetting {
  if (typeof maxGrade === 'number' && Number.isInteger(maxGrade) && maxGrade >= 1 && maxGrade <= 6) {
    return `grade-${maxGrade}` as SkipKanjiSetting;
  }
  return 'none';
}

/** 漢字ごとの段階の表。grade: 学年(1〜6)、jlpt: JLPT のレベル(5 = N5 … 1 = N1)。 */
export interface KanjiLevelTables {
  grade: Readonly<Record<string, number>>;
  jlpt: Readonly<Record<string, number>>;
}

/** public/data/kanji-levels.json を検証して表に変換する(不正な値は読み飛ばす)。 */
export function parseKanjiLevelTables(raw: unknown): KanjiLevelTables {
  const pick = (value: unknown, min: number, max: number): Record<string, number> => {
    const out: Record<string, number> = {};
    if (typeof value !== 'object' || value === null) return out;
    for (const [kanji, level] of Object.entries(value as Record<string, unknown>)) {
      if (Array.from(kanji).length !== 1) continue;
      if (typeof level !== 'number' || !Number.isInteger(level) || level < min || level > max) continue;
      out[kanji] = level;
    }
    return out;
  };
  const obj = typeof raw === 'object' && raw !== null ? (raw as { grade?: unknown; jlpt?: unknown }) : {};
  return { grade: pick(obj.grade, 1, 6), jlpt: pick(obj.jlpt, 1, 5) };
}

/** 判定に使う形。levelTable: 漢字 → 段階(小さいほど易しい)、maxLevel: この段階以下を「習った」とみなす。 */
export interface KnownKanjiFilter {
  levelTable: Readonly<Record<string, number>>;
  maxLevel: number;
}

/** JLPT のレベル(5 = N5)を段階(N5 = 1 … N1 = 5)に直した表。設定が変わるたびに作り直さないよう覚えておく。 */
const jlptRankCache = new WeakMap<object, Record<string, number>>();
function jlptRankTable(jlpt: Readonly<Record<string, number>>): Record<string, number> {
  let table = jlptRankCache.get(jlpt);
  if (!table) {
    table = {};
    for (const [kanji, n] of Object.entries(jlpt)) table[kanji] = 6 - n;
    jlptRankCache.set(jlpt, table);
  }
  return table;
}

/** 設定から判定を作る。'none' なら null(省かない)。 */
export function createKnownKanjiFilter(setting: SkipKanjiSetting, tables: KanjiLevelTables): KnownKanjiFilter | null {
  if (setting === 'none') return null;
  if (setting.startsWith('grade-')) {
    return { levelTable: tables.grade, maxLevel: Number(setting.slice('grade-'.length)) };
  }
  const n = Number(setting.slice('jlpt-n'.length)); // N4 なら 4 → 段階 2(N5・N4 を習った)
  return { levelTable: jlptRankTable(tables.jlpt), maxLevel: 6 - n };
}

export function isKnownKanji(kanji: string, filter: KnownKanjiFilter): boolean {
  const level = filter.levelTable[kanji];
  return level !== undefined && level <= filter.maxLevel;
}

const REPEAT_MARK = '々';

/**
 * 文字列の中の漢字がすべて習ったものか(漢字以外は無視。表に無い漢字があれば false)。
 * 踊り字「々」は表に無いので、直前の漢字と同じ扱いにする(人々: 「人」を習っていれば「々」も習った)。
 */
export function areAllKanjiKnown(text: string, filter: KnownKanjiFilter): boolean {
  let hasKanji = false;
  let prevKnown = false;
  for (const char of text) {
    if (!isKanji(char)) continue;
    const known: boolean = char === REPEAT_MARK ? prevKnown : isKnownKanji(char, filter);
    if (char !== REPEAT_MARK) hasKanji = true;
    if (!known) return false;
    prevKnown = known;
  }
  return hasKanji;
}
