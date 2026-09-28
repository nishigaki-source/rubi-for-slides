/**
 * Google Slides API(v1)への実際のネットワーク呼び出しを担当する。
 * 認証は auth.ts、リクエスト内容の組み立ては core/slidesRequests.ts が担当し、
 * このファイルは「HTTP でどう送るか」だけに専念する。
 */
import { FileAccessRequiredError, isFileAccessStatus } from '../core/fileAccess';
import { isRubyDescription } from '../core/slidesRequests';
import { t } from '../shared/i18n';
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
  /** レイアウトのプレースホルダー(タイトル・本文の枠)のとき */
  placeholder?: { type?: string };
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
  shearX?: number;
  shearY?: number;
  translateX?: number;
  translateY?: number;
}
interface SlidesApiPageElement {
  objectId: string;
  description?: string;
  size?: SlidesApiSize;
  transform?: SlidesApiTransform;
  shape?: SlidesApiShape;
  table?: { tableRows?: { tableCells?: { text?: SlidesApiShapeText }[] }[] };
  elementGroup?: { children?: SlidesApiPageElement[] };
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
    // drive.file では、未許可のスライドは 403/404 になる。呼び出し側が Picker で許可を求めて再試行する。
    if (isFileAccessStatus(res.status)) throw new FileAccessRequiredError(res.status);
    // PowerPoint 形式などのファイルを変換せずに開いていると 400 になる(画面での判定の見逃し用)
    if (res.status === 400) throw new Error(`${t('errorOfficeFile')} (status: 400)`);
    throw new Error(t('errorFetchPresentationFailed', String(res.status)));
  }
  return (await res.json()) as SlidesApiPresentation;
}

function textOf(text: SlidesApiShapeText | undefined): string {
  return (text?.textElements ?? []).map((te) => te.textRun?.content ?? '').join('');
}

/** ページ上のすべての文字(図形・表のセル・グループの中)。空白は除く。 */
function collectPageText(elements: SlidesApiPageElement[]): string {
  let out = '';
  for (const el of elements) {
    out += textOf(el.shape?.text);
    for (const row of el.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) out += textOf(cell.text);
    }
    out += collectPageText(el.elementGroup?.children ?? []);
  }
  return out.replace(/\s/g, '');
}

function extractPlainText(el: SlidesApiPageElement): string {
  const textElements = el.shape?.text?.textElements ?? [];
  return textElements
    .map((te) => te.textRun?.content ?? '')
    .join('')
    .trim();
}

/** 非回転(scaleX/scaleY=1相当)のテキストボックスのみを対象にする(PLAN.md 4節のリスク表と同じ制約)。 */
/**
 * グループの中の要素の変換は、グループの変換からの相対値になっている。親の変換を前から掛けて、
 * ページ上の絶対的な変換にする(Slides API の PageElement.transform の説明どおり)。
 */
function composeTransform(parent: SlidesApiTransform | undefined, child: SlidesApiTransform): SlidesApiTransform {
  if (!parent) return child;
  const pa = parent.scaleX ?? 1, pb = parent.shearY ?? 0, pc = parent.shearX ?? 0, pd = parent.scaleY ?? 1;
  const ca = child.scaleX ?? 1, cb = child.shearY ?? 0, cc = child.shearX ?? 0, cd = child.scaleY ?? 1;
  const ce = child.translateX ?? 0, cf = child.translateY ?? 0;
  return {
    scaleX: pa * ca + pc * cb,
    shearY: pb * ca + pd * cb,
    shearX: pa * cc + pc * cd,
    scaleY: pb * cc + pd * cd,
    translateX: pa * ce + pc * cf + (parent.translateX ?? 0),
    translateY: pb * ce + pd * cf + (parent.translateY ?? 0),
  };
}

function extractBoxEmu(
  el: SlidesApiPageElement,
  transform: SlidesApiTransform | undefined = el.transform
): { x: number; y: number; width: number; height: number } | null {
  const size = el.size;
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
  /** 本文が空のプレースホルダー(編集画面にだけ「クリックしてテキストを追加」と出る枠) */
  isEmptyPlaceholder: boolean;
}

export interface PageInfo {
  pageObjectId: string;
  pageSizeEmu: { width: number; height: number };
  shapes: RemoteShapeInfo[];
  /** ページ上のすべての文字(空白を除いて連結したもの) */
  pageText: string;
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
    throw new Error(t('errorPageNotFound', pageObjectId));
  }

  // グループの中の図形も含める(「元のテキストとグループ化」で書き込んだあと、元の図形はグループの中にある。
  // 含めないと、書き直しのとき別の図形(空のプレースホルダーなど)に対応付けてしまい、グループ化に失敗した)
  const shapes: RemoteShapeInfo[] = [];
  const visit = (elements: SlidesApiPageElement[], parent: SlidesApiTransform | undefined): void => {
    for (const el of elements) {
      if (isRubyDescription(el.description)) continue; // 書き込んだルビ自身は対応付けの候補にしない
      const transform = el.transform ? composeTransform(parent, el.transform) : undefined;
      if (el.elementGroup) {
        visit(el.elementGroup.children ?? [], transform);
        continue;
      }
      const box = extractBoxEmu(el, transform);
      if (!box) continue; // 位置の分からない要素は対応付けの対象外
      const text = extractPlainText(el);
      shapes.push({
        objectId: el.objectId,
        text,
        box,
        description: el.description,
        isEmptyPlaceholder: el.shape?.placeholder !== undefined && text.length === 0,
      });
    }
  };
  visit(page.pageElements ?? [], undefined);

  return { pageObjectId, pageSizeEmu, shapes, pageText: collectPageText(page.pageElements ?? []) };
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

  // 「元のテキストとグループ化」で書き込んだルビはグループの中にあるので、グループの中も探す
  const ids: string[] = [];
  const visit = (elements: SlidesApiPageElement[]): void => {
    for (const el of elements) {
      if (isRubyDescription(el.description)) ids.push(el.objectId);
      else visit(el.elementGroup?.children ?? []);
    }
  };
  for (const page of pages) visit(page.pageElements ?? []);
  return ids;
}

/**
 * 書き込んだルビを含むグループ(「元のテキストとグループ化」で作ったもの)の objectId 一覧。
 * 書き直す前にグループを解除しないと、元の図形をもう一度グループ化できない。
 */
export async function getRubyGroupObjectIds(presentationId: string, pageObjectId: string): Promise<string[]> {
  const presentation = await getPresentationRaw(presentationId);
  const page = (presentation.slides ?? []).find((s) => s.objectId === pageObjectId);
  return (page?.pageElements ?? [])
    .filter((el) => (el.elementGroup?.children ?? []).some((c) => isRubyDescription(c.description)))
    .map((el) => el.objectId);
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
    if (isFileAccessStatus(res.status)) throw new FileAccessRequiredError(res.status);
    const bodyText = await res.text().catch(() => '');
    throw new Error(t('errorSlideUpdateFailed', [String(res.status), bodyText]).trim());
  }
  return { appliedRequestCount: requests.length };
}
