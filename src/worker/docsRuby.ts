/**
 * 「ルビをふる」「ルビを消す」「テスト用の文書を作る」の流れ(service worker 側)。
 *
 * ルビをふる:
 *   1. すでに付いているルビを消す(付け直しても二重にならないように)
 *   2. 文書を読み、対象のタブの段落ごとに kuromoji → buildRubyTokens で読みを決める
 *   3. 段落ごとに書き込み方を決める
 *      - 見せ方 E・F: 普通の段落と見出しは表ルビ。箇条書き・表の中の段落・画像や改行(Shift+Enter)を含む段落は B
 *        (2026-09-28 決定。表にすると形が崩れやすいため)
 *      - 見せ方 A・B・C: すべての段落をその見せ方で
 *   4. 後ろの段落から順にリクエストを並べ、1回の batchUpdate で書き込む(読んだ版から変わっていたら Docs 側で拒否される)
 */
import { hasKanji } from '../core/kana';
import { createKnownKanjiFilter } from '../core/knownKanji';
import { buildRubyTokens } from '../core/reading';
import type { ReadingServiceOptions } from '../core/types';
import { buildDeleteRubyRequests, collectRubiRanges, newlineStyleFix } from '../core/docs/deleteRuby';
import {
  extractParagraphs,
  fontSizeAt,
  listSegments,
  namedStyleFontFamily,
  namedStyleFontSize,
  OBJECT_PLACEHOLDER,
  paragraphGeometry,
  textAreaWidthPt,
  type DocParagraph,
  type DocSegment,
} from '../core/docs/extract';
import { buildInlineRubyRequests, RUBI_RANGE_NAME, type InlineRubyStyle } from '../core/docs/inlineRuby';
import {
  alignLines,
  charactersToMeasure,
  DEFAULT_FONT,
  layoutRubyLines,
  measureFromTable,
  unitsForParagraph,
  type LineLayoutOptions,
  type RubyUnit,
} from '../core/docs/lineLayout';
import { rubySpansForParagraph, type RubySpan } from '../core/docs/rubySpans';
import { buildRestoreTableRubyRequests, buildTableRubyRequests, collectTableGroups } from '../core/docs/tableRuby';
import type { DocsDocument, DocsRequest } from '../core/docs/types';
import { loadSettings, type RubiSettings } from '../shared/settings';
import { t } from '../shared/i18n';
import { loadUserDict } from '../shared/userDictStorage';
import { batchUpdate, createDocument, getDocument } from './docsClient';
import { getKanjiLevels } from './kanjiLevels';
import { getKanjiReadings } from './kanjiReadings';
import { measureCharWidths } from './measure';
import { tokenize } from './tokenizer';

/** 1行の幅に残す余裕(pt)。測った幅と実際の表示のわずかな違いで、表が次の行にはみ出さないように。 */
const LINE_WIDTH_MARGIN_PT = 4;
/**
 * 1つの表の列の上限。Docs の画面では 20 列までだが、API では 50 列の表も作れた(2026-09-28 実機)。
 * 実際には本文の幅のほうが先に上限になる。
 */
const MAX_TABLE_COLUMNS = 50;
/**
 * F: 読みが「本文 + 半文字」より長い語は、読みを本文の 35% まで縮める(PHASE0_FINDINGS.md 4.1節)。
 * ただし 5pt より小さくはしない(2026-09-28 決定。本文 11pt だと 35% は 3.9pt で、印刷すると読めないため)。
 */
const COMPACT_SHRINK = { allowanceEm: 0.5, minRatio: 0.35, minPt: 5 };

/** 対象のタブ(指定が無い・見つからないときは最初のタブ)。 */
function pickSegment(doc: DocsDocument, tabId: string | undefined): DocSegment {
  const segments = listSegments(doc);
  const seg = segments.find((s) => tabId !== undefined && s.tabId === tabId) ?? segments[0];
  if (!seg) throw new Error(t('errorDocsBodyNotFound'));
  return seg;
}

