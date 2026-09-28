/**
 * 数字 + 助数詞(4月、1日、30分、一人、三本 など)の読みを補正する。chrome.* にも DOM にも依存しない。
 *
 * kuromoji(IPADIC)は数字と助数詞を別々の語に分け、助数詞には単独の読みを付ける
 * (実機で確認: 4月 → ツキ、30分 → フン、一人 → イチ + ニン、1日(ついたち)→ ニチ、7日 → ナナ + ニチ)。
 * 日付・時刻・人数は日本語の教材に非常に多いので、数の値に応じて読みを直す。
 *
 * 直し方は3通り:
 *   - 助数詞の読みだけを直す(4月 → がつ、30分 → ぷん、3本 → ぼん)。算用数字にはルビを振らないので、これで足りる
 *   - 漢数字の読みも直す(一本 → いっ + ぽん、四時 → よ + じ)
 *   - 数字と助数詞をまとめて1語にする(1日 → ついたち、二人 → ふたり)。数字と助数詞に読みを分けられない語
 * 曜日の「(水)」の「水」は「すい」にする(kuromoji は「みず」と読む)。
 */
import { katakanaToHiragana } from './kana';
import type { TokenizedWord } from './types';

const KANJI_DIGITS: Readonly<Record<string, number>> = {
  〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const KANJI_UNITS: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };

/** 数を表す語か(算用数字・漢数字・「何」)。 */
function isNumberToken(token: TokenizedWord | undefined): boolean {
  if (!token) return false;
  if (/^[0-9０-９]+$/.test(token.surface)) return true;
  return token.posDetail1 === '数' && /^[〇一二三四五六七八九十百千何]+$/.test(token.surface);
}

