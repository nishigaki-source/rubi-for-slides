/**
 * 動作確認用ビルド(`npm run build:qa`)専用の受け口。通常のビルドには含まれない(manifest に content script が入らない)。
 *
 * サイドパネルは Chrome の外枠にあり自動操作ではクリックできないため、実際の Googleドキュメントのページから
 * window.postMessage で同じ処理を呼べるようにする(スライド版の src/content/qaBridge.ts と同じ考え方)。
 *
 *   window.postMessage({ type: 'rubi-qa/request', id: 1, command: 'write' }, '*')
 *   window.postMessage({ type: 'rubi-qa/request', id: 2, settings: { docsStyle: 'paren-small' } }, '*')
 *   window.postMessage({ type: 'rubi-qa/request', id: 3, reloadExtension: true }, '*')
 *   window.postMessage({ type: 'rubi-qa/request', id: 4, debug: true }, '*')          // documents.get の結果
 *   window.postMessage({ type: 'rubi-qa/request', id: 5, debug: [ ...requests ] }, '*') // batchUpdate をそのまま送る
 *   → window に { type: 'rubi-qa/response', id, result } が返る
 */
import { parseDocsUrl } from '../../core/docs/docsUrl';
import type { DocsCommand, DocsCommandRequest } from '../../core/docs/messages';
import type { UserDictionary } from '../../core/types';
import { loadSettings, saveSettings, type RubiSettings } from '../../shared/settings';
import { loadUserDict, saveUserDict } from '../../shared/userDictStorage';

interface QaRequest {
  type: 'rubi-qa/request';
  id: number;
  command?: DocsCommand;
  /** 設定の一部を書き換える(省略時は今の設定を返すだけ) */
  settings?: Partial<RubiSettings>;
  /** 拡張機能を読み込み直す(dist を作り直したあと。タブの再読み込みは呼び出し側で行う) */
  reloadExtension?: boolean;
  /** 開いている文書をそのまま読む(true)・リクエストをそのまま送る(配列) */
  debug?: true | unknown[];
  /** ユーザー辞書を丸ごと置き換える(null なら今の辞書を返すだけ) */
  userDict?: UserDictionary | null;
  /** 開いている文書を .docx に書き出して、変換せずにドライブへ置く */
  makeDocx?: true;
  /** manifest(JSON の文字列)ごとの権限の警告の文言を返す */
  permissionWarnings?: string[];
}

async function handle(req: QaRequest): Promise<unknown> {
  if (req.reloadExtension) {
    await chrome.runtime.sendMessage({ type: 'rubi-qa/reload-extension' }).catch(() => undefined);
    return { ok: true };
  }
  if (req.permissionWarnings) {
    return chrome.runtime.sendMessage({ type: 'rubi-qa/permission-warnings', manifests: req.permissionWarnings });
  }
  if (req.makeDocx) {
    const target = parseDocsUrl(location.href);
    if (!target) return { ok: false, message: 'ドキュメントの URL ではありません' };
    return chrome.runtime.sendMessage({ type: 'rubi-qa/make-docx', documentId: target.documentId });
  }
  if (req.userDict !== undefined) {
    const before = await loadUserDict();
    if (req.userDict) await saveUserDict(req.userDict);
    return { ok: true, before };
  }
  if (req.debug) {
    const target = parseDocsUrl(location.href);
    if (!target) return { ok: false, message: 'ドキュメントの URL ではありません' };
    return chrome.runtime.sendMessage({
      type: 'rubi-qa/debug',
      documentId: target.documentId,
      ...(Array.isArray(req.debug) ? { requests: req.debug } : {}),
    });
  }
  if (req.command) {
    const target = parseDocsUrl(location.href);
    const message: DocsCommandRequest = {
      type: 'rubi-docs/command',
      command: req.command,
      ...(target ? { documentId: target.documentId, ...(target.tabId ? { tabId: target.tabId } : {}) } : {}),
    };
    return chrome.runtime.sendMessage(message);
  }
  const current = await loadSettings();
  if (!req.settings) return current;
  const next = { ...current, ...req.settings };
  await saveSettings(next);
  return next;
}

document.documentElement.dataset.rubiQa = chrome.runtime.getManifest().version;
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const req = event.data as QaRequest;
  if (req?.type !== 'rubi-qa/request') return;
  const respond = (result: unknown): void => window.postMessage({ type: 'rubi-qa/response', id: req.id, result }, '*');
  handle(req)
    .then(respond)
    .catch((err: unknown) => respond({ ok: false, message: err instanceof Error ? err.message : String(err) }));
});
