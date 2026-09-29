/**
 * 中国語の拼音(ピンイン)のルビ区間を作る(chrome.* にも DOM にも依存しない)。試作。
 *
 * 読みの計算は pinyin-pro(MIT)。多音字は語の辞書で判定する。拼音は漢字1文字に1音節なので、
 * 日本語の「漢字ごと」のルビと同じ形(1文字 = 1区間)で返す。これで、表示・書き込みの処理を
 * そのまま使える。漢字以外(数字・英字・記号・かな)には読みを付けない。
 *
 * 声調の書き方は、声調記号(hànzì)。「不」「一」の変調は、実際の発音に合わせて書く(bú qù、yí gè)。
 * 儿化(哪儿)は、辞書どおり「ér」のまま。女儿・儿子の「儿」と区別できないため(未決定事項)。
 */
import { customPinyin, pinyin } from 'pinyin-pro';
import { PINYIN_FIXES } from './pinyinFixes';
import type { RubyRange } from './types';

let fixesRegistered = false;

/** 補正表を登録する(pinyin-pro の内部の状態を書き換えるので、1回だけ行う) */
function registerFixes(): void {
  if (fixesRegistered) return;
  customPinyin({ ...PINYIN_FIXES });
  fixesRegistered = true;
}

/**
 * 文字(コードポイント)ごとの拼音。読みの無い文字(漢字以外)は空文字。
 * 返す配列の長さは Array.from(text).length と同じ。
 */
export function pinyinPerCodePoint(text: string): string[] {
  if (text.length === 0) return [];
  registerFixes();
  return pinyin(text, { toneType: 'symbol', type: 'all' }).map((entry) => (entry.isZh ? entry.pinyin : ''));
}

/** 段落の文字列から、拼音のルビ区間(コードポイント単位のインデックス)を作る。 */
export function buildPinyinRanges(text: string): RubyRange[] {
  const ranges: RubyRange[] = [];
  pinyinPerCodePoint(text).forEach((reading, i) => {
    if (reading.length > 0) ranges.push({ start: i, end: i + 1, kana: reading });
  });
  return ranges;
}
