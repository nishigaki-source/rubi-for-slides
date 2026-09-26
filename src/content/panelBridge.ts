/**
 * サイドパネル(src/sidepanel)からの依頼を受けて、開いているスライドへの書き込み・削除を実行する。
 *
 * 設定パネルは Chrome のサイドパネルに表示する(以前はスライドの上に浮かべていたが、スライドの
 * 一部が隠れてしまうため、スライドの横に固定されるサイドパネルに移した)。書き込み・削除は
 * スライドの DOM を測る必要があるので、この content script で実行し、結果だけを返す。
 */
import {
  isMeasureRubyRequest,
  isPanelCommandRequest,
  type MeasureRubyResponse,
  type PanelCommandRequest,
  type PanelCommandResponse,
} from '../core/messages';
import type { ReadingServiceOptions } from '../core/types';
import type { RubiSettings } from '../shared/settings';
import { deleteRuby, writeRubyToAllSlides, writeRubyToCurrentSlide } from './writeController';

export interface PanelBridgeDeps {
  getSettings: () => RubiSettings;
  buildReadingOptions: () => Promise<ReadingServiceOptions>;
  onWriteSuccess: (writtenCount: number) => Promise<void>;
}

async function runCommand(req: PanelCommandRequest, deps: PanelBridgeDeps): Promise<PanelCommandResponse> {
  if (req.command === 'delete-current' || req.command === 'delete-all') {
    const result = await deleteRuby(req.command === 'delete-current' ? 'current' : 'all');
    return result.ok ? { ok: true, command: req.command, deletedCount: result.deletedCount } : result;
  }

  const settings = deps.getSettings();
  const options = {
    sizeRatio: settings.sizeRatio,
    readingOptions: await deps.buildReadingOptions(),
    groupWithOriginal: req.groupWithOriginal,
    fontFamily: settings.fontFamily,
    color: settings.color,
  };
  if (req.command === 'write-current') {
    const result = await writeRubyToCurrentSlide(options);
    if (!result.ok) return result;
    await deps.onWriteSuccess(result.writtenCount);
    return { ok: true, command: 'write-current', writtenCount: result.writtenCount };
  }
  const result = await writeRubyToAllSlides(options);
  if (!result.ok) return result;
  await deps.onWriteSuccess(result.writtenCount);
  return { ok: true, command: 'write-all', writtenCount: result.writtenCount, slideCount: result.slideCount };
}

/** 画面に表示中のルビのフォントサイズ(表示が OFF・ルビが無いときは null)。 */
function measureRubyFontSizes(settings: RubiSettings): string[] | null {
  if (!settings.enabled) return null;
  const spans = Array.from(document.querySelectorAll<HTMLElement>('[data-rubi-for-slides="true"]'));
  if (spans.length === 0) return null;
  return spans.map((el) => getComputedStyle(el).fontSize);
}

export function initPanelBridge(deps: PanelBridgeDeps): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isMeasureRubyRequest(message)) {
      const response: MeasureRubyResponse = { fontSizes: measureRubyFontSizes(deps.getSettings()) };
      sendResponse(response);
      return false;
    }
    if (isPanelCommandRequest(message)) {
      runCommand(message, deps)
        .then(sendResponse)
        .catch((err: unknown) => {
          const response: PanelCommandResponse = {
            ok: false,
            message: err instanceof Error ? err.message : String(err),
          };
          sendResponse(response);
        });
      return true; // 非同期で sendResponse を呼ぶ
    }
    return undefined;
  });
}
