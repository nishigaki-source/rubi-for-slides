/**
 * ReadingService の中核: 形態素トークンからルビ区間を組み立てる。
 *
 * アルゴリズム概要（PLAN.md 3.4節 / PHASE0_FINDINGS.md 6節で検証済み）:
 *   1. 表層形を「漢字の連続」と「かな等の連続」に交互のセグメントへ分割する
 *      （例: "打ち合わせ" -> [漢字"打", かな"ち", 漢字"合", かな"わせ"]）
 *   2. 各セグメントを先頭から順に読み（ひらがな）と突き合わせる。
 *      かなセグメントは読みの中に同じ文字列がそのまま現れるはずなので、
 *      そこまでの読みを直前の漢字セグメントに割り当てる。
 *   3. かなセグメントが読みと一致しない場合（未知語などで整合が取れない場合）は
 *      安全側に倒し、トークン全体を 1 つのグループルビにフォールバックする。
 *
 * このアルゴリズムは「全部漢字のトークン」（例: 学校）と
 * 「送り仮名混じりのトークン」（例: 食べる、打ち合わせ、自由が丘）の
 * どちらも同じロジックで正しく扱える（Phase 0 で実例により確認済み）。
 */

import { hasKanji, isKanji, katakanaToHiragana } from './kana';
import type {
  GradeFilterOptions,
  ReadingServiceOptions,
  RubyRange,
  RubyToken,
  TokenizedWord,
} from './types';

type Segment = { type: 'kanji' | 'other'; text: string; start: number; end: number };

/** 表層形を漢字ラン／非漢字ラン（かな・記号等）に交互分割する。 */
function segmentSurface(surface: string): Segment[] {
  const segments: Segment[] = [];
  const chars = Array.from(surface);
  let i = 0;
  while (i < chars.length) {
    const start = i;
    const kindIsKanji = isKanji(chars[i] as string);
    let text = '';
    while (i < chars.length && isKanji(chars[i] as string) === kindIsKanji) {
      text += chars[i];
      i++;
    }
    segments.push({ type: kindIsKanji ? 'kanji' : 'other', text, start, end: i });
  }
  return segments;
}

/**
 * 読みが有効か（kuromoji の未知語マーカー "*" や空文字でないか）を判定する。
 */
function isUsableReading(reading: string | undefined): reading is string {
  return typeof reading === 'string' && reading.length > 0 && reading !== '*';
}

/**
 * セグメント列と読み（ひらがな）を突き合わせ、漢字セグメントごとの RubyRange を作る。
 * 整合が取れなくなった場合は null を返す（呼び出し側でグループルビにフォールバックする）。
 */
function alignSegments(segments: Segment[], readingHira: string): RubyRange[] | null {
  const ranges: RubyRange[] = [];
  let cursor = 0; // readingHira 内の現在位置

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s] as Segment;
    if (seg.type === 'other') {
      // かな・記号セグメント: 読みの中に同じ文字列がそのまま現れるはず
      const slice = readingHira.slice(cursor, cursor + seg.text.length);
      if (slice !== seg.text) {
        return null; // 整合が取れない -> フォールバック
      }
      cursor += seg.text.length;
      continue;
    }

    // 漢字セグメント: 次のかなセグメントが読みの中に現れる位置までを読みとして割り当てる
    const nextOther = segments.slice(s + 1).find((x) => x.type === 'other');
    let segReading: string;
    if (nextOther) {
      const idx = readingHira.indexOf(nextOther.text, cursor);
      if (idx === -1) {
        return null; // フォールバック
      }
      segReading = readingHira.slice(cursor, idx);
      cursor = idx;
    } else {
      // 最後のセグメント（これ以降にかなが無い）: 残り全部
      segReading = readingHira.slice(cursor);
      cursor = readingHira.length;
    }

    if (segReading.length === 0) {
      // 漢字セグメントなのに読みが割り当てられない = 整合性エラー
      return null;
    }

    ranges.push({ start: seg.start, end: seg.end, kana: segReading });
  }

  return ranges;
}

/** トークン内の漢字がすべて指定学年以下かどうかを判定する。未知の漢字は安全側（false）。 */
function isAllKanjiWithinGrade(surface: string, filter: GradeFilterOptions): boolean {
  for (const char of surface) {
    if (!isKanji(char)) continue;
    const grade = filter.gradeTable[char];
    if (grade === undefined || grade > filter.maxGrade) {
      return false; // 学年不明、または指定学年より上 -> フィルタ対象外(=ルビを振る)
    }
  }
  return true;
}

/**
 * 1 トークンに対してルビ区間を組み立てる。
 */