/** 数の値。「何」は null(何本 → なんぼん のように「三」と同じ音の変化をする)。 */
function numberValue(surface: string): number | null {
  if (surface === '何') return null;
  if (/^[0-9０-９]+$/.test(surface)) {
    return Number(surface.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  }
  let total = 0;
  let current = 0;
  for (const c of surface) {
    const digit = KANJI_DIGITS[c];
    if (digit !== undefined) {
      current = current * 10 + digit;
      continue;
    }
    const unit = KANJI_UNITS[c];
    if (unit === undefined) return NaN;
    total += (current === 0 ? 1 : current) * unit;
    current = 0;
  }
  return total + current;
}

/**
 * 音の変わり方を決める「最後の桁」の分類。
 * 'p': 1・6・8・10(いっ・ろっ・はっ・じゅっ のあとで h → p)、'b': 3・何(さん・なん のあとで h → b)、
 * '4': 4(よん)、'other': それ以外。1000 の倍数(せん)は 'other'。
 */
type DigitClass = 'p' | 'b' | '4' | 'other';
function digitClass(value: number | null): DigitClass {
  if (value === null) return 'b';
  if (value >= 1000 && value % 1000 === 0) return 'other';
  const d = value % 10;
  if (d === 1 || d === 6 || d === 8 || d === 0) return 'p';
  if (d === 3) return 'b';
  if (d === 4) return '4';
  return 'other';
}

/** 漢数字の読みの最後を促音にする(いち → いっ、ろく → ろっ、はち → はっ、じゅう → じゅっ、ひゃく → ひゃっ)。 */
function toSokuon(reading: string): string {
  for (const [from, to] of [['いち', 'いっ'], ['ろく', 'ろっ'], ['はち', 'はっ'], ['じゅう', 'じゅっ'], ['ひゃく', 'ひゃっ']] as const) {
    if (reading.endsWith(from)) return reading.slice(0, -from.length) + to;
  }
  return reading;
}

/** 日付の「〜日」で、数字と合わせて特別な読みになるもの(1日は「月」のあとのときだけ) */
const DAY_READINGS: Readonly<Record<number, string>> = {
  1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか',
  8: 'ようか', 9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか',
};
const PERSON_READINGS: Readonly<Record<number, string>> = { 1: 'ひとり', 2: 'ふたり' };

interface CounterResult {
  /** 助数詞の読み(ひらがな)。undefined なら直さない */
  counter?: string;
  /** 漢数字の最後の語の読み(ひらがな)を直す関数 */
  number?: (reading: string, value: number | null) => string;
  /** 数字と助数詞をまとめた読み(ひらがな)。数字の語を含めて1語にする */
  whole?: string;
}

/** h 行で始まる助数詞(本・匹・杯・分・泊)の読み */
function hRowCounter(value: number | null, p: string, b: string, h: string, fourIsP: boolean): CounterResult {
  const cls = digitClass(value);
  if (cls === 'p') return { counter: p, number: toSokuon };
  if (cls === 'b') return { counter: b };
  if (cls === '4' && fourIsP) return { counter: p };
  return { counter: h };
}

/** k・s・t 行で始まる助数詞(回・個・階・歳・冊・件・軒)。1・8・10 は促音、6 は k 行のときだけ促音 */
function sokuonCounter(value: number | null, kRow: boolean): CounterResult {
  const d = value === null ? null : value % 10;
  const sokuon = d === 1 || d === 8 || d === 0 || (d === 6 && kRow);
  return sokuon && !(value !== null && value >= 1000 && value % 1000 === 0) ? { number: toSokuon } : {};
}

function counterReading(counter: string, value: number | null, afterMonth: boolean): CounterResult | null {
  const withMa = (r: CounterResult | null, suffix: string): CounterResult | null =>
    r && { ...r, ...(r.counter !== undefined ? { counter: r.counter + suffix } : {}), ...(r.whole ? { whole: r.whole + suffix } : {}) };
  switch (counter) {
    case '月':
      if (value === null || value < 1 || value > 12) return null;
      return {
        counter: 'がつ',
        number: (r) => (value === 4 ? 'し' : value === 7 ? 'しち' : value === 9 ? 'く' : r),
      };
    case '時':
      return { number: (r) => (value === 4 ? 'よ' : value === 7 ? 'しち' : value === 9 ? 'く' : r) };
    case '日':
    case '日間': {
      const suffix = counter === '日間' ? 'かん' : '';
      const day = value !== null && (value !== 1 || afterMonth) ? DAY_READINGS[value] : undefined;
      return day ? { whole: day + suffix } : { counter: 'にち' + suffix };
    }
    case '人': {
      const person = value !== null ? PERSON_READINGS[value] : undefined;
      if (person) return { whole: person };
      return { counter: 'にん', number: (r) => (value === 4 ? 'よ' : r) };
    }
    case '本':
      return hRowCounter(value, 'ぽん', 'ぼん', 'ほん', false);
    case '匹':
      return hRowCounter(value, 'ぴき', 'びき', 'ひき', false);
    case '杯':
      return hRowCounter(value, 'ぱい', 'ばい', 'はい', false);
    case '分':
      return hRowCounter(value, 'ぷん', 'ぷん', 'ふん', true);
    case '分間':
      return withMa(hRowCounter(value, 'ぷん', 'ぷん', 'ふん', true), 'かん');
    case '泊':
      return hRowCounter(value, 'ぱく', 'ぱく', 'はく', true);
    case '階':
      return value === null || value % 10 === 3 ? { counter: 'がい' } : sokuonCounter(value, true);
    case '回':
    case '個':
    case '件':
    case '軒':
      return sokuonCounter(value, true);
    case '歳':
    case '才':
    case '冊':
      return sokuonCounter(value, false);
    default:
      return null;
  }
}

const WEEKDAY_READINGS: Readonly<Record<string, string>> = {
  月: 'げつ', 火: 'か', 水: 'すい', 木: 'もく', 金: 'きん', 土: 'ど', 日: 'にち', 祝: 'しゅく',
};
const OPEN_PARENS = new Set(['(', '（']);
const CLOSE_PARENS = new Set([')', '）']);

const toKatakana = (hira: string): string =>
  hira.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/**
 * トークン列の数字 + 助数詞・曜日の読みを直す(表層形の連結は変えない)。
 * 読みはトークンと同じカタカナで返す。
 */
export function applyCounterReadings(tokens: TokenizedWord[]): TokenizedWord[] {
  const out: TokenizedWord[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as TokenizedWord;

    // 曜日: 数字か「日」のあとの「(水)」
    const beforeParen = out[out.length - 2];
    if (
      WEEKDAY_READINGS[token.surface] &&
      OPEN_PARENS.has(out[out.length - 1]?.surface ?? '') &&
      CLOSE_PARENS.has(tokens[i + 1]?.surface ?? '') &&
      (isNumberToken(beforeParen) || beforeParen?.surface.endsWith('日'))
    ) {
      out.push({ ...token, reading: toKatakana(WEEKDAY_READINGS[token.surface] as string) });
      continue;
    }

    // 助数詞: 直前が数(漢数字は「二」「十」のように複数の語に分かれるので、続く数の語をまとめて見る)
    let numStart = out.length;
    while (numStart > 0 && isNumberToken(out[numStart - 1])) numStart--;
    if (numStart === out.length) {
      out.push(token);
      continue;
    }
    const numberTokens = out.slice(numStart);
    const numberSurface = numberTokens.map((t) => t.surface).join('');
    const isArabic = /^[0-9０-９]+$/.test(numberSurface);
    const value = isArabic || !numberSurface.includes('何') ? numberValue(numberSurface) : null;
    if (value !== null && Number.isNaN(value)) {
      out.push(token);
      continue;
    }
    const afterMonth = out[numStart - 1]?.surface.endsWith('月') ?? false;
    const result = counterReading(token.surface, value, afterMonth);
    if (!result) {
      out.push(token);
      continue;
    }

    if (result.whole) {
      out.splice(numStart, numberTokens.length, {
        ...token,
        surface: numberSurface + token.surface,
        reading: toKatakana(result.whole),
        keepWhole: true,
      });
      continue;
    }
    const last = out[out.length - 1] as TokenizedWord;
    if (result.number && !isArabic && last.reading && last.reading !== '*') {
      out[out.length - 1] = { ...last, reading: toKatakana(result.number(katakanaToHiragana(last.reading), value)) };
    }
    out.push(result.counter !== undefined ? { ...token, reading: toKatakana(result.counter) } : token);
  }
  return out;
}
