import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { mockAniList } from './anilist-mock';

const shots = process.env.E2E_SCREENSHOTS;

async function newPerson(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
  await mockAniList(page);
  return page;
}

async function fillProfile(page: Page, name: string) {
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

async function drag(page: Page, source: Locator, target: Locator, opts: { release?: boolean; dx?: number } = {}) {
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 12, s.y + s.height / 2 + 12, { steps: 4 });
  await page.mouse.move(t.x + (opts.dx ?? 30), t.y + t.height / 2, { steps: 12 });
  if (opts.release !== false) await page.mouse.up();
}

const card = (scope: Locator, name: string) => scope.locator(`[data-card][aria-label="${name}"]`);

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

test('two colleagues build a tier list together in real time', async ({ browser }) => {
  const ana = await newPerson(browser);
  const rui = await newPerson(browser);

  // --- Ana creates a room ------------------------------------------------------------
  await ana.goto('/');
  await shot(ana, '01-home');
  await ana.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Turma ESTG');
  await ana.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(ana, 'Ana');
  await expect(ana).toHaveURL(/\/r\/[a-z0-9]{8}$/);
  await expect(ana.getByRole('heading', { name: 'Tierlist do Grupo' })).toBeVisible();
  const roomUrl = ana.url();
  const roomId = roomUrl.split('/r/')[1];

  // Opened on 127.0.0.1: the invite dialog warns that "localhost" links only work on this computer
  // and offers the local network address instead.
  await ana.getByRole('button', { name: 'Convidar', exact: true }).click();
  const share = ana.getByRole('dialog', { name: 'Convidar colegas' });
  await expect(share.getByText(/só funciona neste computador/)).toBeVisible();
  await expect(share.getByLabel('Link da sala')).toHaveValue(new RegExp(`/r/${roomId}$`));
  await shot(ana, '00-share-localhost');
  await ana.keyboard.press('Escape');

  // --- Rui opens the link ------------------------------------------------------------
  await rui.goto(roomUrl);
  await fillProfile(rui, 'Rui');
  await expect(rui.getByRole('heading', { name: 'Tierlist do Grupo' })).toBeVisible();
  await expect(rui.getByRole('button', { name: 'Turma ESTG' })).toBeVisible();
  // Both see each other online
  await expect(ana.getByTitle(/^Rui — (?!offline)/)).toBeVisible();
  await expect(rui.getByTitle(/^Ana — (?!offline)/)).toBeVisible();

  // --- Ana adds two anime through the quick search -----------------------------------
  await ana.getByRole('button', { name: 'Adicionar anime' }).click();
  const quick = ana.getByRole('dialog', { name: 'Adicionar anime' });
  await quick.getByPlaceholder(/Frieren/).fill('frieren');
  await quick.locator('[data-anime="al:154587"]').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(quick.locator('[data-anime="al:154587"]').getByText('Na sala')).toBeVisible();
  await quick.getByPlaceholder(/Frieren/).fill('death');
  await quick.locator('[data-anime="al:1535"]').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(quick.locator('[data-anime="al:1535"]').getByText('Na sala')).toBeVisible();
  await ana.keyboard.press('Escape');

  // Rui sees them appear in "Por classificar"
  const ruiPool = rui.getByTestId('pool');
  await expect(card(ruiPool, 'Sousou no Frieren')).toBeVisible();
  await expect(card(ruiPool, 'DEATH NOTE')).toBeVisible();

  // --- Rui moves the cursor and starts dragging: Ana sees it live ----------------------
  const ruiRowA = rui.locator('[data-zone="a"]');
  const box = (await ruiRowA.boundingBox())!;
  await rui.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await expect(ana.getByTestId('remote-cursor').filter({ hasText: 'Rui' })).toBeVisible();

  await drag(rui, card(ruiPool, 'DEATH NOTE'), rui.locator('[data-drop="a"]'), { release: false });
  // Ana sees who is moving the card (label on the card + drop indicator in the target tier)
  await expect(card(ana.getByTestId('pool'), 'DEATH NOTE').getByText('Rui')).toBeVisible();
  await expect(ana.locator('[data-drop="a"]').getByTestId('drop-indicator')).toBeVisible();
  await shot(ana, '02-remote-drag');
  await rui.mouse.up();
  await expect(card(ana.locator('[data-drop="a"]'), 'DEATH NOTE')).toBeVisible();

  // --- Ana drags Frieren into S -------------------------------------------------------
  await drag(ana, card(ana.getByTestId('pool'), 'Sousou no Frieren'), ana.locator('[data-drop="s"]'));
  await expect(card(rui.locator('[data-drop="s"]'), 'Sousou no Frieren')).toBeVisible();
  // ...and puts it before Death Note in A? No: reorder inside S is covered by unit tests.

  // --- Rui gives his opinion -----------------------------------------------------------
  await card(rui.locator('[data-drop="s"]'), 'Sousou no Frieren').click();
  const dialog = rui.getByRole('dialog', { name: 'Sousou no Frieren' });
  await expect(dialog.getByRole('heading', { name: 'Sousou no Frieren' })).toBeVisible();
  await dialog.getByRole('radio', { name: '9', exact: true }).click();
  await dialog.getByRole('button', { name: /Recomendo/ }).first().click();
  await dialog.getByRole('button', { name: /Já vi/ }).click();
  const opinion = dialog.getByPlaceholder(/O que achaste/);
  await opinion.fill('Obra-prima absoluta, chorei no episódio 1.');
  await expect(ana.getByText(/Rui está a escrever/).or(ana.getByTitle(/Rui — A escrever/))).toBeVisible();
  await opinion.blur();
  await expect(dialog.getByText('Guardado')).toBeVisible();
  await shot(rui, '03-review-dialog');
  await rui.keyboard.press('Escape');

  // Ana opens the same anime and reads Rui's opinion
  await card(ana.locator('[data-drop="s"]'), 'Sousou no Frieren').click();
  const anaDialog = ana.getByRole('dialog', { name: 'Sousou no Frieren' });
  await expect(anaDialog.getByText('Obra-prima absoluta, chorei no episódio 1.')).toBeVisible();
  await expect(anaDialog.getByText('9/10').first()).toBeVisible();
  // Ana moves it to A from the dialog (tier buttons)
  await anaDialog.getByRole('button', { name: 'A', exact: true }).click();
  await expect(card(rui.locator('[data-drop="a"]'), 'Sousou no Frieren')).toBeVisible();
  await ana.keyboard.press('Escape');

  // --- Chat -----------------------------------------------------------------------------
  await rui.getByLabel('Mensagem').fill('Frieren no S, obviamente!');
  await rui.getByLabel('Mensagem').press('Enter');
  await expect(ana.getByText('Frieren no S, obviamente!')).toBeVisible();

  // --- Activity feed ------------------------------------------------------------------
  await ana.getByRole('button', { name: /Atividade/ }).click();
  await expect(ana.getByText(/avaliou/).first()).toBeVisible();

  // --- Personal tier lists + average ------------------------------------------------
  await rui.getByRole('button', { name: 'A minha' }).click();
  await drag(rui, card(rui.getByTestId('pool'), 'Sousou no Frieren'), rui.locator('[data-drop="s"]'));
  await ana.getByRole('button', { name: 'Tierlist de Rui' }).click();
  await expect(ana.getByText(/Só leitura/)).toBeVisible();
  await expect(card(ana.locator('[data-drop="s"]'), 'Sousou no Frieren')).toBeVisible();
  await ana.getByRole('button', { name: 'Média' }).click();
  await expect(card(ana.locator('[data-drop="s"]'), 'Sousou no Frieren')).toBeVisible();

  // --- Ranking and members --------------------------------------------------------------
  await ana.getByRole('button', { name: 'Ranking' }).click();
  await expect(ana.getByText('Recomendados para ti')).toBeVisible();
  await shot(ana, '04-ranking');
  await ana.getByRole('button', { name: 'Membros' }).click();
  await expect(ana.getByText('Afinidade contigo')).toBeVisible();
  await shot(ana, '05-members');

  // --- Explore ------------------------------------------------------------------------------
  await ana.getByRole('button', { name: 'Explorar' }).click();
  await expect(ana.getByText('Cowboy Bebop').first()).toBeVisible();
  await shot(ana, '06-explore');

  // Back to the group tier list for a final picture
  await ana.getByRole('button', { name: 'Tierlist' }).click();
  await ana.getByRole('button', { name: 'Grupo' }).click();
  await shot(ana, '07-tierlist');

  // --- Tiers can be renamed by anyone, live ---------------------------------------------
  await ana.getByRole('button', { name: /Tiers/ }).click();
  const tierDialog = ana.getByRole('dialog', { name: 'Editar tiers' });
  await tierDialog.getByLabel('Nome do tier').first().fill('GOAT');
  await tierDialog.getByRole('button', { name: 'Guardar tiers' }).click();
  await expect(rui.locator('[data-zone="s"]').getByText('GOAT', { exact: true })).toBeVisible();

  // --- Export as PNG ------------------------------------------------------------------------
  const download = ana.waitForEvent('download', { timeout: 30_000 });
  await ana.getByRole('button', { name: /Imagem/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('tierlist-do-grupo.png');
  if (shots) await file.saveAs(`${shots}/10-export.png`);

  // --- Everything survives a reload ---------------------------------------------------------
  await rui.reload();
  await expect(card(rui.locator('[data-drop="a"]'), 'Sousou no Frieren')).toBeVisible();
});

test('mobile layout works', async ({ browser }) => {
  const page = await newPerson(browser, { width: 390, height: 844 });
  await page.goto('/');
  await page.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Telemóvel');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(page, 'Eva');
  await expect(page.getByRole('heading', { name: 'Tierlist do Grupo' })).toBeVisible();
  await shot(page, '08-mobile-tierlist');
  await page.getByRole('navigation').getByRole('button', { name: 'Chat' }).click();
  await page.getByLabel('Mensagem').fill('olá do telemóvel');
  await page.getByLabel('Mensagem').press('Enter');
  await expect(page.getByText('olá do telemóvel')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Explorar' }).click();
  await expect(page.getByText('Cowboy Bebop').first()).toBeVisible();
  await shot(page, '09-mobile-explore');
});

test('drag with a finger on a phone (long press) and tap to open', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await mockAniList(page);
  await page.goto('/');
  await page.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Toque');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(page, 'Eva');
  await page.getByRole('button', { name: 'Adicionar anime' }).click();
  await page.locator('[data-anime="al:154587"]').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.keyboard.press('Escape');

  const source = card(page.getByTestId('pool'), 'Sousou no Frieren');
  await expect(source).toBeVisible();
  const s = (await source.boundingBox())!;
  const t = (await page.locator('[data-drop="b"]').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const [sx, sy, tx, ty] = [s.x + s.width / 2, s.y + s.height / 2, t.x + 30, t.y + t.height / 2];
  await touch('touchStart', sx, sy);
  await page.waitForTimeout(350); // long press
  for (let i = 1; i <= 15; i++) await touch('touchMove', sx + ((tx - sx) * i) / 15, sy + ((ty - sy) * i) / 15);
  await touch('touchEnd', tx, ty);
  const placed = card(page.locator('[data-drop="b"]'), 'Sousou no Frieren');
  await expect(placed).toBeVisible();

  await placed.tap();
  await expect(page.getByRole('dialog', { name: 'Sousou no Frieren' })).toBeVisible();
});
