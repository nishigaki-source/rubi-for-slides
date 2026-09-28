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
            if (message.command === 'refresh') return { ok: true, count: 5, refreshed: true };
            return { ok: true, count: 5 };
          },
          openOptionsPage: async () => {
            w.__openedOptions = true;
          },
        },
        tabs: {
          query: async () => [{ id: 7, url: opts.url, title: 'テスト' }],
          sendMessage: async () => ({ fontSizes: null }),
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

  test('設定を続けて変えると、少し待ってから付け直しの指示を1回だけ送る(文書・タブ・ブラウザのタブの ID 付き)', async ({ page }) => {
    await openPanel(page, { url: DOCS_URL });
    await sizeButton(page, 'small').click();
    await sizeButton(page, 'large').click();
    await sizeButton(page, 'medium').click();
    await expect.poll(() => commands(page)).toEqual(['refresh']);
    await page.waitForTimeout(1000);
    expect(await commands(page)).toEqual(['refresh']);
    expect((await sent(page))[0]).toMatchObject({
      type: 'rubi-docs/command',
      command: 'refresh',
      documentId: 'abc123',
      tabId: 't.0',
      browserTabId: 7,
    });
    await expect(page.locator('#writeStatus')).toContainText('ルビを付け直しました(5 か所)');
    expect(await stored<number>(page, 'sizeRatio')).toBe(0.5);
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
