/**
 * Googleスライドの URL からプレゼンテーションIDと現在表示中のページ(スライド)の
 * objectId を取り出す純粋関数。DOM に依存しないため単体テスト可能。
 *
 * 例: https://docs.google.com/presentation/d/1AbCdEf.../edit?slide=id.p3#slide=id.p3
 *   -> presentationId = "1AbCdEf...", pageObjectId = "p3"
 */

export interface ParsedSlidesUrl {
  presentationId: string;
  pageObjectId: string;
}

export function parseSlidesUrl(href: string): ParsedSlidesUrl | null {
  const idMatch = /\/presentation\/d\/([a-zA-Z0-9_-]+)/.exec(href);
  const slideMatch = /slide=id\.([a-zA-Z0-9_]+)/.exec(href);
  if (!idMatch?.[1] || !slideMatch?.[1]) return null;
  return { presentationId: idMatch[1], pageObjectId: slideMatch[1] };
}
