/**
 * service worker エントリポイント。
 * content script からのトークン化・学年別漢字配当表リクエスト(モード A)、
 * および Slides API 経由でのページ情報取得・書き込み・削除リクエスト
 * (モード B)を受け付ける。
 */
import {
  isDeleteRubyRequest,
  isGradeTableRequest,
  isOpenOptionsPageRequest,
  isPageInfoRequest,
  isPresentationPagesRequest,
  isRecenterRubyRequest,
  isTokenizeRequest,
  isWriteRubyRequest,
  type DeleteRubyResponse,
  type GradeTableResponse,
  type PageInfoResponse,
  type PresentationPagesResponse,
  type RecenterRubyResponse,
  type TogglePanelRequest,
  type TokenizeResponse,
  type WriteRubyResponse,
} from '../core/messages';
import { FileAccessDeniedError, FileAccessRequiredError, withFileAccess } from '../core/fileAccess';
import { buildCreateRubyRequests, buildDeleteRequests, buildGroupRequests, buildRecenterRequests, planGroups } from '../core/slidesRequests';
import { t } from '../shared/i18n';
import { requestFileAccess, handlePickerExternalMessage } from './filePicker';
import { getGradeTable } from './gradeTable';
import { batchUpdate, getPageInfo, getPresentationPages, getRubyObjectIds } from './slidesClient';
import { tokenize, warmUpTokenizer } from './tokenizer';

chrome.runtime.onInstalled.addListener(() => {
  console.log(
    `[ルビふり for Googleスライド] service worker installed (v${chrome.runtime.getManifest().version}, build ${__BUILD_TIME__})`
  );
  // インストール直後に辞書ロードを開始しておき、初回のルビ表示を速くする。
  warmUpTokenizer();
});

/**
 * Slides API の呼び出しを、drive.file のアクセス許可付きで実行する。
 * 未許可のスライドなら Picker で許可を求め、許可されたら 1 回だけ再試行する。
 */
function withAccess<T>(presentationId: string, run: () => Promise<T>): Promise<T> {
  return withFileAccess(run, () => requestFileAccess(presentationId));
}

/** エラーを利用者向けのメッセージにする(アクセス未許可は専用の文言)。 */
function describeError(err: unknown): string {
  if (err instanceof FileAccessDeniedError || err instanceof FileAccessRequiredError) {
    return t('errorFileAccessDenied');
  }
  return err instanceof Error ? err.message : String(err);
}

// Picker ページ(rubi.rocketdone.com)からのメッセージ。送信元の検証は handlePickerExternalMessage 内で行う。
chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) =>
  handlePickerExternalMessage(message, sender, sendResponse)
);

let groupIdCounter = 0;
function generateObjectId(prefix: string): string {
  groupIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${groupIdCounter}`;
}

// action.default_popup を持たないため、アイコンをクリックすると
// このイベントが発火する。対象タブの content script にパネルの開閉を
// 依頼する(実際のパネル UI は src/content/panel.ts が画面内に描画する)。
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  const req: TogglePanelRequest = { type: 'rubi/toggle-panel' };
  chrome.tabs.sendMessage(tab.id, req).catch(() => {
    // Google スライドの編集画面以外のタブでは content script が存在せず失敗する。無視してよい。
  });
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isOpenOptionsPageRequest(message)) {
    chrome.runtime.openOptionsPage();
    return undefined;
  }

  if (isTokenizeRequest(message)) {
    const { requestId, text } = message;
    tokenize(text)
      .then((tokens) => {
        const response: TokenizeResponse = { type: 'rubi/tokenize-result', requestId, tokens };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: TokenizeResponse = {
          type: 'rubi/tokenize-error',
          requestId,
          message: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      });
    return true; // 非同期で sendResponse を呼ぶことを Chrome に伝える
  }

  if (isGradeTableRequest(message)) {
    const { requestId } = message;
    getGradeTable()
      .then((gradeTable) => {
        const response: GradeTableResponse = {
          type: 'rubi/get-grade-table-result',
          requestId,
          gradeTable,
        };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: GradeTableResponse = {
          type: 'rubi/get-grade-table-error',
          requestId,
          message: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isPageInfoRequest(message)) {
    const { requestId, presentationId, pageObjectId } = message;
    withAccess(presentationId, () => getPageInfo(presentationId, pageObjectId))
      .then(({ pageSizeEmu, shapes }) => {
        const response: PageInfoResponse = {
          type: 'rubi/get-page-info-result',
          requestId,
          pageSizeEmu,
          shapes: shapes.map((s) => ({ objectId: s.objectId, text: s.text, box: s.box })),
        };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: PageInfoResponse = {
          type: 'rubi/get-page-info-error',
          requestId,
          message: describeError(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isPresentationPagesRequest(message)) {
    const { requestId, presentationId } = message;
    withAccess(presentationId, () => getPresentationPages(presentationId))
      .then((pageObjectIds) => {
        const response: PresentationPagesResponse = {
          type: 'rubi/get-presentation-pages-result',
          requestId,
          pageObjectIds,
        };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: PresentationPagesResponse = {
          type: 'rubi/get-presentation-pages-error',
          requestId,
          message: describeError(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isWriteRubyRequest(message)) {
    const { requestId, presentationId, pageObjectId, items, groupWithOriginal } = message;
    withAccess(presentationId, async () => {
      const createRequests = buildCreateRubyRequests(pageObjectId, items);
      const groupRequests = groupWithOriginal
        ? buildGroupRequests(planGroups(items, () => generateObjectId('rubi-group')))
        : [];
      await batchUpdate(presentationId, [...createRequests, ...groupRequests]);
      return items.length;
    })
      .then((writtenCount) => {
        const response: WriteRubyResponse = { type: 'rubi/write-ruby-result', requestId, writtenCount };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: WriteRubyResponse = {
          type: 'rubi/write-ruby-error',
          requestId,
          message: describeError(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isRecenterRubyRequest(message)) {
    const { requestId, presentationId, corrections } = message;
    withAccess(presentationId, () => batchUpdate(presentationId, buildRecenterRequests(corrections)))
      .then(() => {
        const response: RecenterRubyResponse = { type: 'rubi/recenter-ruby-result', requestId, ok: true };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: RecenterRubyResponse = {
          type: 'rubi/recenter-ruby-result',
          requestId,
          ok: false,
          message: describeError(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isDeleteRubyRequest(message)) {
    const { requestId, presentationId, pageObjectId } = message;
    withAccess(presentationId, async () => {
      const objectIds = await getRubyObjectIds(presentationId, pageObjectId);
      if (objectIds.length === 0) return 0;
      await batchUpdate(presentationId, buildDeleteRequests(objectIds));
      return objectIds.length;
    })
      .then((deletedCount) => {
        const response: DeleteRubyResponse = { type: 'rubi/delete-ruby-result', requestId, deletedCount };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: DeleteRubyResponse = {
          type: 'rubi/delete-ruby-error',
          requestId,
          message: describeError(err),
        };
        sendResponse(response);
      });
    return true;
  }

  return undefined; // このメッセージは自分の担当ではない
});
