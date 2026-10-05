/**
 * サイドパネルの画面の e2e テスト(v1.0.0 でドキュメント対応を統合したときに追加)。
 * ビルドしたサイドパネル(tests/e2e/panel-dist)をふつうのページとして開き、Chrome の機能の代わりを入れて、
 * 開いているタブ(スライド・ドキュメント・それ以外)ごとの出し分けと、ドキュメントでの動きを確かめる。
 * (ドキュメントへの書き込みそのものは tests/integration で確かめる)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const PANEL_URL = 'http://localhost:4175/src/sidepanel/index.html';
const MESSAGES_PATH = fileURLToPath(new URL('../../public/_locales/ja/messages.json', import.meta.url));
const MESSAGES = JSON.parse(new TextDecoder().decode(readFileSync(MESSAGES_PATH))) as Record<
  string,
  { message: string; placeholders?: Record<string, { content: string }> }
>;

const DOCS_URL = 'https://docs.google.com/document/d/abc123/edit?tab=t.0';
const SLIDES_URL = 'https://docs.google.com/presentation/d/xyz/edit#slide=id.p';

interface FakeChromeOptions {
  url: string;
  settings?: Record<string, unknown>;
  /** スライドのタブ(content script)が、パネルの指示に返す答え。省略時は「ルビの大きさの一覧なし」 */
  tabResponse?: unknown;
  /** ドキュメントの指示(ふる・消す・付け直す)の答えが返るまでの時間(ms)。長い文書で時間がかかる様子を再現する */
  docsDelayMs?: number;
  /** 付け直しの答えで、実際に付け直したか(ルビが付いていない文書では false) */
  docsRefreshed?: boolean;
}

/** ページに Chrome の機能の代わりを入れる。送った指示は window.__sent に、保存した設定は window.__store に残る */
async function openPanel(page: Page, options: FakeChromeOptions): Promise<void> {
  await page.addInitScript(
    ({ opts, messages }) => {
      const w = window as unknown as Record<string, unknown>;
      const store: Record<string, unknown> = {
        rubiSettings: {
          enabled: true,
          sizeRatio: 0.5,
          skipKanji: 'none',
          fontFamily: 'Arial',
          color: '#1a1a1a',
          rubyMode: 'per-kanji',
          docsStyle: 'table',
          slidesRubyLanguage: 'ja',
          docsRubyLanguage: 'ja',
          ...(opts.settings ?? {}),
        },
      };
      const sent: unknown[] = [];
      w.__store = store;
      w.__sent = sent;
      const getMessage = (key: string, subs?: string | string[]): string => {
        const entry = messages[key];
        if (!entry) return '';
        const list = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
        return entry.message.replace(/\$([A-Z_]+)\$/g, (_m, name: string) => {
          const content = (entry.placeholders?.[name] ?? entry.placeholders?.[name.toLowerCase()])?.content ?? "";
          return content.replace(/\$(\d)/g, (_n, i: string) => list[Number(i) - 1] ?? '');
        });
      };
      w.chrome = {
        storage: {
          sync: {
            get: async (key: string) => ({ [key]: store[key] }),
            set: async (items: Record<string, unknown>) => Object.assign(store, items),
          },
          onChanged: { addListener() {}, removeListener() {} },
        },
        runtime: {
          id: 'test',
          getManifest: () => ({ version: '1.0.0' }),
          sendMessage: async (message: { command?: string }) => {
            sent.push(message);
            if (opts.docsDelayMs) await new Promise((resolve) => setTimeout(resolve, opts.docsDelayMs));
            if (message.command === 'refresh') return { ok: true, count: 5, refreshed: opts.docsRefreshed ?? true };
            return { ok: true, count: 5 };
          },
          openOptionsPage: async () => {
            w.__openedOptions = true;
          },
        },
        tabs: {
          query: async () => [{ id: 7, url: opts.url, title: 'テスト' }],
          sendMessage: async () => opts.tabResponse ?? { fontSizes: null },
          onActivated: { addListener() {} },
          onUpdated: { addListener() {} },
        },
        i18n: { getMessage },
      };
    },
    { opts: options, messages: MESSAGES }
  );
  await page.goto(PANEL_URL);
  const kind = options.url.includes('/document/') ? 'docs' : 'slides';
  await expect(page.locator('body')).toHaveAttribute('data-kind', kind);
  await expect(page.locator('#modeName')).toHaveText(kind === 'docs' ? 'ドキュメント' : 'スライド');
}

