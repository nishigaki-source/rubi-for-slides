/**
 * 熟語の読みを、漢字1文字ごとの読みに分ける(「漢字ごとにルビを振る」機能)。
 * 例: 「始業式」+「しぎょうしき」→ ["し", "ぎょう", "しき"]
 *
 * kuromoji は単語単位の読みしか返さないため、漢字ごとの音読み・訓読みの一覧
 * (KANJIDIC2 由来、public/data/kanji-readings.json。scripts/build-kanji-readings.mjs で生成)
 * を使い、単語の読みを先頭から各漢字の読みで埋められる分け方を探す。
 *
 * 熟語の中で読みが変わるものも扱う:
 *   - 連濁(2文字目以降の頭が濁る): 本棚 ほん+だな、三百 さん+びゃく
 *   - 促音化(最後以外の末尾「く・き・つ・ち」が「っ」になる): 学校 がっ+こう、発表 はっ+ぴょう
 *   - 踊り字「々」は直前の漢字と同じ読み(連濁込み): 人々 ひと+びと
 *
 * 【安全側に倒す方針】熟字訓(今日・大人・明日 など)のように1文字ずつに分けられない語や、
 * 分け方が1通りに決まらない語は null を返し、呼び出し側は従来どおり単語全体に
 * 1つのルビ(熟語ルビ)を振る。学習用途では、誤った分け方を見せるより熟語ルビの方が害が少ない。
 * DOM にも chrome.* にも依存しない純粋関数。
 */

/** 漢字1文字 → その漢字の読み(ひらがな)の一覧。 */
export type KanjiReadingTable = Readonly<Record<string, readonly string[]>>;

/** public/data/kanji-readings.json(`{ readings: { 漢字: "よみ1,よみ2" } }`)を検証して表に変換する。 */
export function parseKanjiReadingTable(raw: unknown): KanjiReadingTable {
  const table: Record<string, string[]> = {};
  if (typeof raw !== 'object' || raw === null) return table;
  const readings = (raw as { readings?: unknown }).readings;
  if (typeof readings !== 'object' || readings === null) return table;
  for (const [kanji, value] of Object.entries(readings as Record<string, unknown>)) {
    if (typeof value !== 'string' || Array.from(kanji).length !== 1) continue;
    const list = value.split(',').filter((r) => /^[ぁ-ゖー]+$/.test(r));
    if (list.length > 0) table[kanji] = list;
  }
  return table;
}

const VOICED: Readonly<Record<string, readonly string[]>> = {
  か: ['が'], き: ['ぎ'], く: ['ぐ'], け: ['げ'], こ: ['ご'],
  さ: ['ざ'], し: ['じ'], す: ['ず'], せ: ['ぜ'], そ: ['ぞ'],
  た: ['だ'], ち: ['ぢ', 'じ'], つ: ['づ', 'ず'], て: ['で'], と: ['ど'],
  は: ['ば', 'ぱ'], ひ: ['び', 'ぴ'], ふ: ['ぶ', 'ぷ'], へ: ['べ', 'ぺ'], ほ: ['ぼ', 'ぽ'],
};
const SOKUON_FINALS = new Set(['く', 'き', 'つ', 'ち']);
const REPEAT_MARK = '々';

interface Variant {
  kana: string;
  /** 変化の回数(少ないほど自然な分け方とみなす) */
  cost: number;
}

function variantsOf(readings: readonly string[], isFirst: boolean, isLast: boolean): Variant[] {
  const out: Variant[] = [];
  for (const r of readings) {
    const heads: Variant[] = [{ kana: r, cost: 0 }];
    if (!isFirst) {
      for (const v of VOICED[r[0] as string] ?? []) heads.push({ kana: v + r.slice(1), cost: 1 });
    }
    for (const h of heads) {
      out.push(h);
      if (!isLast && h.kana.length >= 2 && SOKUON_FINALS.has(h.kana[h.kana.length - 1] as string)) {
        out.push({ kana: `${h.kana.slice(0, -1)}っ`, cost: h.cost + 1 });
      }
    }
  }
  return out;
}

/** 探索の打ち切り。長い熟語で分け方の候補が爆発しないようにする(実用上は数件に収まる)。 */
const MAX_SOLUTIONS = 32;

/**
 * 漢字だけが続く文字列 `kanjiRun` とその読み `reading` から、漢字1文字ごとの読みを返す。
 * 分けられない・分け方が1通りに決まらない場合は null。
 */
export function splitKanjiReading(
  kanjiRun: string,
  reading: string,
  table: KanjiReadingTable
): string[] | null {
  const chars = Array.from(kanjiRun);
  if (chars.length === 0 || reading.length === 0) return null;
  if (chars.length === 1) return [reading];

  const readingsPerChar: (readonly string[])[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;
    const base = c === REPEAT_MARK ? (i > 0 ? readingsPerChar[i - 1] : undefined) : table[c];
    if (!base || base.length === 0) return null; // 読みを知らない漢字がある → 分けない
    readingsPerChar.push(base);
  }
  const variants = readingsPerChar.map((rs, i) => variantsOf(rs, i === 0, i === chars.length - 1));

  const solutions: { parts: string[]; cost: number }[] = [];
  const parts: string[] = [];
  const search = (i: number, pos: number, cost: number): void => {
    if (solutions.length >= MAX_SOLUTIONS) return;
    if (i === chars.length) {
      if (pos === reading.length) solutions.push({ parts: [...parts], cost });
      return;
    }
    const seen = new Set<string>();
    for (const v of variants[i] as Variant[]) {
      if (seen.has(v.kana) || !reading.startsWith(v.kana, pos)) continue;
      seen.add(v.kana);
      parts.push(v.kana);
      search(i + 1, pos + v.kana.length, cost + v.cost);
      parts.pop();
    }
  };
  search(0, 0, 0);
  if (solutions.length === 0) return null;

  // 同じ分け方が別経路で見つかることがあるので、分け方ごとに最小コストへまとめる
  const byKey = new Map<string, { parts: string[]; cost: number }>();
  for (const s of solutions) {
    const key = s.parts.join('|');
    const prev = byKey.get(key);
    if (!prev || s.cost < prev.cost) byKey.set(key, s);
  }
  const unique = [...byKey.values()];
  const minCost = Math.min(...unique.map((s) => s.cost));
  const best = unique.filter((s) => s.cost === minCost);
  return best.length === 1 ? (best[0] as { parts: string[] }).parts : null;
}
