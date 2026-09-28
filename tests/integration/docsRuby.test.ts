/**
 * 結合テスト: service worker の「ふる」「消す」「付け直す」(src/worker/docsRuby.ts)を、偽の Docs(fakeDocs.ts)に対して
 * 最初から最後まで動かす。Chrome の機能(設定の保存・OAuth・拡張機能のファイル)は代わりのものを用意し、
 * 読みの計算は本物の kuromoji を使う。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import kuromoji from 'kuromoji';
import type { DocsRubyStyle, RubiSettings } from '@shared/settings';
import { FakeDocs, type FakeParagraph } from './fakeDocs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// kuromoji(Node 用の読み込み)で分かち書きする。tokenizer.ts はブラウザ用の読み込みなので差し替える
vi.mock('../../src/worker/tokenizer', () => ({
  tokenize: async (text: string) =>
    (globalThis as unknown as { __tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> }).__tokenizer
      .tokenize(text)
      .map((t) => ({ surface: t.surface_form, reading: t.reading, pos: t.pos, posDetail1: t.pos_detail_1 })),
  warmUpTokenizer: () => undefined,
}));

let fake: FakeDocs;
/** true のあいだ、Word 形式のまま開いた文書のように Docs API が 400 を返す */
let officeFile = false;
const store: Record<string, unknown> = {};

beforeAll(async () => {
  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) =>
    kuromoji.builder({ dicPath: `${ROOT}public/dict/` }).build((err, t) => (err ? reject(err) : resolve(t)))
  );
  (globalThis as unknown as { __tokenizer: unknown }).__tokenizer = tokenizer;

  // Chrome の機能の代わり
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      sync: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(store, items),
      },
    },
    identity: {
      getAuthToken: (_opts: unknown, cb: (token: string) => void) => cb('test-token'),
      removeCachedAuthToken: (_opts: unknown, cb: () => void) => cb(),
    },
    runtime: { getURL: (p: string) => `file://${ROOT}public/${p}`, lastError: undefined },
    i18n: { getMessage: () => '' },
  };

  // 拡張機能のファイルと、偽の Docs API
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('file://')) return new Response(readFileSync(fileURLToPath(url)));
    const m = /^https:\/\/docs\.googleapis\.com\/v1\/documents\/([^/:?]+)(:batchUpdate)?/.exec(url);
    if (!m || m[1] !== fake.documentId) return new Response('{}', { status: 404 });
    if (officeFile) {
      const message = 'This operation is not supported for this document. The document must not be an Office file.';
      return new Response(JSON.stringify({ error: { code: 400, message } }), { status: 400 });
    }
    if (!m[2]) return new Response(JSON.stringify(fake.getDocument()));
    const body = JSON.parse(String(init?.body)) as { requests: never[]; writeControl?: { requiredRevisionId?: string } };
    try {
      fake.batchUpdate(body.requests, body.writeControl?.requiredRevisionId);
      return new Response('{}');
    } catch (err) {
      return new Response(JSON.stringify({ error: { message: String(err) } }), { status: 400 });
    }
  }) as typeof fetch;
}, 30000);

const { writeRuby, deleteRuby } = await import('../../src/worker/docsRuby');

const PARAGRAPHS = (): FakeParagraph[] => [
  { text: '春の遠足のお知らせ', style: { namedStyleType: 'HEADING_1' } },
  {
    text: '4月20日に、1年生と2年生は近くの公園へ遠足に行きます。朝8時30分に学校の正門に集合してください。雨の場合は、体育館で学年ごとに活動します。',
    style: { namedStyleType: 'NORMAL_TEXT', indentFirstLine: { magnitude: 11, unit: 'PT' } },
  },
  { text: '今日は重要な連絡です。', runs: [{ from: 3, to: 5, ts: { bold: true } }] },
  { text: 'お弁当と水筒', bullet: true },
  { text: '持ち物：しおりと筆記用具', style: { namedStyleType: 'NORMAL_TEXT', alignment: 'CENTER' } },
];

