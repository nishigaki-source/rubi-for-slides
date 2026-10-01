/**
 * アンインストール時の案内ページを登録する(src/core/uninstallUrl.ts)。service worker が起動するたびに呼ぶ
 * (登録は、拡張機能が更新されても残るが、同じ内容で上書きしても害はない)。
 */
import { buildUninstallUrl, shouldSetUninstallUrl } from '../core/uninstallUrl';

export async function setUninstallSurveyUrl(): Promise<void> {
  try {
    const manifest = chrome.runtime.getManifest();
    let installType: string | undefined;
    try {
      // management の権限なしで、自分自身の情報は取れる
      installType = (await chrome.management.getSelf()).installType;
    } catch {
      installType = undefined;
    }
    if (!shouldSetUninstallUrl(installType, Boolean(manifest.update_url))) return;
    await chrome.runtime.setUninstallURL(buildUninstallUrl(manifest.version));
  } catch (err) {
    // 案内ページは、なくても拡張機能の動作には関係しない
    console.warn('[ルビふり] アンインストール時の案内ページを登録できませんでした', err);
  }
}