const sent = (page: Page) => page.evaluate(() => (window as unknown as { __sent: { command?: string }[] }).__sent);
const commands = async (page: Page) => (await sent(page)).map((m) => m.command);
const sizeButton = (page: Page, key: 'small' | 'medium' | 'large') => page.locator(`#sizeGroup .segBtn[data-size="${key}"]`);
const styleChoice = (page: Page, value: string) => page.locator(`label.choice:has(input[value="${value}"])`);
const stored = <T>(page: Page, key: string) =>
  page.evaluate((k) => (window as unknown as { __store: { rubiSettings: Record<string, unknown> } }).__store.rubiSettings[k], key) as Promise<T>;

test.describe('開いているタブで出し分ける', () => {
  test('スライドのタブ: スライド用の部分(表示の ON/OFF・書き込み)だけを出す', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL });
    await expect(page.locator('#enabled')).toBeAttached();
    await expect(page.locator('.toggleRow')).toBeVisible();
    await expect(page.locator('#writeCurrentSlide')).toBeVisible();
    await expect(page.locator('#docsStyleGroup')).toBeHidden();
    await expect(page.locator('#docsWrite')).toBeHidden();
    await expect(page.locator('#notSupportedNotice')).toBeHidden();
    await expect(page.locator('.title')).toHaveText('ルビふりスライド');
  });

  test('ドキュメントのタブ: 見せ方と「ルビをふる」「ルビを消す」を出し、スライド用の部分は出さない', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await expect(page.locator('#docsStyleGroup .choice')).toHaveText([
      '漢字の上',
      '漢字の上（縮める）',
      '括弧書き',
      '括弧書き（小さい文字）',
      '漢字の右上',
    ]);
    await expect(page.locator('input[name="docsStyle"][value="table"]')).toBeChecked();
    await expect(page.locator('#docsWrite')).toHaveText('ルビをふる');
    await expect(page.locator('#docsDelete')).toHaveText('ルビを消す');
    await expect(page.locator('.toggleRow')).toBeHidden();
    await expect(page.locator('#writeCurrentSlide')).toBeHidden();
  });

  test('それ以外のタブ: 最後に使った画面のまま、書き込みのボタンを押せなくして案内を出す', async ({ page }) => {
    await openPanel(page, { url: 'https://example.com/' });
    await expect(page.locator('#notSupportedNotice')).toBeVisible();
    await expect(page.locator('#writeCurrentSlide')).toBeDisabled();
    await expect(page.locator('#docsWrite')).toBeHidden();
  });

  test('ドキュメントのタブの見出しには「ドキュメント」のバッジを出す(切り替えのスイッチは無い)', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await expect(page.locator('.title')).toHaveText('ルビふりドキュメント');
    await expect(page.locator('#modeSwitch')).toHaveCount(0);
  });
});