export function buildRubyToken(
  token: TokenizedWord,
  options: ReadingServiceOptions = {}
): RubyToken {
  const { surface } = token;

  if (!hasKanji(surface)) {
    return { surface, rubyRanges: [] };
  }

  // ユーザー辞書に明示的なエントリがある単語は学年フィルタより優先する
  // (読み・見た目のどちらであっても、ユーザーが個別設定した意図を尊重する)。
  const userEntry = options.userDict?.[surface];

  // 読みの上書きが指定されている場合は、常に単語全体へのグループルビとして扱う。
  if (userEntry?.reading) {
    return {
      surface,
      rubyRanges: [{ start: 0, end: surface.length, kana: userEntry.reading, style: userEntry.style }],
    };
  }

  if (!isUsableReading(token.reading)) {
    // 読みを決定できないトークンにはルビを振らない(誤ったルビを振るより安全)。
    return { surface, rubyRanges: [] };
  }

  if (!userEntry && options.gradeFilter && isAllKanjiWithinGrade(surface, options.gradeFilter)) {
    return { surface, rubyRanges: [] };
  }

  const readingHira = katakanaToHiragana(token.reading);
  const segments = segmentSurface(surface);
  const aligned = alignSegments(segments, readingHira);

  // フォールバック: 整合が取れない場合は単語全体を 1 つのグループルビにする。
  const rubyRanges = aligned ?? [{ start: 0, end: surface.length, kana: readingHira }];

  // 見た目だけの上書き(読みは kuromoji のまま)が指定されている場合、
  // その単語から得られた全区間に適用する。
  if (userEntry?.style) {
    return { surface, rubyRanges: rubyRanges.map((r) => ({ ...r, style: userEntry.style })) };
  }

  return { surface, rubyRanges };
}

/**
 * ユーザー辞書の表層形が複数トークンにまたがる場合(例: 「雀魂」が「雀」「魂」に
 * 分かれる)や、トークンの途中に現れる場合に備え、辞書の表層形と一致する範囲を
 * 1 トークンにまとめ直す。
 *
 * 手順: トークン境界と辞書語の境界の両方でテキストを切り、断片ごとに読みを決める
 * (元トークンと完全一致する断片だけが読みを引き継ぎ、分断された断片は読み不明 "*")。
 * その後、同じ辞書語に属する連続した断片を 1 トークンに連結する(読みは全断片が
 * 判明している場合のみ連結、それ以外は "*"。読みの上書きエントリなら辞書側の
 * 読みが使われるので影響しない)。
 */
export function mergeUserDictTokens(
  tokens: TokenizedWord[],
  userDict: ReadingServiceOptions['userDict']
): TokenizedWord[] {
  const surfaces = Object.keys(userDict ?? {})
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length);
  if (surfaces.length === 0 || tokens.length === 0) return tokens;

  const text = tokens.map((t) => t.surface).join('');

  // 辞書語の出現位置(左から順に、最長一致・重なりなし)
  const matchAt = new Array<number>(text.length).fill(-1); // 各文字がどの辞書語(index)に属するか
  let matchCount = 0;
  for (let i = 0; i < text.length; ) {
    const hit = surfaces.find((s) => text.startsWith(s, i));
    if (!hit) {
      i++;
      continue;
    }
    for (let k = i; k < i + hit.length; k++) matchAt[k] = matchCount;
    matchCount++;
    i += hit.length;
  }
  if (matchCount === 0) return tokens;

  // トークン境界と辞書語境界の両方で切った断片を作る
  // (matchAt と同じく UTF-16 コード単位で位置を数える)
  type Piece = TokenizedWord & { match: number };
  const pieces: Piece[] = [];
  let pos = 0;
  for (const token of tokens) {
    const len = token.surface.length;
    let segStart = 0;
    for (let c = 1; c <= len; c++) {
      const boundary = c === len || matchAt[pos + c] !== matchAt[pos + segStart];
      if (!boundary) continue;
      const whole = segStart === 0 && c === len;
      pieces.push({
        ...(whole ? token : {}),
        surface: token.surface.slice(segStart, c),
        reading: whole ? token.reading : '*',
        match: matchAt[pos + segStart] ?? -1,
      });
      segStart = c;
    }
    pos += len;
  }

  // 同じ辞書語に属する連続した断片を連結する
  const result: Piece[] = [];
  for (const piece of pieces) {
    const prev = result[result.length - 1];
    if (piece.match !== -1 && prev && prev.match === piece.match) {
      prev.surface += piece.surface;
      prev.reading =
        isUsableReading(prev.reading) && isUsableReading(piece.reading) ? prev.reading + piece.reading : '*';
      continue;
    }
    result.push({ ...piece });
  }
  return result.map(({ match: _match, ...token }) => token);
}

/** トークン列をまとめて処理する。 */
export function buildRubyTokens(
  tokens: TokenizedWord[],
  options: ReadingServiceOptions = {}
): RubyToken[] {
  return mergeUserDictTokens(tokens, options.userDict).map((t) => buildRubyToken(t, options));
}
