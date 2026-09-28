import { beforeAll, describe, expect, it } from 'vitest';
import kuromoji from 'kuromoji';
import { buildRubyTokens } from '@core/reading';
import { parseKanjiReadingTable } from '@core/kanjiSplit';
import type { ReadingServiceOptions, TokenizedWord } from '@core/types';
import kanjiReadingsJson from '../../public/data/kanji-readings.json';

// 本物の kuromoji(拡張機能と同じ辞書)で分かち書きしてから確かめる。
// 数字と助数詞の分かれ方は辞書しだいなので、手作りのトークンでは実際の不具合を再現できない。
let tokenize: (text: string) => TokenizedWord[];
beforeAll(async () => {
  const dicPath = decodeURIComponent(new URL('../../public/dict/', import.meta.url).pathname);
  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) =>
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)))
  );
  tokenize = (text) =>
    tokenizer.tokenize(text).map((t) => ({ surface: t.surface_form, reading: t.reading, pos: t.pos, posDetail1: t.pos_detail_1 }));
}, 30000);

const kanjiReadings = parseKanjiReadingTable(kanjiReadingsJson);

/** ルビを「表層形(読み)」の形で並べる(漢字ごと) */
function ruby(text: string, options: ReadingServiceOptions = { rubyMode: 'per-kanji', kanjiReadings }): string[] {
  return buildRubyTokens(tokenize(text), options).flatMap((t) =>
    t.rubyRanges.map((r) => `${Array.from(t.surface).slice(r.start, r.end).join('')}(${r.kana})`)
  );
}

describe('数字 + 助数詞の読み(実機で見つかった誤読)', () => {
  it('日付と時刻: 4月1日（水）午前9時30分', () => {
    expect(ruby('2026年4月1日（水）午前9時30分から')).toEqual([
      '年(ねん)', '月(がつ)', '1日(ついたち)', '水(すい)', '午(ご)', '前(ぜん)', '時(じ)', '分(ぷん)',
    ]);
  });

  it('一人・二人は数字と合わせて「ひとり」「ふたり」、ほかは「にん」', () => {
    // 熟字訓なので、漢字ごとの振り方でも「ひと|り」に分けない
    expect(ruby('一人ずつ')).toEqual(['一人(ひとり)']);
    expect(ruby('二十日')).toEqual(['二十日(はつか)']);
    expect(ruby('二人で', { rubyMode: 'per-word' })).toEqual(['二人(ふたり)']);
    expect(ruby('3人と1人', { rubyMode: 'per-word' })).toEqual(['人(にん)', '1人(ひとり)']);
    expect(ruby('四人', { rubyMode: 'per-word' })).toEqual(['四(よ)', '人(にん)']);
  });
});

describe('日付の「〜日」', () => {
  it('2〜10日・14日・20日・24日は数字と合わせた読み', () => {
    expect(ruby('3日と7日と20日と24日')).toEqual(['3日(みっか)', '7日(なのか)', '20日(はつか)', '24日(にじゅうよっか)']);
    expect(ruby('15日')).toEqual(['日(にち)']);
  });

  it('1日は「月」のあとなら「ついたち」、それ以外は「にち」(1日3回 = いちにち)', () => {
    expect(ruby('5月1日')).toEqual(['月(がつ)', '1日(ついたち)']);
    expect(ruby('1日3回')).toEqual(['日(にち)', '回(かい)']);
  });

  it('〜日間', () => {
    expect(ruby('3日間', { rubyMode: 'per-word' })).toEqual(['3日間(みっかかん)']);
  });
});

