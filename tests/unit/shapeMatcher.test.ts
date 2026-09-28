import { describe, expect, it } from 'vitest';
import { findMatchingShapeObjectId, isCenterInsideAny, type ApiShapeInfo } from '@core/shapeMatcher';

describe('findMatchingShapeObjectId', () => {
  it('位置が近く、テキストも一致するシェイプを選ぶ', () => {
    const shapes: ApiShapeInfo[] = [
      { objectId: 'shape-1', text: '食べる学校生活は楽しい。', box: { x: 0, y: 0, width: 1000, height: 200 } },
      { objectId: 'shape-2', text: '別のテキストボックス', box: { x: 0, y: 5000, width: 1000, height: 200 } },
    ];
    const candidate = { text: '楽しい', box: { x: 500, y: 10, width: 200, height: 180 } };
    expect(findMatchingShapeObjectId(candidate, shapes)).toBe('shape-1');
  });

  it('テキストが一致しなくても、他に候補が無ければ位置だけで判断する', () => {
    const shapes: ApiShapeInfo[] = [
      { objectId: 'shape-1', text: '別の文', box: { x: 0, y: 0, width: 1000, height: 200 } },
    ];
    const candidate = { text: '食べる', box: { x: 100, y: 10, width: 200, height: 180 } };
    expect(findMatchingShapeObjectId(candidate, shapes)).toBe('shape-1');
  });

  it('位置だけで判断するとき、文字の無い図形(空のプレースホルダーなど)は候補にしない', () => {
    const shapes: ApiShapeInfo[] = [
      { objectId: 'empty-placeholder', text: '', box: { x: 0, y: 0, width: 1000, height: 200 } },
    ];
    const candidate = { text: '食べる', box: { x: 100, y: 10, width: 200, height: 180 } };
    expect(findMatchingShapeObjectId(candidate, shapes)).toBeNull();
  });

  it('空白・改行の違いは無視して文字を比べる(API の本文は段落内の改行を含む)', () => {
    const shapes: ApiShapeInfo[] = [
      { objectId: 'shape-1', text: '今日の目標：助詞「は」と\u000b「が」の違い', box: { x: 0, y: 0, width: 1000, height: 200 } },
      { objectId: 'shape-2', text: '別の文', box: { x: 0, y: 0, width: 1000, height: 200 } },
    ];
    const candidate = { text: '今日の目標：助詞「は」と「が」の違い', box: { x: 100, y: 10, width: 200, height: 180 } };
    expect(findMatchingShapeObjectId(candidate, shapes)).toBe('shape-1');
  });

  it('候補が僅差(曖昧)な場合はnullを返す(一意に決まらない)', () => {
    const shapes: ApiShapeInfo[] = [
      { objectId: 'shape-1', text: '食べる', box: { x: 0, y: 0, width: 100, height: 100 } },
      { objectId: 'shape-2', text: '食べる', box: { x: 10, y: 0, width: 100, height: 100 } },
    ];
    const candidate = { text: '食べる', box: { x: 5, y: 0, width: 100, height: 100 } };
    expect(findMatchingShapeObjectId(candidate, shapes)).toBeNull();
  });

  it('どのシェイプからも離れすぎている場合はnullを返す', () => {
    const shapes: ApiShapeInfo[] = [
      { objectId: 'shape-1', text: '食べる', box: { x: 0, y: 0, width: 100, height: 100 } },
    ];
    const candidate = { text: '食べる', box: { x: 100000, y: 100000, width: 100, height: 100 } };
    expect(findMatchingShapeObjectId(candidate, shapes)).toBeNull();
  });

  it('シェイプが1つも無ければnullを返す', () => {
    const candidate = { text: '食べる', box: { x: 0, y: 0, width: 100, height: 100 } };
    expect(findMatchingShapeObjectId(candidate, [])).toBeNull();
  });

  it('テキスト部分一致(候補がシェイプ全体の一部)でも正しく候補を絞り込む', () => {
    const shapes: ApiShapeInfo[] = [
      { objectId: 'shape-1', text: '4つのステップで楽しく学ぼう。', box: { x: 0, y: 0, width: 1000, height: 200 } },
      { objectId: 'shape-2', text: '別の内容', box: { x: 0, y: 5000, width: 1000, height: 200 } },
    ];
    const candidate = { text: '学ぼ', box: { x: 700, y: 10, width: 100, height: 180 } };
    expect(findMatchingShapeObjectId(candidate, shapes)).toBe('shape-1');
  });
});

describe('isCenterInsideAny(空のプレースホルダーの案内文を書き込みから外す)', () => {
  const placeholder = { x: 100, y: 100, width: 400, height: 200 };

  it('段落の中心が枠の中なら true', () => {
    expect(isCenterInsideAny({ x: 120, y: 110, width: 200, height: 30 }, [placeholder])).toBe(true);
  });

  it('枠の外なら false(ほかの図形の段落はそのまま書き込む)', () => {
    expect(isCenterInsideAny({ x: 120, y: 400, width: 200, height: 30 }, [placeholder])).toBe(false);
    expect(isCenterInsideAny({ x: 120, y: 110, width: 200, height: 30 }, [])).toBe(false);
  });
});