async function readingOptions(settings: RubiSettings): Promise<ReadingServiceOptions> {
  const [kanjiReadings, userDict, levels] = await Promise.all([
    getKanjiReadings(),
    loadUserDict(),
    settings.skipKanji === 'none' ? Promise.resolve(null) : getKanjiLevels(),
  ]);
  const knownKanjiFilter = levels ? createKnownKanjiFilter(settings.skipKanji, levels) : null;
  return {
    rubyMode: settings.rubyMode,
    kanjiReadings,
    userDict,
    ...(knownKanjiFilter ? { knownKanjiFilter } : {}),
  };
}

/**
 * 対象のタブの、すでに付いているルビ(本文に差し込んだ読み・表ルビ)を消す。消した数と、消さずに残したまとまりの数を返す。
 * 表ルビのまとまりの中の表の数が書き込んだときと違う(先生が表を足した・消したなど)ときは、そのまとまりは消さない。
 */
export async function deleteRuby(documentId: string, tabId?: string): Promise<{ count: number; skipped: number }> {
  const doc = await getDocument(documentId);
  const seg = pickSegment(doc, tabId);
  const content = seg.body.content ?? [];
  const inline = collectRubiRanges(seg.namedRanges);
  const groups = collectTableGroups(seg.namedRanges);
  // ヘッダー・フッター・脚注に差し込んだ読み(それぞれ独自の index。消すリクエストはどこに並べても互いに影響しない)
  const subRequests: DocsRequest[] = [];
  let subCount = 0;
  for (const sub of seg.subSegments) {
    const ranges = collectRubiRanges(seg.namedRanges, sub.segmentId);
    if (ranges.length === 0) continue;
    const subParagraphs = extractParagraphs(sub.content, seg.tabId !== undefined ? { tabId: seg.tabId } : {});
    for (const r of [...ranges].sort((a, b) => b.startIndex - a.startIndex)) {
      subRequests.push(...buildDeleteRubyRequests([r], seg.tabId, sub.segmentId).slice(0, 1));
      const fix = newlineStyleFix(subParagraphs, r, seg.tabId, sub.segmentId);
      if (fix) subRequests.push(fix);
    }
    subCount += ranges.length;
  }
  if (inline.length === 0 && groups.length === 0 && subCount === 0) return { count: 0, skipped: 0 };
  const paragraphs = extractParagraphs(content, seg.tabId !== undefined ? { tabId: seg.tabId } : {});

  // 後ろのものから順に消す(前の位置がずれないように)
  const restorable: { start: number; requests: DocsRequest[]; group: (typeof groups)[number] }[] = [];
  let skipped = 0;
  for (const g of groups) {
    const reqs = buildRestoreTableRubyRequests(
      content,
      g,
      seg.tabId,
      namedStyleFontSize(seg.namedStyles, g.style.namedStyleType ?? 'NORMAL_TEXT')
    );
    if (reqs) restorable.push({ start: g.startIndex, requests: reqs, group: g });
    else skipped++;
  }
  const blocks: { start: number; requests: DocsRequest[] }[] = [
    ...restorable,
    ...inline.map((r) => {
      const fix = newlineStyleFix(paragraphs, r, seg.tabId);
      return { start: r.startIndex, requests: [...buildDeleteRubyRequests([r], seg.tabId).slice(0, 1), ...(fix ? [fix] : [])] };
    }),
  ].sort((a, b) => b.start - a.start);

  // 名前付き範囲を消す: 本文に差し込んだ読みは名前で、表ルビは消したまとまりだけを ID で(残したまとまりの目印は消さない)
  const tabsCriteria = seg.tabId !== undefined ? { tabsCriteria: { tabIds: [seg.tabId] } } : {};
  const removeNamed: DocsRequest[] = [
    ...(inline.length > 0 || subCount > 0 ? [{ deleteNamedRange: { name: RUBI_RANGE_NAME, ...tabsCriteria } }] : []),
    ...restorable.map((r) =>
      r.group.namedRangeId
        ? { deleteNamedRange: { namedRangeId: r.group.namedRangeId, ...tabsCriteria } }
        : { deleteNamedRange: { name: r.group.name, ...tabsCriteria } }
    ),
  ];
  await batchUpdate(documentId, [...blocks.flatMap((b) => b.requests), ...subRequests, ...removeNamed], doc.revisionId);
  return { count: inline.length + restorable.length + subCount, skipped };
}

