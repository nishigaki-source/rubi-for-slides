import { describe, expect, it } from 'vitest';
import {
  exportUserDict,
  importUserDict,
  removeEntry,
  upsertEntry,
} from '@core/userDict';

describe('upsertEntry', () => {
  it('新しいエントリを追加する', () => {
    const dict = upsertEntry({}, { surface: '生憎', reading: 'あいにく' });
    expect(dict).toEqual({ 生憎: { reading: 'あいにく' } });
  });

  it('既存のエントリを上書きする', () => {
    const dict = upsertEntry({ 生憎: { reading: 'なまにく' } }, { surface: '生憎', reading: 'あいにく' });
    expect(dict).toEqual({ 生憎: { reading: 'あいにく' } });
  });

  it('表層形が空なら例外', () => {
    expect(() => upsertEntry({}, { surface: '  ', reading: 'あ' })).toThrow();
  });

  it('表層形に漢字が無ければ例外', () => {
    expect(() => upsertEntry({}, { surface: 'ひらがな', reading: 'ひらがな' })).toThrow();
  });

  it('読みも見た目も指定が無ければ例外', () => {
    expect(() => upsertEntry({}, { surface: '漢字' })).toThrow();
    expect(() => upsertEntry({}, { surface: '漢字', reading: '' })).toThrow();
  });

  it('読みがひらがな以外を含むなら例外', () => {
    expect(() => upsertEntry({}, { surface: '漢字', reading: 'カンジ' })).toThrow();
    expect(() => upsertEntry({}, { surface: '漢字', reading: 'kanji' })).toThrow();
  });

  it('読みに「|」で漢字ごとの区切りを入れられる', () => {
    expect(upsertEntry({}, { surface: '始業式', reading: 'し|ぎょう|しき' })).toEqual({
      始業式: { reading: 'し|ぎょう|しき' },
    });
  });

  it('区切りの前後が空になる「|」は例外', () => {
    for (const reading of ['|し', 'し|', 'し||ぎょう', '|']) {
      expect(() => upsertEntry({}, { surface: '始業', reading })).toThrow();
    }
  });

  it('元のdictを変更せず新しいオブジェクトを返す(イミュータブル)', () => {
    const original = { 既存: { reading: 'きそん' } };
    const next = upsertEntry(original, { surface: '生憎', reading: 'あいにく' });
    expect(original).toEqual({ 既存: { reading: 'きそん' } });
    expect(next).not.toBe(original);
  });

  it('見た目だけの指定(読み省略)を追加できる', () => {
    const dict = upsertEntry({}, { surface: '漢字', style: { color: '#ff0000' } });
    expect(dict).toEqual({ 漢字: { style: { color: '#ff0000' } } });
  });

  it('読みと見た目を両方指定できる', () => {
    const dict = upsertEntry({}, { surface: '漢字', reading: 'かんじ', style: { sizeRatio: 0.7 } });
    expect(dict).toEqual({ 漢字: { reading: 'かんじ', style: { sizeRatio: 0.7 } } });
  });

  it('sizeRatioが0以下なら例外', () => {
    expect(() => upsertEntry({}, { surface: '漢字', style: { sizeRatio: 0 } })).toThrow();
    expect(() => upsertEntry({}, { surface: '漢字', style: { sizeRatio: -1 } })).toThrow();
  });

  it('空文字のfontFamily/colorは無視される(スタイル無しとみなす)', () => {
    expect(() => upsertEntry({}, { surface: '漢字', style: { fontFamily: '', color: '' } })).toThrow();
  });
});

describe('removeEntry', () => {
  it('指定した表層形のエントリを削除する', () => {
    const dict = removeEntry({ 生憎: { reading: 'あいにく' }, 既存: { reading: 'きそん' } }, '生憎');
    expect(dict).toEqual({ 既存: { reading: 'きそん' } });
  });

  it('存在しないキーを指定してもエラーにならない', () => {
    const dict = removeEntry({ 既存: { reading: 'きそん' } }, '存在しない');
    expect(dict).toEqual({ 既存: { reading: 'きそん' } });
  });
});

describe('exportUserDict / importUserDict', () => {
  it('エクスポートしてインポートすると同じ内容になる', () => {
    const original = {
      生憎: { reading: 'あいにく' },
      東京都庁: { reading: 'とうきょうとちょう', style: { color: '#1a73e8', sizeRatio: 0.6 } },
    };
    const json = exportUserDict(original);
    const restored = importUserDict(json);
    expect(restored).toEqual(original);
  });

  it('不正なJSONはエラー', () => {
    expect(() => importUserDict('{invalid')).toThrow();
  });

  it('オブジェクトでないJSON(配列等)はエラー', () => {
    expect(() => importUserDict('[1,2,3]')).toThrow();
  });

  it('値がオブジェクトでないエントリはエラー', () => {
    expect(() => importUserDict('{"生憎": 123}')).toThrow();
    expect(() => importUserDict('{"生憎": "あいにく"}')).toThrow();
  });

  it('readingが文字列でなければエラー', () => {
    expect(() => importUserDict('{"生憎": {"reading": 123}}')).toThrow();
  });

  it('styleが不正な形式ならエラー', () => {
    expect(() => importUserDict('{"生憎": {"style": "赤"}}')).toThrow();
    expect(() => importUserDict('{"生憎": {"style": {"sizeRatio": "big"}}}')).toThrow();
  });
});
