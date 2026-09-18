import { describe, expect, it } from 'vitest';
import { findMatchingShapeObjectId, type ApiShapeInfo } from '@core/shapeMatcher';

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
      { objectId: 'shape-1', text: '', box: { x: 0, y: 0, width: 1000, height: 200 } },
    ];
    const candidate = { text: '食べる', box: { x: 100, y: 10, width: 200, height: 180 } };
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
