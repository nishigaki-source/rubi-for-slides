/**
 * Googleドキュメント用の指示(サイドパネル・動作確認用の受け口から)を受けて、Docs API でルビを書き込む・消す
 * (処理は src/worker/docsRuby.ts)。スライド用の処理とは別のメッセージの型(`rubi-docs/command`)で受ける。
 *
 * drive.file のため、まだ許可されていない文書では、スライドと同じ Picker で許可を求めてから 1 回だけやり直す。
 * ただし、設定を変えたときの自動の付け直し('refresh')では Picker を開かない(ルビを付けていない文書で
 * 設定を変えただけで許可の画面が出ないように)。
 */
import { FileAccessDeniedError, FileAccessRequiredError, withFileAccess } from '../core/fileAccess';
import { isDocsCommandRequest, type DocsCommandRequest, type DocsCommandResponse } from '../core/docs/messages';
import type { DocsRequest } from '../core/docs/types';
import { t } from '../shared/i18n';
import { getAuthToken } from './auth';
import { batchUpdate, getDocument } from './docsClient';
import { createTestDocument, deleteRuby, deleteRubyInSelection, writeRuby } from './docsRuby';
import { requestFileAccess } from './filePicker';
import { readSelectedText } from './selection';

const LOG_PREFIX = '[ルビふり] ドキュメント:';

function describeError(err: unknown): string {
  if (err instanceof FileAccessRequiredError || err instanceof FileAccessDeniedError) return t('errorDocsFileAccessDenied');
  return err instanceof Error ? err.message : String(err);
}

async function runCommand(req: DocsCommandRequest, senderTabId: number | undefined): Promise<DocsCommandResponse> {
  if (req.command === 'create-test-doc') {
    // 動作確認用ビルドだけ(拡張機能が作った文書は Picker なしで読み書きできる)
    if (!__RUBI_QA__) return { ok: false, message: 'not available' };
    return { ok: true, documentId: await createTestDocument() };
  }
  const documentId = req.documentId;
  if (!documentId) return { ok: false, message: t('sidePanelNotDocs') };
  const withAccess = <T>(run: () => Promise<T>): Promise<T> =>
    withFileAccess(run, () => requestFileAccess(documentId, 'document'));

  if (req.command === 'refresh') {
    try {
      const { count, skipped, written } = await writeRuby(documentId, req.tabId, req.browserTabId ?? senderTabId, true);
      return { ok: true, count, skipped, refreshed: written };
    } catch (err) {
      // まだ許可していない文書にはルビを付けていないので、付け直すものも無い
      if (err instanceof FileAccessRequiredError) return { ok: true, count: 0, refreshed: false };
      throw err;
    }
  }
  if (req.command === 'write') {
    const { count, measuredChars, skipped, timing } = await withAccess(() =>
      writeRuby(documentId, req.tabId, req.browserTabId ?? senderTabId)
    );
    return { ok: true, count, measuredChars, skipped, ...(__RUBI_QA__ ? { timing } : {}) };
  }
  if (req.command === 'delete-selection') {
    // 動作確認用の受け口からは、選択した文字を直接渡せる(selectedText)
    const selected = req.selectedText ?? (await readSelectedText(req.browserTabId ?? senderTabId));
    if (selected === null) return { ok: false, message: t('errorDocsSelectionUnreadable') };
    if (selected.trim() === '') return { ok: false, message: t('errorDocsNoSelection') };
    const result = await withAccess(() => deleteRubyInSelection(documentId, selected, req.tabId));
    if (result.status === 'empty') return { ok: false, message: t('errorDocsNoSelection') };
    if (result.status === 'not-found') return { ok: false, message: t('errorDocsSelectionNotFound') };
    if (result.status === 'ambiguous') return { ok: false, message: t('errorDocsSelectionAmbiguous', String(result.places)) };
    return { ok: true, count: result.count, skipped: result.skipped };
  }
  const { count, skipped } = await withAccess(() => deleteRuby(documentId, req.tabId));
  return { ok: true, count, skipped };
}

/** 動作確認用: 文書を .docx に書き出して、変換せずにドライブへ置く。置いたファイルの ID を返す。 */
async function makeDocxCopy(documentId: string): Promise<string> {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const token = await getAuthToken(true);
  const auth = { Authorization: `Bearer ${token}` };
  const exported = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}/export?mimeType=${encodeURIComponent(DOCX)}`,
    { headers: auth }
  );
  if (!exported.ok) throw new Error(`export failed (${exported.status})`);
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify({ name: 'ルビふり テスト(Word形式・削除可).docx', mimeType: DOCX })], { type: 'application/json' }));
  body.append('file', new Blob([await exported.arrayBuffer()], { type: DOCX }));
  const uploaded = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: auth, body });
  if (!uploaded.ok) throw new Error(`upload failed (${uploaded.status})`);
  return ((await uploaded.json()) as { id: string }).id;
}

/**
 * ドキュメント用のメッセージなら処理して true(非同期で sendResponse を呼ぶ)を返す。担当でなければ undefined。
 */
export function handleDocsMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): true | undefined {
  const type = (message as { type?: unknown })?.type;
  // 動作確認用ビルドだけ: 文書を Word 形式(.docx)に書き出し、変換せずにドライブへ置く(.docx のまま開いた文書の確認用)
  if (__RUBI_QA__ && type === 'rubi-qa/make-docx') {
    const { documentId } = message as { documentId: string };
    makeDocxCopy(documentId)
      .then((fileId) => sendResponse({ ok: true, fileId }))
      .catch((err: unknown) => sendResponse({ ok: false, message: describeError(err) }));
    return true;
  }
  // 動作確認用ビルドだけ: 文書をそのまま読む・リクエストをそのまま送る(表の index の調査用)
  if (__RUBI_QA__ && type === 'rubi-qa/debug') {
    const { documentId, requests } = message as { documentId: string; requests?: DocsRequest[] };
    (requests ? batchUpdate(documentId, requests).then(() => ({ ok: true })) : getDocument(documentId))
      .then(sendResponse)
      .catch((err: unknown) => sendResponse({ ok: false, message: describeError(err) }));
    return true;
  }
  // 動作確認用ビルドだけ: manifest(JSON の文字列)ごとの、インストール・更新時の権限の警告の文言を返す
  // (更新で警告が増えると、既存の利用者の拡張機能が止まるため。chrome.management の権限は要らない)
  if (__RUBI_QA__ && type === 'rubi-qa/permission-warnings') {
    const { manifests } = message as { manifests: string[] };
    Promise.all(manifests.map((m) => chrome.management.getPermissionWarningsByManifest(m)))
      .then((warnings) => sendResponse({ ok: true, warnings }))
      .catch((err: unknown) => sendResponse({ ok: false, message: describeError(err) }));
    return true;
  }
  if (!isDocsCommandRequest(message)) return undefined;

  // 動作確認用の受け口(content script)から来たときは、そのページのタブで文字の幅を測る
  runCommand(message, sender.tab?.id)
    .then(sendResponse)
    .catch((err: unknown) => {
      console.error(`${LOG_PREFIX} ${message.command} に失敗しました`, err);
      const response: DocsCommandResponse = { ok: false, message: describeError(err) };
      sendResponse(response);
    });
  return true;
}
