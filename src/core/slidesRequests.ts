/**
 * Google Slides API の `batchUpdate` リクエストを組み立てる純粋関数群。
 * ネットワーク呼び出しは一切行わない(実際の呼び出しは worker/slidesClient.ts が担当)。
 * PLAN.md 3.5節の書き込み手順に対応する。
 */
import { hexToRgbFraction, isValidHexColor } from './color';
import type { EmuRect } from './emu';

/** 生成したルビ用シェイプの description に付けるマーカー。一括削除・再検出に使う。 */
export const RUBY_DESCRIPTION_PREFIX = 'rubi:v1';

export interface RubyWriteItem {
  /** 新規に作成するテキストボックスの objectId(呼び出し側が一意に生成する) */
  objectId: string;
  box: EmuRect;
  kana: string;
  fontSizePt: number;
  /** フォント(全体設定または単語ごとの上書き。省略時は Slides の既定フォント) */
  fontFamily?: string;
  /** 文字色(`#rrggbb`。省略時は Slides の既定色) */
  color?: string;
  /** 対応する元シェイプの objectId。グループ化に使う。マッチしなかった場合は省略。 */
  matchedShapeObjectId?: string;
}

/** description 文字列を組み立てる。元シェイプが分かっていればそれも埋め込む。 */
export function buildDescription(matchedShapeObjectId?: string): string {
  return matchedShapeObjectId
    ? `${RUBY_DESCRIPTION_PREFIX}:${matchedShapeObjectId}`
    : `${RUBY_DESCRIPTION_PREFIX}:`;
}

/** description がルビ用シェイプのものかどうかを判定する。 */
export function isRubyDescription(description: string | null | undefined): boolean {
  return typeof description === 'string' && description.startsWith(`${RUBY_DESCRIPTION_PREFIX}:`);
}

/** description から元シェイプの objectId を取り出す(埋め込まれていなければ null)。 */
export function extractMatchedShapeObjectId(description: string): string | null {
  if (!isRubyDescription(description)) return null;
  const rest = description.slice(`${RUBY_DESCRIPTION_PREFIX}:`.length);
  return rest.length > 0 ? rest : null;
}

/**
 * ルビ用テキストボックスを作成する batchUpdate リクエスト列を組み立てる。
 * 1件につき: createShape → insertText → updateTextStyle(フォントサイズ)
 * → updateParagraphStyle(中央揃え) → updateShapeProperties(背景・枠線なし)
 * → updatePageElementAltText(削除用マーカー)、の順。
 */
export function buildCreateRubyRequests(pageObjectId: string, items: RubyWriteItem[]): unknown[] {
  const requests: unknown[] = [];

  for (const item of items) {
    requests.push({
      createShape: {
        objectId: item.objectId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId,
          size: {
            width: { magnitude: item.box.width, unit: 'EMU' },
            height: { magnitude: item.box.height, unit: 'EMU' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: item.box.x,
            translateY: item.box.y,
            unit: 'EMU',
          },
        },
      },
    });
    requests.push({
      insertText: {
        objectId: item.objectId,
        insertionIndex: 0,
        text: item.kana,
      },
    });
    const textStyle: Record<string, unknown> = { fontSize: { magnitude: item.fontSizePt, unit: 'PT' } };
    const textStyleFields = ['fontSize'];
    if (item.fontFamily) {
      textStyle.fontFamily = item.fontFamily;
      textStyleFields.push('fontFamily');
    }
    if (item.color && isValidHexColor(item.color)) {
      textStyle.foregroundColor = { opaqueColor: { rgbColor: hexToRgbFraction(item.color) } };
      textStyleFields.push('foregroundColor');
    }
    requests.push({
      updateTextStyle: {
        objectId: item.objectId,
        style: textStyle,
        textRange: { type: 'ALL' },
        fields: textStyleFields.join(','),
      },
    });
    requests.push({
      updateParagraphStyle: {
        objectId: item.objectId,
        style: { alignment: 'CENTER', lineSpacing: 100 },
        textRange: { type: 'ALL' },
        fields: 'alignment,lineSpacing',
      },
    });
    requests.push({
      updateShapeProperties: {
        objectId: item.objectId,
        shapeProperties: {
          shapeBackgroundFill: { propertyState: 'NOT_RENDERED' },
          outline: { propertyState: 'NOT_RENDERED' },
        },
        // 【重要】実機テストで発見: ShapeProperties.autofit は読み取り専用フィールドで、
        // updateShapeProperties の fields に含めると
        // "Invalid field mask: * includes read-only fields" エラーになる。
        // テキストの自動リサイズを抑制したい場合は、シェイプ作成時にテキストが
        // 収まる十分なサイズを指定することで対応する(このシェイプは常に
        // 実測ピクセルサイズどおりに作成しているため、通常は問題にならない)。
        fields: 'shapeBackgroundFill,outline',
      },
    });
    requests.push({
      updatePageElementAltText: {
        objectId: item.objectId,
        description: buildDescription(item.matchedShapeObjectId),
      },
    });
  }

  return requests;
}