/** 表ルビにできる段落か(箇条書き・表の中・画像や段落内の改行を含む段落は B にする)。 */
function canUseTable(p: DocParagraph): boolean {
  return !p.inTable && !p.hasBullet && !p.text.includes(OBJECT_PLACEHOLDER) && !p.text.includes('\u000b');
}

/**
 * 対象のタブにルビを書き込む。書き込んだ読みの数と、表ルビのためにページで幅を測れた文字の数を返す。
 * browserTabId は文書を開いているブラウザのタブ(表ルビの文字の幅をそのページで測る)。
 * onlyIfPresent が true なら、ルビが付いていないときは何もしない(設定を変えたときの自動の付け直し。written: false)。
 */
export async function writeRuby(
  documentId: string,
  tabId?: string,
  browserTabId?: number,
  onlyIfPresent = false
): Promise<{ count: number; measuredChars: number; skipped: number; written: boolean; timing: Record<string, number> }> {
  // 処理ごとの時間(ミリ秒)。遅いところを調べるために返す
  const timing: Record<string, number> = {};
  let t = Date.now();
  const lap = (name: string): void => {
    const now = Date.now();
    timing[name] = now - t;
    t = now;
  };
  const settings = await loadSettings();
  const style = settings.docsStyle;
  const useTable = style === 'table' || style === 'table-compact';
  const inlineStyle: InlineRubyStyle = style === 'table' || style === 'table-compact' ? 'paren-small' : style;

  const { count: existing, skipped } = await deleteRuby(documentId, tabId);
  lap('deleteExisting');
  if (onlyIfPresent && existing === 0 && skipped === 0) {
    return { count: 0, measuredChars: 0, skipped: 0, written: false, timing };
  }
  const [doc, options] = await Promise.all([getDocument(documentId), readingOptions(settings)]);
  lap('read');
  const seg = pickSegment(doc, tabId);
  const tab = seg.tabId !== undefined ? { tabId: seg.tabId } : {};
  // 消さずに残した表ルビのまとまり(編集されていたもの)の中には書き込まない
  const kept = collectTableGroups(seg.namedRanges);
  const insideKept = (e: { startIndex?: number }) =>
    kept.some((g) => typeof e.startIndex === 'number' && e.startIndex >= g.startIndex && e.startIndex < g.endIndex);
  const paragraphs = extractParagraphs(seg.body.content, { ...tab, namedStyles: seg.namedStyles, skipTable: insideKept }).filter(
    (p) => !insideKept(p)
  );

  // 段落ごとの読みの区間
  const planned: { paragraph: DocParagraph; spans: RubySpan[]; table: boolean }[] = [];
  for (const p of paragraphs) {
    if (!hasKanji(p.text)) continue;
    const spans = rubySpansForParagraph(p, buildRubyTokens(await tokenize(p.text), options));
    if (!spans) {
      console.warn('[ルビふり] 段落の位置の対応が取れないため飛ばしました', p.startIndex);
      continue;
    }
    if (spans.length > 0) planned.push({ paragraph: p, spans, table: useTable && canUseTable(p) });
  }
  lap('tokenize');

  // 表ルビの段落: 単位に分け、ページで文字の幅を測ってから行に分ける
  const unitsOf = new Map<DocParagraph, RubyUnit[]>();
  for (const pl of planned) {
    if (!pl.table) continue;
    const family = namedStyleFontFamily(seg.namedStyles, pl.paragraph.namedStyleType) ?? DEFAULT_FONT.family;
    unitsOf.set(pl.paragraph, unitsForParagraph(pl.paragraph, pl.spans, family, settings.fontFamily));
  }
  const toMeasure = charactersToMeasure([...unitsOf.values()].flat());
  const widths = await measureCharWidths(browserTabId, toMeasure);
  lap('measure');
  const textWidth = textAreaWidthPt(seg.documentStyle) - LINE_WIDTH_MARGIN_PT;
  const baseLayout = {
    maxColumns: MAX_TABLE_COLUMNS - 1, // 先頭の見えない列(字下げ・中央揃え)の分を空けておく
    readingRatio: settings.sizeRatio,
    measure: measureFromTable(widths),
    ...(settings.docsStyle === 'table-compact' ? { shrink: COMPACT_SHRINK } : {}),
  };

  // 後ろの段落から順にリクエストを並べる
  const requests: DocsRequest[] = [];
  for (const pl of [...planned].sort((a, b) => b.paragraph.startIndex - a.paragraph.startIndex)) {
    const units = unitsOf.get(pl.paragraph);
    if (units) {
      const g = paragraphGeometry(pl.paragraph, seg.namedStyles);
      const available = textWidth - g.indentStartPt - g.indentEndPt;
      const layoutOptions: LineLayoutOptions = {
        ...baseLayout,
        maxWidthPt: available,
        // 1行目は indentFirstLine の位置から始まる(indentStart からの差の分だけ、使える幅が変わる)
        ...(g.alignment === 'START' || g.alignment === 'JUSTIFIED'
          ? { firstLineIndentPt: g.indentFirstLinePt - g.indentStartPt }
          : {}),
      };
      const lines = alignLines(layoutRubyLines(units, layoutOptions), g, available);
      requests.push(...buildTableRubyRequests(pl.paragraph, lines, { ...tab, color: settings.color }).requests);
    } else {
      requests.push(
        ...buildInlineRubyRequests(pl.spans, {
          style: inlineStyle,
          ...tab,
          sizeRatio: settings.sizeRatio,
          color: settings.color,
          fontSizeAt: (index) => fontSizeAt(pl.paragraph, index),
        })
      );
    }
  }

  // ヘッダー・フッター・脚注: 本文に差し込む見せ方で書く(表を使う見せ方のときは「括弧書き（小さい文字）」)
  let subCount = 0;
  for (const sub of seg.subSegments) {
    const subParagraphs = extractParagraphs(sub.content, { ...tab, namedStyles: seg.namedStyles });
    for (const p of [...subParagraphs].sort((a, b) => b.startIndex - a.startIndex)) {
      if (!hasKanji(p.text)) continue;
      const spans = rubySpansForParagraph(p, buildRubyTokens(await tokenize(p.text), options));
      if (!spans || spans.length === 0) continue;
      requests.push(
        ...buildInlineRubyRequests(spans, {
          style: inlineStyle,
          ...tab,
          segmentId: sub.segmentId,
          sizeRatio: settings.sizeRatio,
          color: settings.color,
          fontSizeAt: (index) => fontSizeAt(p, index),
        })
      );
      subCount += spans.length;
    }
  }
  lap('build');
  timing.requests = requests.length;
  await batchUpdate(documentId, requests, doc.revisionId);
  lap('batchUpdate');
  const measuredChars = [...widths.values()].reduce((n, m) => n + m.size, 0);
  return { count: planned.reduce((n, pl) => n + pl.spans.length, 0) + subCount, measuredChars, skipped, written: true, timing };
}

