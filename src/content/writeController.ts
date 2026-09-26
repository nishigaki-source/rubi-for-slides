/**
 * モード B(スライドへの書き込み)のオーケストレーション層。
 * DOM から測定した文字位置(px)を、Slides API から得たページ情報を使って
 * EMU に変換し、実際にスライドへルビ用テキストボックスを書き込む。
 *
 * モード A(overlayRenderer.ts)と同じ `rubyPlan.ts` の計算結果を使うため、
 * 「どこに・何の読みを・どのサイズで」という部分は表示モードと完全に一致する。
 */
import { expandRectForDefaultInsets, pxFontSizeToPoint, pxRectToEmuRect } from '../core/emu';
import {
  nextRequestId,
  type DeleteRubyRequest,
  type DeleteRubyResponse,
  type PageInfoRequest,
  type PageInfoResponse,
  type PresentationPagesRequest,
  type PresentationPagesResponse,
  type RecenterRubyRequest,
  type RecenterRubyResponse,
  type WriteRubyRequest,
  type WriteRubyResponse,
} from '../core/messages';
import { findMatchingShapeObjectId } from '../core/shapeMatcher';
import type { RecenterCorrection, RubyWriteItem } from '../core/slidesRequests';
import { parseSlidesUrl } from '../core/slidesUrl';
import { t } from '../shared/i18n';
import type { ReadingServiceOptions } from '../core/types';
import { domRectToRect, remapRectBetweenFrames, type Rect } from './geometry';
import { computeParagraphPlan } from './rubyPlan';
import { computeRubyBoxAboveBody } from './rubyLayout';
import { getPageContainerElement } from './selectors';
import { navigateToSlide } from './slideNavigator';
import { tokenizeText } from './tokenizeClient';
import { extractParagraphs } from './textExtractor';

export type WriteResult = { ok: true; writtenCount: number } | { ok: false; message: string };
export type WriteAllResult =
  | { ok: true; writtenCount: number; slideCount: number; failedSlideCount: number }
  | { ok: false; message: string };
export type DeleteResult = { ok: true; deletedCount: number } | { ok: false; message: string };