export interface GroupPlan {
  groupObjectId: string;
  childrenObjectIds: string[];
}

/**
 * マッチした元シェイプごとに、そのシェイプと関連するルビ群をまとめて
 * グループ化する計画を立てる(要件13: 元シェイプとルビ群をグループ化)。
 * マッチしなかったルビ(matchedShapeObjectId 無し)はグループ化の対象外。
 */
export function planGroups(items: RubyWriteItem[], generateGroupId: () => string): GroupPlan[] {
  const byShape = new Map<string, string[]>();
  for (const item of items) {
    if (!item.matchedShapeObjectId) continue;
    const list = byShape.get(item.matchedShapeObjectId) ?? [];
    list.push(item.objectId);
    byShape.set(item.matchedShapeObjectId, list);
  }
  const plans: GroupPlan[] = [];
  for (const [shapeId, rubyIds] of byShape) {
    plans.push({ groupObjectId: generateGroupId(), childrenObjectIds: [shapeId, ...rubyIds] });
  }
  return plans;
}

export function buildGroupRequests(plans: GroupPlan[]): unknown[] {
  return plans.map((p) => ({
    groupObjects: { groupObjectId: p.groupObjectId, childrenObjectIds: p.childrenObjectIds },
  }));
}

/** 指定した objectId 群を削除する batchUpdate リクエスト列を組み立てる(一括削除用)。 */
export function buildDeleteRequests(objectIds: string[]): unknown[] {
  return objectIds.map((id) => ({ deleteObject: { objectId: id } }));
}

export interface RecenterCorrection {
  objectId: string;
  deltaX: number;
  deltaY: number;
}

/**
 * `RecenterCorrection[]`(呼び出し側が実測して計算した移動量)から、
 * 位置を補正する batchUpdate リクエスト列を組み立てる(RELATIVE な translateX/Y)。
 *
 * 【重要】実機テストで発見した不具合: Slides は新規作成したテキストボックスの
 * 内部座標を、こちらが指定したサイズとは異なる基準矩形(例: 3,000,000EMU四方)に
 * 正規化し、`transform.scaleX`/`scaleY` で実効サイズを表現する。この正規化が
 * 縦横で大きく異なる倍率になる(=非一様スケーリングになる)場合、シェイプ自体の
 * 位置・実効サイズは指定どおりでも、その中の CENTER 揃えテキストの実際の
 * 描画位置がずれることがある(内部の中央揃え計算が非一様スケーリングの
 * 影響を受けるため、原因はブラックボックス)。Slides API 側でこれを
 * 検出・補正する術がないため、書き込み後に content script 側で実際の
 * 描画位置を DOM から測定し、意図していた位置とのズレをこの関数で
 * batchUpdate リクエストに変換して補正する(`writeController.ts` 参照。
 * 「作って」の「作」に振った「つく」が本文からずれて表示される不具合が
 * この方式で解消することを実機で確認済み)。
 */
export function buildRecenterRequests(corrections: RecenterCorrection[]): unknown[] {
  return corrections.map((c) => ({
    updatePageElementTransform: {
      objectId: c.objectId,
      transform: { translateX: c.deltaX, translateY: c.deltaY, scaleX: 1, scaleY: 1, unit: 'EMU' },
      applyMode: 'RELATIVE',
    },
  }));
}
