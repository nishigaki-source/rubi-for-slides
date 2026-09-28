/**
 * 動作確認用ビルド(`npm run build:qa`)専用の受け口。ストア用のビルドには含まれない。
 *
 * サイドパネルは Chrome の外枠にあり自動操作ではクリックできないため、実際の Googleスライドで
 * 書き込み・削除・設定変更を自動で試せるよう、ページからの window.postMessage で同じ処理を呼べるようにする。
 *
 *   window.postMessage({ type: 'rubi-qa/request', id: 1, command: 'write-current' }, '*')
 *   window.postMessage({ type: 'rubi-qa/request', id: 2, settings: { sizeRatio: 0.35 } }, '*')
 *   window.postMessage({ type: 'rubi-qa/request', id: 3, reloadExtension: true }, '*')
 *   → window に { type: 'rubi-qa/response', id, result } が返る
 */
import type { PanelCommand, PanelCommandResponse } from '../core/messages';
import { loadSettings, saveSettings, type RubiSettings } from '../shared/settings';

interface QaRequest {
  type: 'rubi-qa/request';
  id: number;
  command?: PanelCommand;
  groupWithOriginal?: boolean;
  /** 設定の一部を書き換える(省略時は今の設定を返すだけ) */
  settings?: Partial<RubiSettings>;
  /** 拡張機能を読み込み直す(dist を作り直したあと。タブの再読み込みは呼び出し側で行う) */
  reloadExtension?: boolean;
}

export function initQaBridge(
  runCommand: (command: PanelCommand, groupWithOriginal: boolean) => Promise<PanelCommandResponse>
): void {
  document.documentElement.dataset.rubiQa = chrome.runtime.getManifest().version;
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const req = event.data as QaRequest;
    if (req?.type !== 'rubi-qa/request') return;
    const respond = (result: unknown) => window.postMessage({ type: 'rubi-qa/response', id: req.id, result }, '*');
    (async () => {
      if (req.reloadExtension) {
        await chrome.runtime.sendMessage({ type: 'rubi-qa/reload-extension' }).catch(() => undefined);
        return { ok: true };
      }
      if (req.command) return runCommand(req.command, req.groupWithOriginal ?? false);
      const current = await loadSettings();
      if (!req.settings) return current;
      const next = { ...current, ...req.settings };
      await saveSettings(next);
      return next;
    })()
      .then(respond)
      .catch((err: unknown) => respond({ ok: false, message: err instanceof Error ? err.message : String(err) }));
  });
}