test.describe('ドキュメント', () => {
  test('見せ方で使わない設定は押せない(大きさ: 括弧書き・漢字の右上、フォント: 漢字の上以外、色: 括弧書き)', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await expect(sizeButton(page, 'small')).toBeEnabled();
    await expect(page.locator('#fontFamily')).toBeEnabled();

    await styleChoice(page, 'superscript').click();
    await expect(sizeButton(page, 'small')).toBeDisabled();
    await expect(page.locator('#docsSizeHint')).toBeVisible();
    await expect(page.locator('#fontFamily')).toBeDisabled();
    await expect(page.locator('#color')).toBeEnabled();

    await styleChoice(page, 'paren').click();
    await expect(page.locator('#color')).toBeDisabled();
    await expect(page.locator('#docsColorHint')).toBeVisible();

    await styleChoice(page, 'paren-small').click();
    await expect(sizeButton(page, 'small')).toBeEnabled();
    await expect(page.locator('#color')).toBeEnabled();
    await expect(page.locator('#fontFamily')).toBeDisabled();
  });

  test('スライドのタブでは、括弧書きを選んでいても大きさ・フォント・色を使える', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL, settings: { docsStyle: 'paren' } });
    await expect(sizeButton(page, 'small')).toBeEnabled();
    await expect(page.locator('#fontFamily')).toBeEnabled();
    await expect(page.locator('#color')).toBeEnabled();
  });

  test('設定を変えると、すぐに付け直しの指示を送る(文書・タブ・ブラウザのタブの ID 付き)', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await sizeButton(page, 'small').click();
    await expect.poll(() => commands(page)).toEqual(['refresh']);
    expect((await sent(page))[0]).toMatchObject({
      type: 'rubi-docs/command',
      command: 'refresh',
      documentId: 'abc123',
      tabId: 't.0',
      browserTabId: 7,
    });
    await expect(page.locator('#writeStatus')).toContainText('ルビを付け直しました(5 か所)');
    expect(await stored<number>(page, 'sizeRatio')).toBe(0.35);

    await sizeButton(page, 'large').click();
    await expect.poll(() => commands(page)).toEqual(['refresh', 'refresh']);
    expect(await stored<number>(page, 'sizeRatio')).toBe(0.65);
  });

  test('見せ方・省く漢字を変えると保存して付け直す。使わない設定だけの変更では付け直さない', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await styleChoice(page, 'paren').click();
    await expect.poll(() => commands(page)).toEqual(['refresh']);
    expect(await stored<string>(page, 'docsStyle')).toBe('paren');

    await page.locator('#skipKanji').selectOption('grade-3');
    await expect.poll(() => commands(page)).toEqual(['refresh', 'refresh']);
    expect(await stored<string>(page, 'skipKanji')).toBe('grade-3');

    await styleChoice(page, 'superscript').click();
    await expect.poll(() => commands(page)).toEqual(['refresh', 'refresh', 'refresh']);
    await page.locator('#color').evaluate((el: HTMLInputElement) => {
      el.value = '#d93025';
      el.dispatchEvent(new Event('change'));
    });
    await expect.poll(() => commands(page)).toEqual(['refresh', 'refresh', 'refresh', 'refresh']);
  });

  test('「ルビをふる」「ルビを消す」で指示を送り、結果を表示する', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await page.locator('#docsWrite').click();
    await expect(page.locator('#writeStatus')).toContainText('ルビをふりました(5 か所)');
    await page.locator('#docsDelete').click();
    await expect(page.locator('#writeStatus')).toContainText('ルビを消しました(5 か所)');
    expect(await commands(page)).toEqual(['write', 'delete']);
  });

  test('「選択した範囲のルビを消す」で指示を送り、結果を表示する', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await expect(page.locator('#docsDeleteSelection')).toHaveText('選択した範囲のルビを消す');
    await page.locator('#docsDeleteSelection').click();
    await expect(page.locator('#writeStatus')).toContainText('ルビを消しました(5 か所)');
    expect(await commands(page)).toEqual(['delete-selection']);
  });

  test('スライドのタブでは、設定を変えてもドキュメントの付け直しを送らない', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL });
    await page.locator('#skipKanji').selectOption('grade-2');
    await page.waitForTimeout(1200);
    expect(await commands(page)).toEqual([]);
    // 見せ方(ドキュメントの設定)はスライドで保存しても消えない
    expect(await stored<string>(page, 'docsStyle')).toBe('table');
  });
});

test('「ユーザー辞書を編集」で辞書の画面を開く', async ({ page }) => {
  await openPanel(page, { url: DOCS_URL });
  await page.locator('#openOptions').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __openedOptions?: boolean }).__openedOptions)).toBe(true);
});

test.describe('書き込み後の警告(本文が日本語を含まないフォントのとき、PDF・印刷でずれる)', () => {
  const WRITE_OK = { ok: true, command: 'write-current', writtenCount: 12 };

  test('本文が Arial などなら、書き込み後に警告を出す(フォント名入り)', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL, tabResponse: { ...WRITE_OK, latinOnlyFonts: ['Arial'] } });
    await expect(page.locator('#fontWarning')).toBeHidden();
    await page.locator('#writeCurrentSlide').click();
    await expect(page.locator('#writeStatus')).toContainText('12');
    await expect(page.locator('#fontWarning')).toBeVisible();
    await expect(page.locator('#fontWarning')).toContainText('Arial');
    await expect(page.locator('#fontWarning')).toContainText('PDF');
  });

  test('日本語のフォントなら警告を出さない', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL, tabResponse: { ...WRITE_OK, latinOnlyFonts: [] } });
    await page.locator('#writeCurrentSlide').click();
    await expect(page.locator('#writeStatus')).toContainText('12');
    await expect(page.locator('#fontWarning')).toBeHidden();
  });

  test('1件も書き込まなかったときは警告を出さない', async ({ page }) => {
    await openPanel(page, {
      url: SLIDES_URL,
      tabResponse: { ok: true, command: 'write-current', writtenCount: 0, latinOnlyFonts: ['Arial'] },
    });
    await page.locator('#writeCurrentSlide').click();
    await expect(page.locator('#writeStatus')).toBeVisible();
    await expect(page.locator('#fontWarning')).toBeHidden();
  });
});

