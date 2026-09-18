import { describe, expect, it } from 'vitest';
import {
  buildCreateRubyRequests,
  buildDeleteRequests,
  buildDescription,
  buildGroupRequests,
  buildRecenterRequests,
  extractMatchedShapeObjectId,
  isRubyDescription,
  planGroups,
  type RubyWriteItem,
} from '@core/slidesRequests';

const box = { x: 100, y: 200, width: 300, height: 400 };

describe('buildDescription / isRubyDescription / extractMatchedShapeObjectId', () => {
  it('元シェイプIDが分かっている場合はdescriptionに埋め込む', () => {
    const d = buildDescription('shape-123');
    expect(d).toBe('rubi:v1:shape-123');
    expect(isRubyDescription(d)).toBe(true);
    expect(extractMatchedShapeObjectId(d)).toBe('shape-123');
  });

  it('元シェイプIDが不明な場合でも判別可能なdescriptionになる', () => {
    const d = buildDescription(undefined);
    expect(d).toBe('rubi:v1:');
    expect(isRubyDescription(d)).toBe(true);
    expect(extractMatchedShapeObjectId(d)).toBeNull();
  });

  it('無関係なdescriptionはfalseと判定する', () => {
    expect(isRubyDescription('altテキストの説明')).toBe(false);
    expect(isRubyDescription(null)).toBe(false);
    expect(isRubyDescription(undefined)).toBe(false);
  });
});

describe('buildCreateRubyRequests', () => {
  it('1件につき6種類のリクエストを正しい順序で組み立てる', () => {
    const items: RubyWriteItem[] = [
      { objectId: 'ruby-1', box, kana: 'たべる', fontSizePt: 12, matchedShapeObjectId: 'shape-1' },
    ];
    const requests = buildCreateRubyRequests('page-1', items) as Array<Record<string, unknown>>;
    expect(requests).toHaveLength(6);
    expect(Object.keys(requests[0] as object)).toEqual(['createShape']);
    expect(Object.keys(requests[1] as object)).toEqual(['insertText']);
    expect(Object.keys(requests[2] as object)).toEqual(['updateTextStyle']);
    expect(Object.keys(requests[3] as object)).toEqual(['updateParagraphStyle']);
    expect(Object.keys(requests[4] as object)).toEqual(['updateShapeProperties']);
    expect(Object.keys(requests[5] as object)).toEqual(['updatePageElementAltText']);
  });

  it('createShapeにページID・位置・サイズをEMU単位で設定する', () => {
    const items: RubyWriteItem[] = [{ objectId: 'ruby-1', box, kana: 'た', fontSizePt: 10 }];
    const [createShapeReq] = buildCreateRubyRequests('page-42', items) as [
      {
        createShape: {
          objectId: string;
          elementProperties: {
            pageObjectId: string;
            size: { width: { magnitude: number; unit: string }; height: { magnitude: number; unit: string } };
            transform: { translateX: number; translateY: number; unit: string };
          };
        };
      },
    ];
    expect(createShapeReq.createShape.objectId).toBe('ruby-1');
    expect(createShapeReq.createShape.elementProperties.pageObjectId).toBe('page-42');
    expect(createShapeReq.createShape.elementProperties.size.width).toEqual({ magnitude: 300, unit: 'EMU' });
    expect(createShapeReq.createShape.elementProperties.size.height).toEqual({ magnitude: 400, unit: 'EMU' });
    expect(createShapeReq.createShape.elementProperties.transform.translateX).toBe(100);
    expect(createShapeReq.createShape.elementProperties.transform.translateY).toBe(200);
    expect(createShapeReq.createShape.elementProperties.transform.unit).toBe('EMU');
  });

  it('fontFamily/colorを指定した場合、updateTextStyleに含め、fieldsマスクにも追加する', () => {
    const items: RubyWriteItem[] = [
      { objectId: 'ruby-1', box, kana: 'た', fontSizePt: 10, fontFamily: 'Kosugi Maru', color: '#ff0000' },
    ];
    const [, , updateTextStyleReq] = buildCreateRubyRequests('page-1', items) as [
      unknown,
      unknown,
      {
        updateTextStyle: {
          style: { fontFamily?: string; foregroundColor?: { opaqueColor: { rgbColor: { red: number; green: number; blue: number } } } };
          fields: string;
        };
      },
    ];
    expect(updateTextStyleReq.updateTextStyle.style.fontFamily).toBe('Kosugi Maru');
    expect(updateTextStyleReq.updateTextStyle.style.foregroundColor).toEqual({
      opaqueColor: { rgbColor: { red: 1, green: 0, blue: 0 } },
    });
    expect(updateTextStyleReq.updateTextStyle.fields).toBe('fontSize,fontFamily,foregroundColor');
  });

  it('fontFamily/colorを指定しない場合、fieldsマスクはfontSizeのみ', () => {
    const items: RubyWriteItem[] = [{ objectId: 'ruby-1', box, kana: 'た', fontSizePt: 10 }];
    const [, , updateTextStyleReq] = buildCreateRubyRequests('page-1', items) as [
      unknown,
      unknown,
      { updateTextStyle: { style: Record<string, unknown>; fields: string } },
    ];
    expect(updateTextStyleReq.updateTextStyle.fields).toBe('fontSize');
    expect(updateTextStyleReq.updateTextStyle.style.fontFamily).toBeUndefined();
    expect(updateTextStyleReq.updateTextStyle.style.foregroundColor).toBeUndefined();
  });

  it('不正なカラーコードは無視する(fontSizeのみのfieldsマスクになる)', () => {
    const items: RubyWriteItem[] = [{ objectId: 'ruby-1', box, kana: 'た', fontSizePt: 10, color: 'red' }];
    const [, , updateTextStyleReq] = buildCreateRubyRequests('page-1', items) as [
      unknown,
      unknown,
      { updateTextStyle: { fields: string } },
    ];
    expect(updateTextStyleReq.updateTextStyle.fields).toBe('fontSize');
  });

  it('insertTextに読みを設定する', () => {
    const items: RubyWriteItem[] = [{ objectId: 'ruby-1', box, kana: 'がっこう', fontSizePt: 10 }];
    const [, insertTextReq] = buildCreateRubyRequests('page-1', items) as [
      unknown,
      { insertText: { objectId: string; text: string; insertionIndex: number } },
    ];
    expect(insertTextReq.insertText).toEqual({ objectId: 'ruby-1', text: 'がっこう', insertionIndex: 0 });
  });

  it('description(削除用マーカー)に元シェイプIDを埋め込む', () => {
    const items: RubyWriteItem[] = [
      { objectId: 'ruby-1', box, kana: 'た', fontSizePt: 10, matchedShapeObjectId: 'shape-99' },
    ];
    const requests = buildCreateRubyRequests('page-1', items) as Array<{
      updatePageElementAltText?: { description: string };
    }>;
    const altTextReq = requests.find((r) => r.updatePageElementAltText);
    expect(altTextReq?.updatePageElementAltText?.description).toBe('rubi:v1:shape-99');
  });

  it('複数件を渡すと件数分のリクエスト列を組み立てる', () => {
    const items: RubyWriteItem[] = [
      { objectId: 'ruby-1', box, kana: 'た', fontSizePt: 10 },
      { objectId: 'ruby-2', box, kana: 'まな', fontSizePt: 10 },
    ];
    const requests = buildCreateRubyRequests('page-1', items);
    expect(requests).toHaveLength(12);
  });
});

