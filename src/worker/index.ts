/**
 * service worker エントリポイント。
 * content script からのトークン化・学年別漢字配当表リクエスト(モード A)、
 * および Slides API 経由でのページ情報取得・書き込み・削除リクエスト
 * (モード B)を受け付ける。
 * Googleドキュメント用の指示(`rubi-docs/command`)は docsHandler.ts で受ける(v1.0.0 で統合)。
 */
import {
  isDeleteRubyRequest,
  isKanjiLevelsRequest,
  isKanjiReadingsRequest,
  isPageInfoRequest,
  isPresentationPagesRequest,
  isRecenterRubyRequest,
  isTokenizeRequest,
  isWriteRubyRequest,
  type DeleteRubyResponse,
  type KanjiLevelsResponse,
  type KanjiReadingsResponse,
  type PageInfoResponse,
  type PresentationPagesResponse,
  type RecenterRubyResponse,
  type TokenizeResponse,
  type WriteRubyResponse,
} from '../core/messages';
import { FileAccessDeniedError, FileAccessRequiredError, withFileAccess } from '../core/fileAccess';
import { buildCreateRubyRequests, buildDeleteRequests, buildGroupRequests, buildRecenterRequests, planGroups } from '../core/slidesRequests';
import { t } from '../shared/i18n';
import { handleDocsMessage } from './docsHandler';
import { requestFileAccess, handlePickerExternalMessage } from './filePicker';
import { getKanjiLevels } from './kanjiLevels';
import { getKanjiReadings } from './kanjiReadings';
import { batchUpdate, getPageInfo, getPresentationPages, getRubyGroupObjectIds, getRubyObjectIds } from './slidesClient';
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

// 拡張機能アイコンのクリックで設定パネル(Chrome のサイドパネル、src/sidepanel)を開く。
// サイドパネルはスライドの横に固定されるので、スライド全体が隠れない。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: unknown) => {
  console.error('[ルビふり for Googleスライド] サイドパネルの設定に失敗しました', err);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // 動作確認用ビルド(npm run build:qa)だけ: dist を作り直したあと、ページから拡張機能を読み込み直せるようにする
  if (typeof __RUBI_QA__ !== 'undefined' && __RUBI_QA__ && (message as { type?: unknown })?.type === 'rubi-qa/reload-extension') {
    chrome.runtime.reload();
    return false;
  }

  // Googleドキュメント(サイドパネル・動作確認用の受け口から)
  if (handleDocsMessage(message, sender, sendResponse)) return true;

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

  if (isKanjiLevelsRequest(message)) {
    const { requestId } = message;
    getKanjiLevels()
      .then((kanjiLevels) => {
        const response: KanjiLevelsResponse = { type: 'rubi/get-kanji-levels-result', requestId, kanjiLevels };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: KanjiLevelsResponse = {
          type: 'rubi/get-kanji-levels-error',
          requestId,
          message: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isKanjiReadingsRequest(message)) {
    const { requestId } = message;
    getKanjiReadings()
      .then((kanjiReadings) => {
        const response: KanjiReadingsResponse = { type: 'rubi/get-kanji-readings-result', requestId, kanjiReadings };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: KanjiReadingsResponse = {
          type: 'rubi/get-kanji-readings-error',
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
      .then(({ pageSizeEmu, shapes, pageText }) => {
        const response: PageInfoResponse = {
          type: 'rubi/get-page-info-result',
          requestId,
          pageSizeEmu,
          shapes: shapes.map((s) => ({ objectId: s.objectId, text: s.text, box: s.box })),
          emptyPlaceholderBoxes: shapes.filter((s) => s.isEmptyPlaceholder).map((s) => s.box),
          pageText,
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
      // 書き込みは、そのスライドにある前回のルビとの置き換えにする(実機で発見: 2回押すとルビが二重になり、
      // サイズを変えて書き直すと大きさの違うルビが重なった)。削除と作成を1回の batchUpdate にまとめるので、
      // 途中で失敗しても前回のルビだけが消えることはない。
      const existing = await getRubyObjectIds(presentationId, pageObjectId);
      const existingGroups = await getRubyGroupObjectIds(presentationId, pageObjectId);
      const ungroupRequests = existingGroups.length > 0 ? [{ ungroupObjects: { objectIds: existingGroups } }] : [];
      const createRequests = buildCreateRubyRequests(pageObjectId, items);
      const groupRequests = groupWithOriginal
        ? buildGroupRequests(planGroups(items, () => generateObjectId('rubi-group')))
        : [];
      await batchUpdate(presentationId, [
        ...ungroupRequests,
        ...buildDeleteRequests(existing),
        ...createRequests,
        ...groupRequests,
      ]);
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
