/**
 * content script <-> service worker 間のメッセージプロトコル。
 * DOM にも kuromoji にも依存しない、純粋な型定義とヘルパーのみ。
 */

import type { ApiShapeInfo } from './shapeMatcher';
import type { RecenterCorrection, RubyWriteItem } from './slidesRequests';
import type { KanjiGradeTable, TokenizedWord } from './types';

export interface TokenizeRequest {
  type: 'rubi/tokenize';
  requestId: string;
  /** 1パラグラフ分のプレーンテキスト */
  text: string;
}

export interface TokenizeSuccessResponse {
  type: 'rubi/tokenize-result';
  requestId: string;
  tokens: TokenizedWord[];
}

export interface TokenizeErrorResponse {
  type: 'rubi/tokenize-error';
  requestId: string;
  message: string;
}

export type TokenizeResponse = TokenizeSuccessResponse | TokenizeErrorResponse;

export function isTokenizeRequest(msg: unknown): msg is TokenizeRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'rubi/tokenize'
  );
}

export interface GradeTableRequest {
  type: 'rubi/get-grade-table';
  requestId: string;
}

export interface GradeTableSuccessResponse {
  type: 'rubi/get-grade-table-result';
  requestId: string;
  gradeTable: KanjiGradeTable;
}

export interface GradeTableErrorResponse {
  type: 'rubi/get-grade-table-error';
  requestId: string;
  message: string;
}

export type GradeTableResponse = GradeTableSuccessResponse | GradeTableErrorResponse;

export function isGradeTableRequest(msg: unknown): msg is GradeTableRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'rubi/get-grade-table'
  );
}

// --- モード B(スライドへの書き込み)関連のメッセージ ---

export interface PageInfoRequest {
  type: 'rubi/get-page-info';
  requestId: string;
  presentationId: string;
  pageObjectId: string;
}

export interface PageInfoSuccessResponse {
  type: 'rubi/get-page-info-result';
  requestId: string;
  pageSizeEmu: { width: number; height: number };
  shapes: ApiShapeInfo[];
}

export interface PageInfoErrorResponse {
  type: 'rubi/get-page-info-error';
  requestId: string;
  message: string;
}

export type PageInfoResponse = PageInfoSuccessResponse | PageInfoErrorResponse;

export function isPageInfoRequest(msg: unknown): msg is PageInfoRequest {
  return (
    typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'rubi/get-page-info'
  );
}

export interface WriteRubyRequest {
  type: 'rubi/write-ruby';
  requestId: string;
  presentationId: string;
  pageObjectId: string;
  items: RubyWriteItem[];
  /** 元シェイプとルビをグループ化するか(既定 false) */
  groupWithOriginal?: boolean;
}

export interface WriteRubySuccessResponse {
  type: 'rubi/write-ruby-result';
  requestId: string;
  writtenCount: number;
}

export interface WriteRubyErrorResponse {
  type: 'rubi/write-ruby-error';
  requestId: string;
  message: string;
}

export type WriteRubyResponse = WriteRubySuccessResponse | WriteRubyErrorResponse;

// --- モード B: 実際に描画された位置を元に中心を補正する(Slides 側の
// シェイプ内部座標の非一様スケーリングにより、指定した位置に厳密には
// 描画されないことがあるため。src/content/writeController.ts 参照)---

export interface RecenterRubyRequest {
  type: 'rubi/recenter-ruby';
  requestId: string;
  presentationId: string;
  corrections: RecenterCorrection[];
}

export interface RecenterRubySuccessResponse {
  type: 'rubi/recenter-ruby-result';
  requestId: string;
  ok: true;
}

export interface RecenterRubyErrorResponse {
  type: 'rubi/recenter-ruby-result';
  requestId: string;
  ok: false;
  message: string;
}

export type RecenterRubyResponse = RecenterRubySuccessResponse | RecenterRubyErrorResponse;

export function isRecenterRubyRequest(msg: unknown): msg is RecenterRubyRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'rubi/recenter-ruby';
}

export function isWriteRubyRequest(msg: unknown): msg is WriteRubyRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'rubi/write-ruby';
}