function setSettings(patch: Partial<RubiSettings>): void {
  store.rubiSettings = { ...(store.rubiSettings as object), ...patch };
}

beforeEach(() => {
  fake = new FakeDocs(PARAGRAPHS());
  officeFile = false;
  for (const k of Object.keys(store)) delete store[k];
  setSettings({ docsStyle: 'table', rubyMode: 'per-word', sizeRatio: 0.5, skipKanji: 'none', color: '#1a1a1a' });
});

const write = (onlyIfPresent = false) => writeRuby(fake.documentId, fake.tabId, undefined, onlyIfPresent);
const remove = () => deleteRuby(fake.documentId, fake.tabId);

describe('ふる → 消す で元の文書に戻る(見せ方 5 通り × 振り方 2 通り)', () => {
  const styles: DocsRubyStyle[] = ['table', 'table-compact', 'paren', 'paren-small', 'superscript'];
  for (const docsStyle of styles) {
    for (const rubyMode of ['per-kanji', 'per-word'] as const) {
      it(`${docsStyle} / ${rubyMode}`, async () => {
        setSettings({ docsStyle, rubyMode });
        const before = fake.snapshot();
        const w = await write();
        expect(w.count).toBeGreaterThan(20);
        expect(fake.snapshot()).not.toBe(before);
        const d = await remove();
        expect(d.skipped).toBe(0);
        expect(fake.snapshot()).toBe(before);
        expect(fake.namedRangesOf('rubi')).toEqual([]);
      });
    }
  }
});

describe('漢字の上(表ルビ)の書き込み', () => {
  it('見出し・普通の段落は表に、箇条書きは括弧書き(小さい文字)にする。見出しの元の段落は見出しのまま残す', async () => {
    await write();
    expect(fake.tableCount).toBeGreaterThan(3);
    const doc = fake.getDocument().tabs?.[0]?.documentTab?.body?.content ?? [];
    const paragraphs = doc.filter((e) => e.paragraph);
    // 箇条書きの段落は表にせず、読みを差し込む
    expect(paragraphs.some((e) => e.paragraph?.bullet && e.paragraph.elements?.map((x) => x.textRun?.content).join('').includes('(べんとう)'))).toBe(true);
    // 見出しの元の段落(表の後ろ)は、段落の種類が見出しのまま
    expect(paragraphs.some((e) => e.paragraph?.paragraphStyle?.namedStyleType === 'HEADING_1')).toBe(true);
    // 太字の「重要」は、表の中でも太字
    const cells = doc.flatMap((e) => e.table?.tableRows?.[0]?.tableCells ?? []);
    const important = cells.find((c) => c.content?.at(-1)?.paragraph?.elements?.[0]?.textRun?.content === '重要\n');
    expect(important?.content?.at(-1)?.paragraph?.elements?.[0]?.textRun?.textStyle?.bold).toBe(true);
  });

  it('中央揃えの段落は、先頭に見えない列を入れて中央に寄せる', async () => {
    await write();
    const doc = fake.getDocument().tabs?.[0]?.documentTab?.body?.content ?? [];
    const lastTable = [...doc].reverse().find((e) => e.table);
    const first = lastTable?.table?.tableRows?.[0]?.tableCells?.[0]?.content?.map((p) => p.paragraph?.elements?.map((x) => x.textRun?.content).join(''));
    expect(first).toEqual(['\n', '\n']); // 本文も読みも空の列
  });
});

