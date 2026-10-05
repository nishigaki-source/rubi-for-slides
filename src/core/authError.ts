/**
 * Google アカウントの許可(chrome.identity.getAuthToken)の失敗を、原因の種類に分ける(chrome.* にも DOM にも依存しない)。
 *
 * getAuthToken は、失敗の理由を Chrome の英語のメッセージで返す。そのまま画面に出すと、利用者は何をすればよいか分からず、
 * 「動かない拡張機能」と受け取られる(2026-10 のアンインストールの調査で、初めて使う人のつまずきの候補になった)。
 * 種類ごとに、日本語で対処を案内する。種類の判定は、Chrome の既知のメッセージの一部で行う(文言は Chrome のバージョンで少し変わる)。
 *
 * 画面に出さず、原因の切り分けに使う元のメッセージは、案内の後ろに添える(サポートで聞くとき)。
 */
export type AuthErrorKind =
  /** Chrome に Google アカウントでログインしていない */
  | 'not-signed-in'
  /** 許可の画面で「許可」を押さなかった・閉じた・管理者に止められた */
  | 'not-approved'
  /** Google に接続できなかった */
  | 'network'
  /** Chrome 以外のブラウザ(Edge・Chromium など)で、この許可の仕組みが使えない */
  | 'unsupported-browser'
  | 'other';

export function classifyAuthError(message: string | undefined): AuthErrorKind {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'other';
  if (m.includes('not signed in') || m.includes('sign in') || m.includes('signed out')) return 'not-signed-in';
  if (
    m.includes('did not approve') ||
    m.includes('not granted') ||
    m.includes('revoked') ||
    m.includes('access denied') ||
    m.includes('access_denied') ||
    m.includes('user denied')
  ) {
    return 'not-approved';
  }
  if (
    m.includes('could not be loaded') ||
    m.includes('net::') ||
    m.includes('network') ||
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('offline')
  ) {
    return 'network';
  }
  if (
    m.includes('client id') ||
    m.includes('invalid_client') ||
    m.includes('bad client') ||
    m.includes('not supported') ||
    m.includes('unsupported')
  ) {
    return 'unsupported-browser';
  }
  return 'other';
}

/** 画面に出す文言のキー(_locales の messages.json)。 */
export const AUTH_ERROR_MESSAGE_KEYS: Readonly<Record<AuthErrorKind, string>> = {
  'not-signed-in': 'errorAuthNotSignedIn',
  'not-approved': 'errorAuthNotApproved',
  network: 'errorAuthNetwork',
  'unsupported-browser': 'errorAuthUnsupportedBrowser',
  other: 'errorAuthOther',
};
