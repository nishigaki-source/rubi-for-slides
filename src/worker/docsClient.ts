/**
 * Google Docs API(v1)への実際のネットワーク呼び出し。
 * 認証は auth.ts、リクエストの中身は core/docs/*.ts が作り、このファイルは「HTTP でどう送るか」だけを担当する
 * (スライド版の slidesClient.ts と同じ分け方)。
 */
import { FileAccessRequiredError, isFileAccessStatus } from '../core/fileAccess';
import type { DocsDocument, DocsRequest } from '../core/docs/types';
import { t } from '../shared/i18n';
import { getAuthToken, revokeAuthToken } from './auth';

const API_BASE = 'https://docs.googleapis.com/v1/documents';

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

/**
 * Word 形式(.docx など)のファイルを変換せずに開いているときの案内(errorDocsOfficeFile)。
 * このとき Docs API は読み書きとも 400「The document must not be an Office file.」を返す(2026-09-29 に実物で確認)。
 * メニューの名前は Googleドキュメントの画面のとおり(スライドの errorOfficeFile と同じ考え方)。
 */

/** Docs API のエラーの本文の message(JSON でなければ undefined)。 */
async function apiErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message;
  } catch {
    return undefined; // 本文が JSON でない
  }
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  // drive.file で許可していない文書は 404 になる(PHASE0_FINDINGS.md 2節)
  if (isFileAccessStatus(res.status)) throw new FileAccessRequiredError(res.status);
  const message = await apiErrorMessage(res);
  if (res.status === 400 && message && /office file/i.test(message)) throw new Error(t('errorDocsOfficeFile'));
  throw new Error(t('errorDocsApiFailed', [String(res.status), message ?? '']));
}

/** 文書を読む。複数タブの文書でもすべてのタブの中身が返るよう includeTabsContent=true で取る。 */
export async function getDocument(documentId: string): Promise<DocsDocument> {
  const url = `${API_BASE}/${encodeURIComponent(documentId)}?includeTabsContent=true`;
  const res = await check(await authorizedFetch(url));
  return (await res.json()) as DocsDocument;
}

/**
 * まとめて書き換える。requiredRevisionId を渡すと、読んだ後に文書が変わっていたら Docs 側で拒否される
 * (利用者が同時に編集していても、ずれた位置に書き込まない)。
 */
export async function batchUpdate(
  documentId: string,
  requests: readonly DocsRequest[],
  requiredRevisionId?: string
): Promise<void> {
  if (requests.length === 0) return;
  const url = `${API_BASE}/${encodeURIComponent(documentId)}:batchUpdate`;
  const body = {
    requests,
    ...(requiredRevisionId ? { writeControl: { requiredRevisionId } } : {}),
  };
  await check(await authorizedFetch(url, { method: 'POST', body: JSON.stringify(body) }));
}

/** 新しい文書を作る(drive.file では、拡張機能が作った文書には Picker なしで読み書きできる)。 */
export async function createDocument(title: string): Promise<string> {
  const res = await check(await authorizedFetch(API_BASE, { method: 'POST', body: JSON.stringify({ title }) }));
  const doc = (await res.json()) as DocsDocument;
  if (!doc.documentId) throw new Error('文書を作れませんでした');
  return doc.documentId;
}