const TEST_DOC_TITLE = 'ルビふり テスト文書(削除可)';
const TEST_DOC_PARAGRAPHS = [
  '春の遠足のお知らせ',
  '4月20日に、1年生と2年生は近くの公園へ遠足に行きます。朝8時30分に学校の正門に集合してください。雨の場合は、体育館で学年ごとに活動します。',
  '持ち物：お弁当、水筒、雨具、しおりと筆記用具',
  '当日の朝、体調が悪いときは、7時30分までに学校へ電話で連絡してください。保護者の皆様のご協力をよろしくお願いいたします。',
];

/**
 * テスト用の文書を作り、例文を入れる。拡張機能が作った文書なので、drive.file でも Picker なしで読み書きできる。
 * 作った文書の ID を返す。
 */
export async function createTestDocument(): Promise<string> {
  const documentId = await createDocument(TEST_DOC_TITLE);
  const text = TEST_DOC_PARAGRAPHS.join('\n');
  const titleEnd = 1 + (TEST_DOC_PARAGRAPHS[0]?.length ?? 0) + 1;
  await batchUpdate(documentId, [
    { insertText: { location: { index: 1 }, text } },
    {
      updateParagraphStyle: {
        range: { startIndex: 1, endIndex: titleEnd },
        paragraphStyle: { namedStyleType: 'HEADING_1' },
        fields: 'namedStyleType',
      },
    },
  ]);
  return documentId;
}
