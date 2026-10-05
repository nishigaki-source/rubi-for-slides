import { AUTH_ERROR_MESSAGE_KEYS, classifyAuthError } from '../core/authError';
import { t } from '../shared/i18n';

/**
 * chrome.identity を使った OAuth トークン管理(モード B用)。
 * manifest.json の oauth2 設定(client_id・scopes)を前提にする。
 *
 * getAuthToken({interactive:true}) は、未認可の場合に Google の同意画面を
 * 自動的に表示する。ユーザーが初めて書き込み機能を使うときに一度だけ
 * 同意すれば、以降はキャッシュされたトークンが使われる。
 */

/** chrome.identity.getAuthToken のコールバック引数は Chrome のバージョンにより
 * 文字列(古い)またはオブジェクト(新しい, {token, grantedScopes})で返ることがある。 */
type GetAuthTokenResult = string | { token?: string } | undefined;

function extractToken(result: GetAuthTokenResult): string | null {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && typeof result.token === 'string') return result.token;
  return null;
}

/**
 * 許可の失敗を、原因に合わせた日本語(ブラウザの言語に合わせる)の案内にする。元の英語のメッセージは、サポートで原因を聞くときの
 * ために、案内の後ろに添える。
 */
export function authError(original: string | undefined): Error {
  const guide = t(AUTH_ERROR_MESSAGE_KEYS[classifyAuthError(original)]);
  return new Error(original ? `${guide}\n(${original})` : guide);
}

/**
 * OAuth アクセストークンを取得する。
 * @param interactive true の場合、未認可なら Google の同意画面を表示する。
 *   false の場合はキャッシュ済みトークンが無ければ即座に失敗する(サイレントチェック用)。
 */
export function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const token = extractToken(result as GetAuthTokenResult);
      if (chrome.runtime.lastError || !token) {
        reject(authError(chrome.runtime.lastError?.message));
        return;
      }
      resolve(token);
    });
  });
}

/** 無効になった(401等の)トークンをキャッシュから破棄する。次回は再取得される。 */
export function revokeAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}