test.describe('ルビの言語(日本語のふりがな / 中国語の拼音。スライドとドキュメントで別々に覚える)', () => {
  const rubyModeButtons = (page: Page) => page.locator('#rubyModeGroup .segBtn');

  test('スライドのタブ: 既定は日本語。中国語を選ぶと保存し、振り方・省く漢字を押せなくして、辞書の注意書きを出す', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL });
    await expect(page.locator('#rubyLanguage')).toBeVisible();
    await expect(page.locator('#rubyLanguage')).toHaveValue('ja');
    await expect(page.locator('#skipKanji')).toBeEnabled();
    await expect(page.locator('#zhDictHint')).toBeHidden();

    await page.locator('#rubyLanguage').selectOption('zh');
    await expect.poll(() => stored<string>(page, 'slidesRubyLanguage')).toBe('zh');
    await expect(page.locator('#skipKanji')).toBeDisabled();
    for (const button of await rubyModeButtons(page).all()) await expect(button).toBeDisabled();
    await expect(page.locator('#zhDictHint')).toBeVisible();
    // 大きさ・フォント・色は中国語でも使える
    await expect(sizeButton(page, 'small')).toBeEnabled();
    await expect(page.locator('#fontFamily')).toBeEnabled();

    await page.locator('#rubyLanguage').selectOption('ja');
    await expect.poll(() => stored<string>(page, 'slidesRubyLanguage')).toBe('ja');
    await expect(page.locator('#skipKanji')).toBeEnabled();
    await expect(page.locator('#zhDictHint')).toBeHidden();
  });

  test('保存済みの設定が中国語なら、パネルを開いたときから中国語の状態で表示する', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL, settings: { slidesRubyLanguage: 'zh' } });
    await expect(page.locator('#rubyLanguage')).toHaveValue('zh');
    await expect(page.locator('#skipKanji')).toBeDisabled();
  });

  test('ドキュメントのタブ: 言語を選べる。中国語を選ぶと、ドキュメントの言語だけ保存し、付け直しを送る', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL, settings: { slidesRubyLanguage: 'ja' } });
    await expect(page.locator('#rubyLanguage')).toBeVisible();
    await expect(page.locator('#rubyLanguage')).toHaveValue('ja');
    await expect(page.locator('#zhDictHint')).toBeHidden();

    await page.locator('#rubyLanguage').selectOption('zh');
    await expect.poll(() => stored<string>(page, 'docsRubyLanguage')).toBe('zh');
    expect(await stored<string>(page, 'slidesRubyLanguage')).toBe('ja'); // スライドの言語は変わらない
    await expect.poll(() => commands(page)).toEqual(['refresh']);
    // 拼音は漢字1文字に1音節・学年や JLPT は日本語用なので、振り方・省く漢字は使わない
    await expect(page.locator('#skipKanji')).toBeDisabled();
    for (const button of await rubyModeButtons(page).all()) await expect(button).toBeDisabled();
    await expect(page.locator('#zhDictHint')).toBeVisible();
    // 見せ方・大きさ・フォント・色は中国語でも使う(括弧書きでない見せ方のとき)
    await expect(page.locator('input[name="docsStyle"]').first()).toBeEnabled();
    await expect(sizeButton(page, 'small')).toBeEnabled();
  });

  test('言語はスライドとドキュメントで別々に覚える(スライドが中国語でも、ドキュメントは日本語のまま)', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL, settings: { slidesRubyLanguage: 'zh', docsRubyLanguage: 'ja' } });
    await expect(page.locator('#rubyLanguage')).toHaveValue('ja');
    await expect(page.locator('#skipKanji')).toBeEnabled();
  });

  test('保存済みのドキュメントの言語が中国語なら、パネルを開いたときから中国語の状態で表示する', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL, settings: { slidesRubyLanguage: 'ja', docsRubyLanguage: 'zh' } });
    await expect(page.locator('#rubyLanguage')).toHaveValue('zh');
    await expect(page.locator('#skipKanji')).toBeDisabled();
  });

  test('ドキュメントで付け直している間は、言語も押せない', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL, docsDelayMs: 1500 });
    await page.locator('#rubyLanguage').selectOption('zh');
    await expect(page.locator('#docsProgress')).toBeVisible();
    await expect(page.locator('#rubyLanguage')).toBeDisabled();
    await expect(page.locator('#docsProgress')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#rubyLanguage')).toBeEnabled();
  });

  test('スライドで中国語を選んでも、ドキュメントの付け直しを送らない', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL });
    await page.locator('#rubyLanguage').selectOption('zh');
    await page.waitForTimeout(1200);
    expect(await commands(page)).toEqual([]);
  });
});

