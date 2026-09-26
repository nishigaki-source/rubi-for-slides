import { describe, expect, it } from 'vitest';
import { parseKanjiReadingTable, splitKanjiReading } from '@core/kanjiSplit';
import kanjiReadingsJson from '../../public/data/kanji-readings.json';

// 実際に同梱しているデータ(KANJIDIC2 由来)で検証する
const table = parseKanjiReadingTable(kanjiReadingsJson);

describe('splitKanjiReading', () => {
  it('要望の例: 始業式 → し/ぎょう/しき', () => {
    expect(splitKanjiReading('始業式', 'しぎょうしき', table)).toEqual(['し', 'ぎょう', 'しき']);
  });

  it.each([
    ['学校', 'がっこう', ['がっ', 'こう']], // 促音化
    ['発表', 'はっぴょう', ['はっ', 'ぴょう']], // 促音化+半濁音
    ['本棚', 'ほんだな', ['ほん', 'だな']], // 連濁
    ['人々', 'ひとびと', ['ひと', 'びと']], // 踊り字+連濁
    ['漢字', 'かんじ', ['かん', 'じ']],
    ['神経衰弱', 'しんけいすいじゃく', ['しん', 'けい', 'すい', 'じゃく']],
    ['図書館', 'としょかん', ['と', 'しょ', 'かん']],
  ])('%s(%s)を漢字ごとに分けられる', (run, reading, expected) => {
    expect(splitKanjiReading(run, reading, table)).toEqual(expected);
  });

  it.each([
    ['今日', 'きょう'],
    ['大人', 'おとな'],
    ['明日', 'あした'],
    ['一日', 'ついたち'],
  ])('熟字訓 %s(%s)は分けない(null → 熟語ルビのまま)', (run, reading) => {
    expect(splitKanjiReading(run, reading, table)).toBeNull();
  });

  it('1文字ならそのまま返す(表に無い漢字でも)', () => {
    expect(splitKanjiReading('業', 'ぎょう', {})).toEqual(['ぎょう']);
  });

  it('読みを知らない漢字を含むときは分けない', () => {
    expect(splitKanjiReading('始業', 'しぎょう', { 始: ['し'] })).toBeNull();
  });

  it('分け方が2通り以上あり優劣がつかないときは分けない', () => {
    const t = { 甲: ['あ', 'あい'], 乙: ['いう', 'う'] };
    expect(splitKanjiReading('甲乙', 'あいう', t)).toBeNull();
  });

  it('変化の少ない分け方を優先する', () => {
    // 「か」+「か」(連濁なし)と「かか」だけの分け方が競合しない単純な例: 変化なしが勝つ
    const t = { 甲: ['か'], 乙: ['か', 'が'] };
    expect(splitKanjiReading('甲乙', 'かか', t)).toEqual(['か', 'か']);
  });
});

describe('parseKanjiReadingTable', () => {
  it('不正な値は読み飛ばす', () => {
    expect(parseKanjiReadingTable({ readings: { 始: 'し,はじ', 業: 42, 二文字: 'に', 式: 'Shiki' } })).toEqual({
      始: ['し', 'はじ'],
    });
    expect(parseKanjiReadingTable(null)).toEqual({});
  });
});
