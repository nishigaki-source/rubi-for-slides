/**
 * service worker へのトークン化リクエストを送る薄いクライアント。
 */
import { nextRequestId, type TokenizeRequest, type TokenizeResponse } from '../core/messages';
import type { TokenizedWord } from '../core/types';

export async function tokenizeText(text: string): Promise<TokenizedWord[]> {
  const request: TokenizeRequest = {
    type: 'rubi/tokenize',
    requestId: nextRequestId(),
    text,
  };
  const response = (await chrome.runtime.sendMessage(request)) as TokenizeResponse;
  if (response.type === 'rubi/tokenize-error') {
    throw new Error(response.message);
  }
  return response.tokens;
}