test.describe('ドキュメントの付け直し中は「変換中」を出して、見た目の設定を押せなくする', () => {
  const lockedControls = (page: Page) => [
    page.locator('input[name="docsStyle"]'),
    page.locator('#rubyModeGroup .segBtn'),
    page.locator('#sizeGroup .segBtn'),
    page.locator('#fontFamily'),
    page.locator('#color'),
    page.locator('#skipKanji'),
  ];

  test('見せ方を変えると、すぐに「変換中」と経過秒数を出し、終わるまで見た目の設定を押せない。終わったら戻る', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL, docsDelayMs: 2500 });
    await expect(page.locator('#docsProgress')).toBeHidden();
    await styleChoice(page, 'paren').click();

    // 指示の答えを待っている間
    await expect(page.locator('#docsProgress')).toBeVisible();
    await expect(page.locator('#docsProgressTitle')).toContainText('変換中');
    await expect(page.locator('#docsProgress')).toContainText('数十秒かかることがあります');
    for (const control of lockedControls(page)) {
      for (const element of await control.all()) await expect(element).toBeDisabled();
    }
    await expect(page.locator('#docsProgressTitle')).toContainText('秒経過', { timeout: 4000 });
    // 押せない間に別の見せ方を押そうとしても、指示は増えない
    await styleChoice(page, 'paren-small').click({ force: true });
    expect(await commands(page)).toEqual(['refresh']);
    expect(await stored<string>(page, 'docsStyle')).toBe('paren');

    // 終わったら、表示を消して押せるようにする
    await expect(page.locator('#docsProgress')).toBeHidden({ timeout: 6000 });
    await expect(page.locator('#writeStatus')).toContainText('ルビを付け直しました');
    await expect(page.locator('input[name="docsStyle"]').first()).toBeEnabled();
    await expect(page.locator('#skipKanji')).toBeEnabled();
    // 括弧書きではフォントを使わないので、終わったあとも押せない(見せ方による「使わない設定」は元の状態に戻る)
    await expect(page.locator('#fontFamily')).toBeDisabled();
  });

  test('ルビが付いていない文書(付け直すものが無い)でも、終わったら押せるようになる', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL, docsDelayMs: 300, docsRefreshed: false });
    await styleChoice(page, 'table-compact').click();
    await expect(page.locator('#docsProgress')).toBeHidden({ timeout: 4000 });
    await expect(page.locator('#writeStatus')).toContainText('設定を保存しました');
    await expect(page.locator('input[name="docsStyle"]').first()).toBeEnabled();
    await expect(page.locator('#skipKanji')).toBeEnabled();
  });

  test('「ルビをふる」「ルビを消す」の間も「変換中」を出して、押せなくする', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL, docsDelayMs: 1500 });
    await page.locator('#docsWrite').click();
    await expect(page.locator('#docsProgress')).toBeVisible();
    await expect(page.locator('#docsProgressTitle')).toContainText('ルビをふっています');
    await expect(page.locator('#skipKanji')).toBeDisabled();
    await expect(page.locator('#docsProgress')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#skipKanji')).toBeEnabled();
  });

  test('スライドのタブでは「変換中」を出さず、設定も押せなくしない', async ({ page }) => {
    await openPanel(page, { url: SLIDES_URL, docsDelayMs: 1500 });
    await page.locator('#skipKanji').selectOption('grade-2');
    await expect(page.locator('#docsProgress')).toBeHidden();
    await expect(page.locator('#skipKanji')).toBeEnabled();
  });
});

