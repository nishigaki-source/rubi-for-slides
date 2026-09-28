/**
 * サイドパネル(と動作確認用の受け口)から service worker への指示と、その返事の形。
 */

/**
 * - 'write': ルビをふる(付いていれば付け直す)
 * - 'refresh': ルビが付いているときだけ、今の設定で付け直す(設定を変えたときにサイドパネルが送る)
 * - 'delete': ルビを消す
 * - 'create-test-doc': テスト用の文書を作る(開発版)
 */
export type DocsCommand = 'write' | 'refresh' | 'delete' | 'create-test-doc';

const DOCS_COMMANDS: readonly string[] = ['write', 'refresh', 'delete', 'create-test-doc'];

export interface DocsCommandRequest {
  type: 'rubi-docs/command';
  command: DocsCommand;
  /** 文書を開いているブラウザのタブの ID(表ルビの文字幅をそのページで測るため) */
  browserTabId?: number;
  /** 'write'・'delete' の対象の文書 */
  documentId?: string;
  /** 複数タブの文書で、対象のタブ(省略すると最初のタブ) */
  tabId?: string;
}

export type DocsCommandResponse =
  | {
      ok: true;
      /** 書き込んだ・消したルビの数 */
      count?: number;
      /** ルビを付けた後に編集されていたため、消さずに残した表ルビのまとまりの数 */
      skipped?: number;
      /** 表ルビのために、文書のページで幅を測れた文字の数(0 なら既定の幅を使った) */
      measuredChars?: number;
      /** 動作確認用ビルドだけ: 処理ごとの時間(ミリ秒)とリクエストの数 */
      timing?: Record<string, number>;
      /** 'create-test-doc' で作った文書の ID */
      documentId?: string;
      /** 'refresh' で付け直したか(ルビが付いていなければ false) */
      refreshed?: boolean;
    }
  | { ok: false; message: string };

export function isDocsCommandRequest(msg: unknown): msg is DocsCommandRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'rubi-docs/command' && typeof m.command === 'string' && DOCS_COMMANDS.includes(m.command);
}

/**
 * 動作確認用ビルドだけ: 文書をそのまま読む・リクエストをそのまま送る(表の index の調査用)。
 * drive.file なので、対象はこの拡張機能が作った・許可された文書だけ。
 */
export interface QaDebugRequest {
  type: 'rubi-qa/debug';
  documentId: string;
  /** 省略すると documents.get の結果を返す */
  requests?: unknown[];
}

/** 動作確認用ビルドだけ: 拡張機能を読み込み直す指示(スライド版の qaBridge と同じ) */
export interface QaReloadRequest {
  type: 'rubi-qa/reload-extension';
}
