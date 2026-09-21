/**
 * drive.file でスライドへのアクセス許可を得るための Google Picker フロー(service worker 側)。
 *
 * 1. requestFileAccess() が自ドメインの Picker ページをポップアップで開く。
 * 2. ページが externally_connectable 経由でアクセストークンを要求 → getAuthToken で返す。
 * 3. ユーザーが Picker で対象のスライドを選ぶと、ページが結果(granted)を通知する。
 *
 * ページからのメッセージは PICKER_ORIGIN 以外を一切受け付けない。
 */
import {
  PICKER_ORIGIN,
  PICKER_PAGE_URL,
  isPickerGetTokenRequest,
  isPickerResultMessage,
} from '../core/messages';
import { getAuthToken } from './auth';

interface PendingPicker {
  windowId: number | undefined;
  resolve: (granted: boolean) => void;
}

/** 同じスライドに対する Picker を二重に開かないよう、進行中のものを共有する。 */
const inflight = new Map<string, Promise<boolean>>();
const pending = new Map<string, PendingPicker>();

const POPUP_WIDTH = 760;
const POPUP_HEIGHT = 640;

/** 対象スライドへのアクセスを、Picker でユーザーに許可してもらう。許可されたら true。 */
export function requestFileAccess(presentationId: string): Promise<boolean> {
  const existing = inflight.get(presentationId);
  if (existing) return existing;

  const promise = new Promise<boolean>((resolve) => {
    const entry: PendingPicker = { windowId: undefined, resolve };
    pending.set(presentationId, entry);

    const onRemoved = (windowId: number): void => {
      if (windowId === entry.windowId) finish(presentationId, false);
    };
    chrome.windows.onRemoved.addListener(onRemoved);
    entry.resolve = (granted: boolean) => {
      chrome.windows.onRemoved.removeListener(onRemoved);
      resolve(granted);
    };

    const url = `${PICKER_PAGE_URL}?ext=${encodeURIComponent(chrome.runtime.id)}&fileId=${encodeURIComponent(presentationId)}`;
    chrome.windows
      .create({ url, type: 'popup', width: POPUP_WIDTH, height: POPUP_HEIGHT, focused: true })
      .then((win) => {
        entry.windowId = win?.id;
      })
      .catch(() => finish(presentationId, false));
  }).finally(() => {
    inflight.delete(presentationId);
    pending.delete(presentationId);
  });

  inflight.set(presentationId, promise);
  return promise;
}

function finish(presentationId: string, granted: boolean): void {
  const entry = pending.get(presentationId);
  if (!entry) return;
  pending.delete(presentationId);
  entry.resolve(granted);
  if (entry.windowId !== undefined) {
    chrome.windows.remove(entry.windowId).catch(() => {
      // すでに閉じられている場合は無視してよい。
    });
  }
}

/** Picker ページ(PICKER_ORIGIN)からの外部メッセージを処理する。 */
export function handlePickerExternalMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): boolean {
  if (sender.origin !== PICKER_ORIGIN) return false;

  if (isPickerGetTokenRequest(message)) {
    getAuthToken(true)
      .then((token) => sendResponse({ ok: true, token }))
      .catch((err: unknown) =>
        sendResponse({ ok: false, message: err instanceof Error ? err.message : String(err) })
      );
    return true; // 非同期で sendResponse を呼ぶ
  }

  if (isPickerResultMessage(message)) {
    finish(message.presentationId, message.granted);
    sendResponse({ ok: true });
    return false;
  }

  return false;
}