export interface DeleteRubyRequest {
  type: 'rubi/delete-ruby';
  requestId: string;
  presentationId: string;
  /** 省略時はプレゼンテーション全体(全スライド)からルビを削除する */
  pageObjectId?: string;
}

export interface DeleteRubySuccessResponse {
  type: 'rubi/delete-ruby-result';
  requestId: string;
  deletedCount: number;
}

export interface DeleteRubyErrorResponse {
  type: 'rubi/delete-ruby-error';
  requestId: string;
  message: string;
}

export type DeleteRubyResponse = DeleteRubySuccessResponse | DeleteRubyErrorResponse;

export function isDeleteRubyRequest(msg: unknown): msg is DeleteRubyRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'rubi/delete-ruby';
}

export interface PresentationPagesRequest {
  type: 'rubi/get-presentation-pages';
  requestId: string;
  presentationId: string;
}

export interface PresentationPagesSuccessResponse {
  type: 'rubi/get-presentation-pages-result';
  requestId: string;
  pageObjectIds: string[];
}

export interface PresentationPagesErrorResponse {
  type: 'rubi/get-presentation-pages-error';
  requestId: string;
  message: string;
}

export type PresentationPagesResponse = PresentationPagesSuccessResponse | PresentationPagesErrorResponse;

export function isPresentationPagesRequest(msg: unknown): msg is PresentationPagesRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'rubi/get-presentation-pages'
  );
}

// --- service worker(拡張機能アイコンのクリックを検知) -> content script ---
// クリックされたタブの content script に送り、画面内のフローティングパネルの
// 開閉を切り替えさせる(src/content/panel.ts 参照)。

export interface TogglePanelRequest {
  type: 'rubi/toggle-panel';
}

export function isTogglePanelRequest(msg: unknown): msg is TogglePanelRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'rubi/toggle-panel';
}

// --- content script(パネルの「詳細設定」リンク) -> service worker ---
// `chrome.runtime.openOptionsPage()` は content script からは呼べないため、
// service worker に依頼する。window.open + chrome-extension:// URL は
// 一部の広告ブロッカー等に ERR_BLOCKED_BY_CLIENT としてブロックされることが
// 実機で確認できたため、正規の API 経由に統一している。

export interface OpenOptionsPageRequest {
  type: 'rubi/open-options-page';
}

export function isOpenOptionsPageRequest(msg: unknown): msg is OpenOptionsPageRequest {
  return (
    typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'rubi/open-options-page'
  );
}

let counter = 0;
/** requestId 生成。タブ内で一意であれば十分なので単純なカウンタ+乱数にする。 */
export function nextRequestId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Google Picker(drive.file でスライドへのアクセス許可を得る)関連 ---
// Picker は拡張機能の画面では読み込めない(外部スクリプトが CSP で禁止される)ため、
// 自ドメインの静的ページ(docs/picker.html)をポップアップで開き、そのページと
// externally_connectable 経由で通信する。以下は「ページ → 拡張機能」の外部メッセージ。

/** Picker ページが置かれているオリジン。外部メッセージの送信元チェックに使う。 */
export const PICKER_ORIGIN = 'https://rubi.rocketdone.com';
export const PICKER_PAGE_URL = `${PICKER_ORIGIN}/picker.html`;

/** Picker ページがアクセストークン(drive.file)を要求する。 */
export interface PickerGetTokenRequest {
  type: 'rubi/picker-get-token';
}

/** Picker ページが、ユーザーの選択結果(許可された/されなかった)を通知する。 */
export interface PickerResultMessage {
  type: 'rubi/picker-result';
  presentationId: string;
  granted: boolean;
}

export function isPickerGetTokenRequest(msg: unknown): msg is PickerGetTokenRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'rubi/picker-get-token'
  );
}

export function isPickerResultMessage(msg: unknown): msg is PickerResultMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as { type?: unknown; presentationId?: unknown; granted?: unknown };
  return (
    m.type === 'rubi/picker-result' && typeof m.presentationId === 'string' && typeof m.granted === 'boolean'
  );
}