describe('音の変わる助数詞', () => {
  it('本・匹・杯: 1/6/8/10 は p、3 は b', () => {
    expect(ruby('1本、3本、5本、6本、10本', { rubyMode: 'per-word' })).toEqual([
      '本(ぽん)', '本(ぼん)', '本(ほん)', '本(ぽん)', '本(ぽん)',
    ]);
    expect(ruby('3匹と1杯', { rubyMode: 'per-word' })).toEqual(['匹(びき)', '杯(ぱい)']);
  });

  it('漢数字は数字の読みも変わる(一本 → いっ + ぽん、何本 → なん + ぼん)', () => {
    expect(ruby('一本', { rubyMode: 'per-word' })).toEqual(['一(いっ)', '本(ぽん)']);
    expect(ruby('六本', { rubyMode: 'per-word' })).toEqual(['六(ろっ)', '本(ぽん)']);
    expect(ruby('何本', { rubyMode: 'per-word' })).toEqual(['何(なん)', '本(ぼん)']);
    expect(ruby('二十本', { rubyMode: 'per-word' })).toEqual(['二(に)', '十(じゅっ)', '本(ぽん)']);
  });

  it('分: 1/3/4/6/8/10 は「ぷん」', () => {
    expect(ruby('1分、2分、3分、4分、5分、10分', { rubyMode: 'per-word' })).toEqual([
      '分(ぷん)', '分(ふん)', '分(ぷん)', '分(ぷん)', '分(ふん)', '分(ぷん)',
    ]);
    expect(ruby('一分', { rubyMode: 'per-word' })).toEqual(['一(いっ)', '分(ぷん)']);
    expect(ruby('十分間', { rubyMode: 'per-word' })).toEqual(['十(じゅっ)', '分間(ぷんかん)']);
  });

  it('回・歳・階', () => {
    expect(ruby('一回、六回、六歳、八歳', { rubyMode: 'per-word' })).toEqual([
      '一(いっ)', '回(かい)', '六(ろっ)', '回(かい)', '六(ろく)', '歳(さい)', '八(はっ)', '歳(さい)',
    ]);
    expect(ruby('三階と何階と2階', { rubyMode: 'per-word' })).toEqual(['三(さん)', '階(がい)', '何(なん)', '階(がい)', '階(かい)']);
  });

  it('月・時: 4・7・9 の読み', () => {
    expect(ruby('四時と九時', { rubyMode: 'per-word' })).toEqual(['四(よ)', '時(じ)', '九(く)', '時(じ)']);
    expect(ruby('4月と3ヶ月', { rubyMode: 'per-word' })).toEqual(['月(がつ)', 'ヶ月(かげつ)']);
  });
});

describe('変えてはいけないもの', () => {
  it('「十分な」(じゅうぶん)・一緒・一日中・月曜日', () => {
    expect(ruby('十分な時間', { rubyMode: 'per-word' })).toEqual(['十分(じゅうぶん)', '時間(じかん)']);
    expect(ruby('一緒に', { rubyMode: 'per-word' })).toEqual(['一緒(いっしょ)']);
    expect(ruby('月曜日', { rubyMode: 'per-word' })).toEqual(['月曜日(げつようび)']);
  });

  it('曜日の読みは数字か「日」のあとの括弧の中だけ(「水(みず)」はそのまま)', () => {
    expect(ruby('5/1(月)', { rubyMode: 'per-word' })).toEqual(['月(げつ)']);
    expect(ruby('（水）を飲む', { rubyMode: 'per-word' })).toEqual(['水(みず)', '飲(の)']);
  });
});

describe('辞書の読みの補正', () => {
  it('語頭の「づ」「ぢ」は「ず」「じ」にする(IPADIC は「図形」を「ヅケイ」としている)', () => {
    expect(ruby('図形と文字', { rubyMode: 'per-word' })).toEqual(['図形(ずけい)', '文字(もじ)']);
    expect(ruby('図形')).toEqual(['図(ず)', '形(けい)']);
  });

  it('語の途中の「づ」「ぢ」はそのまま', () => {
    expect(ruby('鼻血と三日月', { rubyMode: 'per-word' })).toEqual(['鼻血(はなぢ)', '三日月(みかづき)']);
  });
});