describe('planGroups / buildGroupRequests', () => {
  it('同じ元シェイプに紐づくルビをまとめて1つのグループ計画にする', () => {
    const items: RubyWriteItem[] = [
      { objectId: 'ruby-1', box, kana: 'つい', fontSizePt: 10, matchedShapeObjectId: 'shape-A' },
      { objectId: 'ruby-2', box, kana: 'か', fontSizePt: 10, matchedShapeObjectId: 'shape-A' },
      { objectId: 'ruby-3', box, kana: 'た', fontSizePt: 10, matchedShapeObjectId: 'shape-B' },
    ];
    let counter = 0;
    const plans = planGroups(items, () => `group-${++counter}`);
    expect(plans).toHaveLength(2);
    const planA = plans.find((p) => p.childrenObjectIds.includes('shape-A'));
    expect(planA?.childrenObjectIds).toEqual(['shape-A', 'ruby-1', 'ruby-2']);
  });

  it('マッチしなかったルビ(matchedShapeObjectId無し)はグループ化しない', () => {
    const items: RubyWriteItem[] = [{ objectId: 'ruby-1', box, kana: 'た', fontSizePt: 10 }];
    const plans = planGroups(items, () => 'group-1');
    expect(plans).toHaveLength(0);
  });

  it('buildGroupRequestsはgroupObjectsリクエストに変換する', () => {
    const requests = buildGroupRequests([{ groupObjectId: 'g1', childrenObjectIds: ['a', 'b'] }]);
    expect(requests).toEqual([{ groupObjects: { groupObjectId: 'g1', childrenObjectIds: ['a', 'b'] } }]);
  });
});

describe('buildDeleteRequests', () => {
  it('objectIdごとにdeleteObjectリクエストを作る', () => {
    const requests = buildDeleteRequests(['a', 'b', 'c']);
    expect(requests).toEqual([
      { deleteObject: { objectId: 'a' } },
      { deleteObject: { objectId: 'b' } },
      { deleteObject: { objectId: 'c' } },
    ]);
  });

  it('空配列なら空配列を返す', () => {
    expect(buildDeleteRequests([])).toEqual([]);
  });
});

describe('buildRecenterRequests', () => {
  it('updatePageElementTransform(RELATIVE)に変換する', () => {
    const requests = buildRecenterRequests([{ objectId: 'ruby-1', deltaX: -175, deltaY: 15 }]);
    expect(requests).toEqual([
      {
        updatePageElementTransform: {
          objectId: 'ruby-1',
          transform: { translateX: -175, translateY: 15, scaleX: 1, scaleY: 1, unit: 'EMU' },
          applyMode: 'RELATIVE',
        },
      },
    ]);
  });
});
