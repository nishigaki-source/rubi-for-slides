/**
 * Google Slides API(v1)への実際のネットワーク呼び出しを担当する。
 * 認証は auth.ts、リクエスト内容の組み立ては core/slidesRequests.ts が担当し、
 * このファイルは「HTTP でどう送るか」だけに専念する。
 */
import { isRubyDescription } from '../core/slidesRequests';
import { getAuthToken, revokeAuthToken } from './auth';

const API_BASE = 'https://slides.googleapis.com/v1';

/** Slides API のレスポンス JSON のうち、このファイルが実際に使うフィールドだけの最小限の型。 */
interface SlidesApiTextRun {
  content?: string;
}
interface SlidesApiTextElement {
  textRun?: SlidesApiTextRun;
}
interface SlidesApiShapeText {
  textElements?: SlidesApiTextElement[];
}
interface SlidesApiShape {
  text?: SlidesApiShapeText;
}
interface SlidesApiMagnitude {
  magnitude?: number;
}
interface SlidesApiSize {
  width?: SlidesApiMagnitude;
  height?: SlidesApiMagnitude;
}
interface SlidesApiTransform {
  scaleX?: number;
  scaleY?: number;
  translateX?: number;
  translateY?: number;
}
interface SlidesApiPageElement {
  objectId: string;
  description?: string;
  size?: SlidesApiSize;
  transform?: SlidesApiTransform;
  shape?: SlidesApiShape;
}
interface SlidesApiPage {
  objectId: string;
  pageElements?: SlidesApiPageElement[];
}
interface SlidesApiPresentation {
  pageSize?: SlidesApiSize;
  slides?: SlidesApiPage[];
}

async function authorizedFetch(url: string, init: RequestInit = {}, retryOn401 = true): Promise<Response> {
  const token = await getAuthToken(true);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && retryOn401) {
    // トークンが失効している場合、キャッシュを破棄して1回だけ再試行する
    await revokeAuthToken(token);
    return authorizedFetch(url, init, false);
  }
  return res;
}

async function getPresentationRaw(presentationId: string): Promise<SlidesApiPresentation> {
  const res = await authorizedFetch(`${API_BASE}/presentations/${presentationId}`);
  if (!res.ok) {
    throw new Error(`プレゼンテーションの取得に失敗しました (status: ${res.status})`);
  }
  return (await res.json()) as SlidesApiPresentation;
}

function extractPlainText(el: SlidesApiPageElement): string {
  const textElements = el.shape?.text?.textElements ?? [];
  return textElements
    .map((te) => te.textRun?.content ?? '')
    .join('')
    .trim();
}

/** 非回転(scaleX/scaleY=1相当)のテキストボックスのみを対象にする(PLAN.md 4節のリスク表と同じ制約)。 */
function extractBoxEmu(el: SlidesApiPageElement): { x: number; y: number; width: number; height: number } | null {
  const size = el.size;
  const transform = el.transform;
  if (!size?.width?.magnitude || !size.height?.magnitude || !transform) return null;
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  return {
    x: transform.translateX ?? 0,
    y: transform.translateY ?? 0,
    width: size.width.magnitude * scaleX,
    height: size.height.magnitude * scaleY,
  };
}

export interface RemoteShapeInfo {
  objectId: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
  description?: string;
}

export interface PageInfo {
  pageObjectId: string;
  pageSizeEmu: { width: number; height: number };
  shapes: RemoteShapeInfo[];
}

const DEFAULT_PAGE_SIZE_EMU = { width: 9144000, height: 5143500 }; // 16:9 標準サイズへのフォールバック

/** 指定したページの、位置とサイズが確定しているシェイプ一覧とページサイズを取得する。 */
export async function getPageInfo(presentationId: string, pageObjectId: string): Promise<PageInfo> {
  const presentation = await getPresentationRaw(presentationId);
  const pageSizeEmu = {
    width: presentation.pageSize?.width?.magnitude ?? DEFAULT_PAGE_SIZE_EMU.width,
    height: presentation.pageSize?.height?.magnitude ?? DEFAULT_PAGE_SIZE_EMU.height,
  };
  const page = (presentation.slides ?? []).find((s) => s.objectId === pageObjectId);
  if (!page) {
    throw new Error(`ページが見つかりません (pageObjectId: ${pageObjectId})`);
  }

  const shapes: RemoteShapeInfo[] = [];
  for (const el of page.pageElements ?? []) {
    const box = extractBoxEmu(el);
    if (!box) continue; // 回転あり・画像等はマッチ対象外(Phase 2 初期実装のスコープ外)
    shapes.push({ objectId: el.objectId, text: extractPlainText(el), box, description: el.description });
  }

  return { pageObjectId, pageSizeEmu, shapes };
}

/** プレゼンテーション内の全ページの objectId を、スライドの並び順で取得する(全スライド書き込み機能用)。 */
export async function getPresentationPages(presentationId: string): Promise<string[]> {
  const presentation = await getPresentationRaw(presentationId);
  return (presentation.slides ?? []).map((s) => s.objectId);
}

/**
 * 削除対象となるルビ用シェイプの objectId 一覧を取得する。
 * @param pageObjectId 省略時はプレゼンテーション全体(全スライド)を対象にする。
 */
export async function getRubyObjectIds(presentationId: string, pageObjectId?: string): Promise<string[]> {
  const presentation = await getPresentationRaw(presentationId);
  const pages = pageObjectId
    ? (presentation.slides ?? []).filter((s) => s.objectId === pageObjectId)
    : (presentation.slides ?? []);

  const ids: string[] = [];
  for (const page of pages) {
    for (const el of page.pageElements ?? []) {
      if (isRubyDescription(el.description)) ids.push(el.objectId);
    }
  }
  return ids;
}

export interface BatchUpdateResult {
  appliedRequestCount: number;
}

/** batchUpdate を実行する。requests が空配列なら何もせず成功を返す。 */
export async function batchUpdate(presentationId: string, requests: unknown[]): Promise<BatchUpdateResult> {
  if (requests.length === 0) return { appliedRequestCount: 0 };

  const res = await authorizedFetch(`${API_BASE}/presentations/${presentationId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`スライドの更新に失敗しました (status: ${res.status}) ${bodyText}`.trim());
  }
  return { appliedRequestCount: requests.length };
}