let objectIdCounter = 0;
function generateRubyObjectId(): string {
  objectIdCounter += 1;
  return `rubi-${Date.now().toString(36)}-${objectIdCounter}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** DOM 上にシェイプが実際にレンダリングされるまで待つ(サイズを持つまでポーリング)。 */
async function waitForRenderedElement(elementId: string, timeoutMs: number): Promise<Element | null> {
  const pollIntervalMs = 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const el = document.getElementById(elementId);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return el;
    }
    await sleep(pollIntervalMs);
  }
  return null;
}

/** これ未満のズレ(EMU)は補正しない。往復誤差・丸め誤差によるノイズ的な微調整を避けるため。 */
const MIN_CORRECTION_EMU = 1000;
/** 補正を試みる最大回数。1回の補正だけでは残差が残ることがあるため、収束するまで数回繰り返す。 */
const MAX_RECENTER_PASSES = 3;
/** 補正の batchUpdate 適用後、Slides 側の再描画が反映されるまでの待機時間(ミリ秒)。 */
const RECENTER_SETTLE_WAIT_MS = 500;

interface PendingRubyItem {
  objectId: string;
  /** 意図していたルビ自身のボックス(ビューポート px、EMU 変換前)。 */
  intendedBoxPx: Rect;
  /** intendedBoxPx を測ったときのスライドの枠(ビューポート px)。 */
  pageAtMeasurePx: Rect;
}

/**
 * 実際にレンダリングされているルビと、意図した位置とのズレ(EMU)を1件分測定する。
 *
 * 【重要・2026-09-26 実機で発見】意図した位置はビューポート座標で持っているため、書き込みの前後で
 * スライドが画面上で動くと(書き込み後に画面下部へ「このスライドをブラッシュアップ」の案内が出て
 * 編集領域が縮み、スライドが上に動く等)、正しい位置に置かれたルビを「ずれている」と誤判定し、
 * 動いた分だけ逆にずらしてしまっていた(ルビがどの行でも一律に約25px下にずれた。ユーザー報告)。
 * 比較の直前にスライドの枠 `pageNowPx` を測り直し、意図した位置をスライドに対する相対位置が
 * 同じになる現在の画面座標に移してから比べる。
 */
function measureRecenterCorrection(
  item: PendingRubyItem,
  pageNowPx: Rect,
  scaleX: number,
  scaleY: number
): RecenterCorrection | null {
  const el = document.getElementById(`editor-${item.objectId}`);
  if (!el) return null;
  const actualRect = el.getBoundingClientRect();
  if (actualRect.width === 0 || actualRect.height === 0) return null;

  const intended = remapRectBetweenFrames(item.intendedBoxPx, item.pageAtMeasurePx, pageNowPx);
  const intendedCenterX = intended.x + intended.width / 2;
  const intendedCenterY = intended.y + intended.height / 2;
  const actualCenterX = actualRect.x + actualRect.width / 2;
  const actualCenterY = actualRect.y + actualRect.height / 2;
  const deltaX = Math.round((intendedCenterX - actualCenterX) * scaleX);
  const deltaY = Math.round((intendedCenterY - actualCenterY) * scaleY);

  if (Math.abs(deltaX) < MIN_CORRECTION_EMU && Math.abs(deltaY) < MIN_CORRECTION_EMU) return null;
  return { objectId: item.objectId, deltaX, deltaY };
}

/**
 * 書き込み直後、実際に画面にレンダリングされたルビの位置を DOM から実測し、
 * 意図していた位置とのズレを補正する。1回の補正だけでは残差が残ることが
 * 実機で確認できたため、ズレが十分小さくなるか上限回数に達するまで、
 * 測定→補正を繰り返す。
 *
 * 【重要】実機テストで発見した不具合: Slides は新規作成したテキストボックスの
 * 内部座標を独自の基準矩形に正規化し、`transform.scaleX`/`scaleY` で実効
 * サイズを表現する(実際に確認: シェイプの `size` は常に 3,000,000EMU四方で、
 * 実効サイズはこの `scaleX`/`scaleY` 倍率で決まっていた)。この正規化が
 * 縦横で大きく異なる倍率になる(=非一様スケーリングになる)場合、シェイプ
 * 自体の位置・実効サイズは指定どおりでも、その中の CENTER 揃えテキストの
 * 実際の描画位置がずれることがある(実機で「作って」の「作」に振った
 * 「つく」が本文からずれて表示される不具合を確認。Slides API 側の
 * `presentations.get` で読み直したシェイプの矩形は意図どおりだったため、
 * シェイプの位置ではなくテキストの描画位置そのものがずれていると判明した)。
 * Slides API ではこれを検出・補正する術がないため、書き込み後に実際の
 * 画面上の位置を DOM から測定し、意図していた位置とのズレを実測して
 * 補正する方式にした。
 */
async function recenterByDom(
  pendingItems: PendingRubyItem[],
  measurePagePx: () => Rect | null,
  pageSizeEmu: { width: number; height: number },
  presentationId: string
): Promise<void> {
  for (const item of pendingItems) {
    await waitForRenderedElement(`editor-${item.objectId}`, 2000);
  }

  for (let pass = 0; pass < MAX_RECENTER_PASSES; pass++) {
    // 補正のたびに測り直す(補正の batchUpdate や案内の表示でスライドが動くことがあるため)
    const pageNowPx = measurePagePx();
    if (!pageNowPx || pageNowPx.width === 0 || pageNowPx.height === 0) return;
    const scaleX = pageSizeEmu.width / pageNowPx.width;
    const scaleY = pageSizeEmu.height / pageNowPx.height;
    const corrections = pendingItems
      .map((item) => measureRecenterCorrection(item, pageNowPx, scaleX, scaleY))
      .filter((c): c is RecenterCorrection => c !== null);

    if (corrections.length === 0) return;

    const req: RecenterRubyRequest = {
      type: 'rubi/recenter-ruby',
      requestId: nextRequestId(),
      presentationId,
      corrections,
    };
    try {
      const res = (await chrome.runtime.sendMessage(req)) as RecenterRubyResponse;
      if (!res.ok) {
        console.error('[ルビふり for Googleスライド] ルビ位置の補正に失敗しました', res.message);
        return;
      }
    } catch (err) {
      // 補正の失敗は書き込み自体の失敗にはしない(表示位置が多少ずれるだけで、内容は正しく書き込まれている)
      console.error('[ルビふり for Googleスライド] ルビ位置の補正に失敗しました', err);
      return;
    }

    await sleep(RECENTER_SETTLE_WAIT_MS);
  }
}

async function requestPageInfo(
  presentationId: string,
  pageObjectId: string
): Promise<{ pageSizeEmu: { width: number; height: number }; shapes: { objectId: string; text: string; box: { x: number; y: number; width: number; height: number } }[] }> {
  const req: PageInfoRequest = {
    type: 'rubi/get-page-info',
    requestId: nextRequestId(),
    presentationId,
    pageObjectId,
  };
  const res = (await chrome.runtime.sendMessage(req)) as PageInfoResponse;
  if (res.type === 'rubi/get-page-info-error') throw new Error(res.message);
  return res;
}

export interface WriteOptions {
  sizeRatio: number;
  readingOptions: ReadingServiceOptions;
  /** 元シェイプとルビをグループ化するか(既定 false。要件13、PLAN.md 3.5節) */
  groupWithOriginal?: boolean;
  /** 全体設定のフォント(省略時は Slides の既定フォント) */
  fontFamily?: string;
  /** 全体設定の色(省略時は Slides の既定色) */
  color?: string;
}

/**
 * 「今まさに画面表示されているページ」(pageObjectId 指定)に、画面表示中の
 * ルビと同じ内容を実際のテキストボックスとして書き込む。
 * モード B の中核処理。`writeRubyToCurrentSlide` と `writeRubyToAllSlides` の
 * 両方から、対象ページを切り替えつつ呼び出される。
 */
async function writeRubyToPage(
  presentationId: string,
  pageObjectId: string,
  options: WriteOptions
): Promise<WriteResult> {
  // スライドの枠(px→EMU 換算の基準)。スライドは画面上で動くことがあるため(下部の案内の表示等)、
  // 文字の位置を測るのと同じタイミングで毎回測り直す。
  const measurePagePx = (): Rect | null => {
    const el = getPageContainerElement(document, pageObjectId);
    return el ? domRectToRect(el.getBoundingClientRect()) : null;
  };
  if (!measurePagePx()) {
    return { ok: false, message: t('errorNoPageContainer') };
  }

  let pageInfo;
  try {
    pageInfo = await requestPageInfo(presentationId, pageObjectId);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const paragraphs = extractParagraphs();
  const items: RubyWriteItem[] = [];
  const pendingItems: PendingRubyItem[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.text.trim().length === 0) continue;

    let tokens;
    try {
      tokens = await tokenizeText(paragraph.text);
    } catch {
      continue; // トークン化に失敗した段落はスキップ(モードAと同じ方針)
    }

    // 文字の位置(plan)とスライドの枠を、await を挟まずに続けて測る
    const pageContainerPx = measurePagePx();
    if (!pageContainerPx) return { ok: false, message: t('errorNoPageContainer') };
    const plan = computeParagraphPlan(paragraph, tokens, options.readingOptions, options.sizeRatio, {
      fontFamily: options.fontFamily,
      color: options.color,
    });
    if (plan.length === 0) continue;

    const matchedShapeObjectId =
      findMatchingShapeObjectId(
        { text: paragraph.text, box: pxRectToEmuRect(plan[0]!.box, pageContainerPx, pageInfo.pageSizeEmu) },
        pageInfo.shapes
      ) ?? undefined;

    for (const placement of plan) {
      const kanaCharCount = Array.from(placement.kana).length;
      const rubyBoxPx = computeRubyBoxAboveBody(placement.box, placement.fontSizePx, kanaCharCount, placement.centerX);
      const box = expandRectForDefaultInsets(pxRectToEmuRect(rubyBoxPx, pageContainerPx, pageInfo.pageSizeEmu));
      const fontSizePt = pxFontSizeToPoint(placement.fontSizePx, pageContainerPx, pageInfo.pageSizeEmu);
      const objectId = generateRubyObjectId();
      pendingItems.push({ objectId, intendedBoxPx: rubyBoxPx, pageAtMeasurePx: pageContainerPx });
      items.push({
        objectId,
        box,
        kana: placement.kana,
        fontSizePt,
        fontFamily: placement.fontFamily,
        color: placement.color,
        matchedShapeObjectId,
      });
    }
  }

  if (items.length === 0) {
    return { ok: true, writtenCount: 0 };
  }

  const writeReq: WriteRubyRequest = {
    type: 'rubi/write-ruby',
    requestId: nextRequestId(),
    presentationId,
    pageObjectId,
    items,
    groupWithOriginal: options.groupWithOriginal ?? false,
  };
  const writeRes = (await chrome.runtime.sendMessage(writeReq)) as WriteRubyResponse;
  if (writeRes.type === 'rubi/write-ruby-error') {
    return { ok: false, message: writeRes.message };
  }
  await recenterByDom(pendingItems, measurePagePx, pageInfo.pageSizeEmu, presentationId);
  return { ok: true, writtenCount: writeRes.writtenCount };
}

/** 現在表示中のスライド1枚に、画面表示中のルビと同じ内容を実際のテキストボックスとして書き込む。 */
export async function writeRubyToCurrentSlide(options: WriteOptions): Promise<WriteResult> {
  const parsed = parseSlidesUrl(location.href);
  if (!parsed) {
    return { ok: false, message: t('errorCannotIdentifySlide') };
  }
  return writeRubyToPage(parsed.presentationId, parsed.pageObjectId, options);
}

/**
 * プレゼンテーション内の全スライドに書き込む。
 * Slides API はテキストの折り返し等のレイアウト情報を返さないため、
 * フィルムストリップのサムネイルを合成クリックしてページを1枚ずつ実際に
 * 画面表示しながら、`writeRubyToPage` で測定・書き込みを繰り返す
 * (PLAN.md 3.5節)。完了後、元々表示していたスライドへ戻す。
 */
export async function writeRubyToAllSlides(options: WriteOptions): Promise<WriteAllResult> {
  const parsed = parseSlidesUrl(location.href);
  if (!parsed) {
    return { ok: false, message: t('errorCannotIdentifySlide') };
  }
  const originalPageObjectId = parsed.pageObjectId;

  const pagesReq: PresentationPagesRequest = {
    type: 'rubi/get-presentation-pages',
    requestId: nextRequestId(),
    presentationId: parsed.presentationId,
  };
  const pagesRes = (await chrome.runtime.sendMessage(pagesReq)) as PresentationPagesResponse;
  if (pagesRes.type === 'rubi/get-presentation-pages-error') {
    return { ok: false, message: pagesRes.message };
  }
  const pageObjectIds = pagesRes.pageObjectIds;

  let totalWritten = 0;
  let failedSlideCount = 0;

  for (const pageObjectId of pageObjectIds) {
    const navigated = await navigateToSlide(pageObjectId);
    if (!navigated) {
      failedSlideCount += 1;
      continue;
    }
    const result = await writeRubyToPage(parsed.presentationId, pageObjectId, options);
    if (result.ok) {
      totalWritten += result.writtenCount;
    } else {
      failedSlideCount += 1;
    }
  }

  await navigateToSlide(originalPageObjectId);

  if (failedSlideCount === pageObjectIds.length && pageObjectIds.length > 0) {
    return { ok: false, message: t('errorAllSlidesFailed') };
  }

  return { ok: true, writtenCount: totalWritten, slideCount: pageObjectIds.length, failedSlideCount };
}

/** 書き込んだルビを一括削除する(要件14)。scope='current' なら現在のスライドのみ。 */
export async function deleteRuby(scope: 'current' | 'all'): Promise<DeleteResult> {
  const parsed = parseSlidesUrl(location.href);
  if (!parsed) {
    return { ok: false, message: t('errorCannotIdentifySlide') };
  }

  const req: DeleteRubyRequest = {
    type: 'rubi/delete-ruby',
    requestId: nextRequestId(),
    presentationId: parsed.presentationId,
    pageObjectId: scope === 'current' ? parsed.pageObjectId : undefined,
  };
  const res = (await chrome.runtime.sendMessage(req)) as DeleteRubyResponse;
  if (res.type === 'rubi/delete-ruby-error') {
    return { ok: false, message: res.message };
  }
  return { ok: true, deletedCount: res.deletedCount };
}