describe('付け直し(設定を変えたとき)', () => {
  it('ルビが付いていなければ何もしない', async () => {
    const before = fake.snapshot();
    const r = await write(true);
    expect(r.written).toBe(false);
    expect(fake.snapshot()).toBe(before);
    expect(fake.requestCount).toBe(0);
  });

  it('ルビが付いていれば、新しい設定で付け直す。消すと元に戻る', async () => {
    const before = fake.snapshot();
    await write();
    const first = fake.snapshot();
    setSettings({ sizeRatio: 0.65 });
    const r = await write(true);
    expect(r.written).toBe(true);
    expect(fake.snapshot()).not.toBe(first);
    await remove();
    expect(fake.snapshot()).toBe(before);
  });
});

describe('ルビを付けた後に先生が編集した場合', () => {
  it('表の間と、表の後ろ(元の段落)に打った文字は、消しても残る', async () => {
    await write();
    const group = fake.namedRangesOf('rubi-table:').sort((a, b) => a.start - b.start)[1];
    expect(group).toBeDefined();
    const doc = fake.getDocument().tabs?.[0]?.documentTab?.body?.content ?? [];
    const firstTable = doc.find((e) => e.table && (e.startIndex as number) >= (group?.start as number));
    fake.typeAt(group?.end as number, '追記'); // 元の段落の先頭
    fake.typeAt(firstTable?.endIndex as number, 'メモ'); // 1つ目と2つ目の表の間の段落
    const d = await remove();
    expect(d.skipped).toBe(0);
    expect(fake.tableCount).toBe(0);
    const text = fake.text();
    expect(text).toContain('メモ');
    expect(text).toContain('追記');
    expect(text).not.toContain('|');
  });

  it('表を足したまとまりは消さずに残して知らせる。付け直しても、その中には書き込まない', async () => {
    await write();
    const group = fake.namedRangesOf('rubi-table:').sort((a, b) => a.start - b.start)[1];
    const doc = fake.getDocument().tabs?.[0]?.documentTab?.body?.content ?? [];
    const firstTable = doc.find((e) => e.table && (e.startIndex as number) >= (group?.start as number));
    const tablesBefore = fake.tableCount;
    fake.addTableAt(firstTable?.endIndex as number);
    const d = await remove();
    expect(d.skipped).toBe(1);
    const kept = fake.tableCount;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(tablesBefore + 1);
    expect(fake.namedRangesOf('rubi-table:')).toHaveLength(1);

    const keptText = fake.text();
    const w = await write();
    expect(w.skipped).toBe(1);
    // 残したまとまりの中の文字は、書き直しの前後で変わらない(読みを二重に差し込まない)
    const segment = (t: string) => t.slice(t.indexOf('4'), t.indexOf('活動') + 2);
    expect(segment(fake.text())).toBe(segment(keptText));
  });
});

describe('省く漢字・ユーザー辞書', () => {
  it('小2までの漢字を省くと、ルビの数が減る', async () => {
    const all = (await write()).count;
    await remove();
    setSettings({ skipKanji: 'grade-2' });
    const fewer = (await write()).count;
    expect(fewer).toBeLessThan(all);
  });

  it('ユーザー辞書の読みを使う', async () => {
    store.rubiUserDict = { 春: { reading: 'しゅん' } };
    setSettings({ docsStyle: 'paren' });
    await write();
    expect(fake.text()).toContain('春（しゅん）');
  });
});

describe('Word 形式(.docx)のまま開いた文書', () => {
  it('ふる・消す・付け直すとも、Googleドキュメントに変換する方法を案内する', async () => {
    // chrome.i18n の代わりは '' を返すので、t() は文言のキーを返す
    officeFile = true;
    await expect(write()).rejects.toThrow('errorDocsOfficeFile');
    await expect(write(true)).rejects.toThrow('errorDocsOfficeFile');
    await expect(remove()).rejects.toThrow('errorDocsOfficeFile');
    const ja = JSON.parse(new TextDecoder().decode(readFileSync(`${ROOT}public/_locales/ja/messages.json`))) as Record<string, { message: string }>;
    expect(ja.errorDocsOfficeFile?.message).toContain('「ファイル」→「Google ドキュメントとして保存」');
  });
});
