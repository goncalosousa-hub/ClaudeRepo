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

/** The tabs of a room or community space ("Recomendações", "Tierlist", "Procurar", "Pessoas"). */
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secções', exact: true }).getByRole('button', { name: new RegExp(`^${name}`) });

/** Rooms open on "Recomendações"; their tier list is one tab away. */
async function toTierlist(page: Page) {
  await tab(page, 'Tierlist').click();
  await expect(page.getByRole('heading', { name: 'Tierlist do Grupo', exact: true })).toBeVisible();
}

/** Opens a card's details. The board ignores a click that comes right after a drop (it is the drop's own), so retry. */
async function openCard(page: Page, target: Locator, name: string, how: 'click' | 'tap' = 'click') {
  const dialog = page.getByRole('dialog', { name });
  await expect(async () => {
    if (!(await dialog.isVisible())) await target[how]();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

test('two colleagues build a tier list together in real time', async ({ browser }) => {
  const ana = await newPerson(browser);
  const rui = await newPerson(browser);

  // --- Ana creates a room ------------------------------------------------------------
  await ana.goto('/salas');
  await shot(ana, '01-home');
  await ana.getByRole('radio', { name: /Anime/ }).click();
  await ana.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Turma ESTG');
  await ana.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(ana, 'Ana');
  await expect(ana).toHaveURL(/\/r\/[a-z0-9]{8}$/);
  await expect(ana.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();
  await toTierlist(ana);
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
  await toTierlist(rui);
  // Only the owner (Ana, who created the room) can rename it.
  await expect(rui.getByRole('banner').getByText('Turma ESTG')).toBeVisible();
  await expect(rui.getByRole('button', { name: 'Turma ESTG' })).toHaveCount(0);
  await expect(ana.getByRole('button', { name: 'Turma ESTG' })).toBeVisible();
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
  await dialog.getByRole('radio', { name: '4 estrelas' }).click();
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
  await expect(anaDialog.getByRole('img', { name: '4 de 5 estrelas' }).first()).toBeVisible();
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

  // --- Recommendations and people ---------------------------------------------------------
  await tab(ana, 'Recomendações').click();
  const frieren = ana.locator('article[data-anime="al:154587"]');
  await expect(frieren).toContainText('Obra-prima absoluta, chorei no episódio 1.');
  await expect(frieren).toContainText('👍 1 recomenda');
  await shot(ana, '04-recommendations');
  await tab(ana, 'Pessoas').click();
  await expect(ana.getByText('Afinidade contigo')).toBeVisible();
  await shot(ana, '05-members');

  // --- Explore ------------------------------------------------------------------------------
  await tab(ana, 'Procurar').click();
  await expect(ana.getByText('Cowboy Bebop').first()).toBeVisible();
  await shot(ana, '06-explore');

  // Back to the group tier list for a final picture
  await tab(ana, 'Tierlist').click();
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

  // --- Ana hands the room over to Rui: now he renames it ---------------------------------------
  await tab(ana, 'Pessoas').click();
  ana.once('dialog', (d) => void d.accept());
  await ana.getByRole('button', { name: 'Passar a sala a Rui' }).click();
  await expect(rui.getByRole('button', { name: 'Turma ESTG' })).toBeVisible();
  await expect(ana.getByRole('button', { name: 'Turma ESTG' })).toHaveCount(0);
  await expect(ana.getByText(/passou a sala a/)).toBeVisible();
  await rui.getByRole('button', { name: 'Turma ESTG' }).click();
  await rui.getByLabel('Nome da sala').fill('ESTG 2.º ano');
  await rui.getByLabel('Nome da sala').press('Enter');
  await expect(ana.getByRole('banner').getByText('ESTG 2.º ano')).toBeVisible();
});

test('mobile layout works', async ({ browser }) => {
  const page = await newPerson(browser, { width: 390, height: 844 });
  await page.goto('/salas');
  await page.getByRole('radio', { name: /Anime/ }).click();
  await page.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Telemóvel');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(page, 'Eva');
  await expect(page.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();
  await shot(page, '08-mobile-home');
  await page.getByRole('navigation').getByRole('button', { name: 'Chat' }).click();
  await page.getByLabel('Mensagem').fill('olá do telemóvel');
  await page.getByLabel('Mensagem').press('Enter');
  await expect(page.getByText('olá do telemóvel')).toBeVisible();
  await tab(page, 'Procurar').click();
  await expect(page.getByText('Cowboy Bebop').first()).toBeVisible();
  await shot(page, '09-mobile-explore');
});

test('drag with a finger on a phone (long press) and tap to open', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await mockAniList(page);
  await page.goto('/salas');
  await page.getByRole('radio', { name: /Anime/ }).click();
  await page.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Toque');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(page, 'Eva');
  await toTierlist(page);
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

  await openCard(page, placed, 'Sousou no Frieren', 'tap');
});

test('an account keeps the same profile and rooms on any link or device', async ({ browser }) => {
  // The e2e data folder is kept between runs: a new username each time.
  const username = `ana${Date.now().toString(36)}`;
  const password = 'segredo-123';

  // --- On her laptop Ana starts without an account: creates a room and rates an anime ---
  const laptop = await newPerson(browser);
  await laptop.goto('/salas');
  await laptop.getByRole('radio', { name: /Anime/ }).click();
  await laptop.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Clube de anime');
  await laptop.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(laptop, 'Ana');
  const roomUrl = laptop.url();
  // Recommending: pick the anime, and the details open to give the stars straight away.
  await laptop.getByRole('button', { name: 'Recomendar um anime' }).first().click();
  const quick = laptop.getByRole('dialog', { name: 'Recomendar um anime' });
  await quick.locator('[data-anime="al:154587"]').getByRole('button', { name: 'Escolher' }).click();
  const review = laptop.getByRole('dialog', { name: 'Sousou no Frieren' });
  await review.getByRole('radio', { name: '4 estrelas' }).click();
  await expect(review.getByRole('radio', { name: '4 estrelas' })).toHaveAttribute('aria-checked', 'true');
  await laptop.keyboard.press('Escape');

  // --- Back home, she saves that profile in an account ------------------------------------
  await laptop.goto('/salas');
  const laptopRooms = laptop.getByRole('region', { name: 'As tuas salas' });
  await laptopRooms.getByRole('button', { name: 'Criar conta' }).click();
  const create = laptop.getByRole('dialog', { name: 'Perfil' });
  await create.getByLabel('Utilizador').fill(username.toUpperCase());
  await expect(create.getByLabel('Utilizador')).toHaveValue(username);
  await create.getByLabel('Palavra-passe').fill(password);
  await shot(laptop, '11-create-account');
  await create.getByRole('button', { name: 'Criar conta e guardar' }).click();
  await expect(laptopRooms.getByText(`guardadas na conta @${username}`)).toBeVisible();
  await expect(laptopRooms.getByText('Clube de anime')).toBeVisible();

  // --- Another device (or a new tunnel link): she opens the room and signs in -------------
  const phone = await newPerson(browser);
  await phone.goto(roomUrl);
  const who = phone.getByRole('dialog', { name: 'Perfil' });
  await who.getByRole('radio', { name: 'Já tenho conta' }).click();
  await who.getByLabel('Utilizador').fill(username);
  await who.getByLabel('Palavra-passe').fill('palavra-errada');
  await who.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(who.getByRole('alert')).toHaveText('Utilizador ou palavra-passe errados.');
  await who.getByLabel('Palavra-passe').fill(password);
  await shot(phone, '12-sign-in');
  await who.getByRole('button', { name: 'Entrar', exact: true }).click();

  // Same member as on the laptop: still one member, and the stars are hers.
  await expect(phone.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();
  await expect(phone.getByText(/online · 1 membro\b/)).toBeVisible();
  await phone.locator('article[data-anime="al:154587"]').getByRole('button', { name: 'Ver opiniões' }).click();
  const phoneReview = phone.getByRole('dialog', { name: 'Sousou no Frieren' });
  await expect(phoneReview.getByRole('radio', { name: '4 estrelas' })).toHaveAttribute('aria-checked', 'true');
  await phone.keyboard.press('Escape');

  // Her rooms are listed on the home page of any device.
  await phone.goto('/salas');
  const phoneRooms = phone.getByRole('region', { name: 'As tuas salas' });
  await expect(phoneRooms.getByText(`guardadas na conta @${username}`)).toBeVisible();
  await expect(phoneRooms.getByText('Clube de anime')).toBeVisible();
  await expect(phone.getByRole('button', { name: 'O teu perfil' })).toContainText(`@${username}`);
  await shot(phone, '13-account-rooms');

  // Renaming herself on the phone reaches the laptop the next time it opens the home page.
  await phone.getByRole('button', { name: 'O teu perfil' }).click();
  const edit = phone.getByRole('dialog', { name: 'Perfil' });
  await expect(edit.getByText(`@${username}`)).toBeVisible();
  await edit.getByLabel('Nome', { exact: true }).fill('Ana Sofia');
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(phone.getByRole('button', { name: 'O teu perfil' })).toContainText('Ana Sofia');
  await expect
    .poll(async () => {
      await laptop.reload();
      return laptop.getByRole('button', { name: 'O teu perfil' }).textContent();
    })
    .toContain('Ana Sofia');

  // Signing out leaves nothing of her on the phone.
  await phone.getByRole('button', { name: 'O teu perfil' }).click();
  await phone.getByRole('dialog', { name: 'Perfil' }).getByRole('button', { name: 'Terminar sessão' }).click();
  await expect(phone.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
  await expect(phone.getByRole('region', { name: 'As tuas salas' })).toHaveCount(0);
});

test('series and movies rooms use the TMDB catalogue', async ({ browser }) => {
  const ana = await newPerson(browser);
  const rui = await newPerson(browser);

  // --- A series room -------------------------------------------------------------------
  await ana.goto('/salas');
  const kinds = ana.locator('form').filter({ hasText: 'Criar uma sala' }).getByRole('radio');
  await expect(kinds).toHaveText(['🍿 Filmes e séries', '🎬 Filmes', '📺 Séries', '🎌 Anime', '📚 Livros', '🍽️ Restaurantes', '📍 Sítios']);
  await expect(kinds.first()).toHaveAttribute('aria-checked', 'true');
  await ana.getByRole('radio', { name: /Séries/ }).click();
  await ana.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Séries da turma');
  await ana.getByRole('button', { name: 'Criar', exact: true }).click();
  await fillProfile(ana, 'Ana');
  await toTierlist(ana);
  await expect(ana.getByText('📺 Séries')).toBeVisible();
  const seriesUrl = ana.url();

  await ana.getByRole('button', { name: 'Adicionar série' }).click();
  const quick = ana.getByRole('dialog', { name: 'Adicionar série' });
  await expect(quick.locator('[data-anime="tv:1399"]')).toContainText('A Guerra dos Tronos');
  // No Portuguese title on TMDB: the English one instead of the Korean original.
  await expect(quick.locator('[data-anime="tv:93405"]')).toContainText('Squid Game');
  await quick.getByPlaceholder(/Breaking Bad/).fill('breaking');
  await quick.locator('[data-anime="tv:1396"]').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(quick.locator('[data-anime="tv:1396"]').getByText('Na sala')).toBeVisible();
  await ana.keyboard.press('Escape');

  // Rui joins and ranks it: Ana sees it live.
  await rui.goto(seriesUrl);
  await fillProfile(rui, 'Rui');
  await toTierlist(rui);
  const ruiPool = rui.getByTestId('pool');
  await expect(card(ruiPool, 'Breaking Bad')).toBeVisible();
  await drag(rui, card(ruiPool, 'Breaking Bad'), rui.locator('[data-drop="s"]'));
  await expect(card(ana.locator('[data-drop="s"]'), 'Breaking Bad')).toBeVisible();

  await card(ana.locator('[data-drop="s"]'), 'Breaking Bad').click();
  const details = ana.getByRole('dialog', { name: 'Breaking Bad' });
  await expect(details.getByText('5 temporadas')).toBeVisible();
  await expect(details.getByText('AMC', { exact: true })).toBeVisible();
  await expect(details.getByText('Criada por Vince Gilligan')).toBeVisible();
  await expect(details.getByText('★ 89% no TMDB')).toBeVisible();
  await details.getByRole('radio', { name: '5 estrelas' }).click();
  await shot(ana, '14-series-details');
  await ana.keyboard.press('Escape');

  // Explore with the series filters.
  await tab(ana, 'Procurar').click();
  await expect(ana.getByPlaceholder('Pesquisar em todas as séries…')).toBeVisible();
  await expect(ana.locator('[data-anime="tv:66732"]')).toBeVisible();
  await ana.getByLabel('Género').selectOption({ label: 'Comédia' });
  await expect(ana.locator('[data-anime="tv:2316"]')).toBeVisible();
  await expect(ana.locator('[data-anime="tv:66732"]')).toHaveCount(0);
  await ana.getByRole('button', { name: '📡 Em exibição' }).click();
  await expect(ana.locator('[data-anime="tv:70523"]')).toBeVisible();
  await expect(ana.locator('[data-anime="tv:2316"]')).toHaveCount(0);
  await shot(ana, '15-series-explore');

  // Ana owns the room: she makes it a room for everything, and Rui gets films and anime too, live.
  await tab(rui, 'Procurar').click();
  await expect(rui.getByText('📺 Esta sala é só de séries.')).toBeVisible();
  await expect(rui.getByRole('button', { name: 'Mudar o tipo da sala' })).toHaveCount(0);
  await ana.getByRole('button', { name: 'Mudar o tipo da sala' }).click();
  const kindDialog = ana.getByRole('dialog', { name: 'Tipo da sala' });
  // Films only would leave Breaking Bad out.
  await expect(kindDialog.getByRole('radio', { name: 'Filmes', exact: true })).toBeDisabled();
  // …and so would anime, books, restaurants or places.
  await expect(kindDialog.getByText('Não dá enquanto a sala tiver 1 série.')).toHaveCount(5);
  await shot(ana, '15b-room-kind');
  await kindDialog.getByRole('radio', { name: 'Filmes e séries', exact: true }).click();
  await expect(kindDialog).toBeHidden();
  await expect(rui.getByRole('banner').getByText('🍿 Filmes e séries')).toBeVisible();
  await expect(rui.getByText('📺 Esta sala é só de séries.')).toHaveCount(0);
  await expect(rui.getByRole('main').getByRole('radio')).toHaveText([/Filmes/, /Séries/, /Anime/]);
  await rui.getByRole('main').getByRole('radio', { name: /Anime/ }).click();
  await expect(rui.getByText('Cowboy Bebop').first()).toBeVisible();

  // --- A room with everything: anime and movies side by side ------------------------------
  await ana.goto('/salas');
  await ana.getByRole('radio', { name: '🍿 Filmes e séries' }).click();
  await ana.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill('Tudo junto');
  await ana.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(ana.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();
  await tab(ana, 'Procurar').click();
  // Films, series and anime, in that order: films first.
  await expect(ana.getByRole('radio', { name: /Filmes/ })).toHaveAttribute('aria-checked', 'true');
  await ana.getByRole('button', { name: '🍿 Nos cinemas' }).click();
  await ana.locator('[data-anime="mv:872585"]').getByRole('button', { name: 'Adicionar à sala' }).click();
  await ana.getByRole('radio', { name: /Anime/ }).click();
  await ana.locator('[data-anime="al:154587"]').getByRole('button', { name: 'Adicionar à sala' }).click();
  await tab(ana, 'Tierlist').click();
  const pool = ana.getByTestId('pool');
  await expect(card(pool, 'Oppenheimer')).toBeVisible();
  await expect(card(pool, 'Sousou no Frieren')).toBeVisible();

  await card(pool, 'Oppenheimer').click();
  const movie = ana.getByRole('dialog', { name: 'Oppenheimer' });
  await expect(movie.getByText('2 h 49 min')).toBeVisible();
  await expect(movie.getByText('Realização: Christopher Nolan')).toBeVisible();
  await shot(ana, '16-movie-details');
});

test('colleagues find the open rooms on the Salas page', async ({ browser }) => {
  // The e2e data folder is kept between runs: a new room name each time.
  const name = `Filmes da equipa ${Date.now().toString(36)}`;
  const ana = await newPerson(browser);
  await ana.goto('/salas');
  await ana.getByPlaceholder('Nome da sala (ex.: Turma ESTG)').fill(name);
  await expect(ana.getByLabel(/Mostrar nas salas abertas/)).toBeChecked();
  await ana.getByRole('button', { name: 'Criar', exact: true }).click();
  await ana.getByLabel('Nome', { exact: true }).fill('Ana');
  await ana.getByLabel(/Empresa ou unidade/).fill('Lusiaves, Marinha das Ondas');
  await ana.getByRole('button', { name: 'Continuar' }).click();
  await expect(ana.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();
  await expect(ana.getByText('🔓 Aberta')).toBeVisible();

  // Rui has no link: he finds the room on the home page and sees Ana is there.
  const rui = await newPerson(browser);
  await rui.goto('/salas');
  const entry = rui.getByRole('region', { name: 'Salas abertas' }).getByRole('button', { name: new RegExp(name) });
  await expect(entry).toContainText('1 online');
  await shot(rui, '17-community-rooms');
  await entry.click();
  await rui.getByLabel('Nome', { exact: true }).fill('Rui');
  await rui.getByRole('button', { name: 'Continuar' }).click();
  await expect(rui.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();

  // Where each colleague works.
  await tab(rui, 'Pessoas').click();
  await expect(rui.getByText('🏢 Lusiaves, Marinha das Ondas')).toBeVisible();

  // Only the owner decides: Ana takes the room out of the community rooms.
  await rui.getByRole('button', { name: 'Convidar', exact: true }).click();
  await expect(rui.getByText('Esta sala aparece nas salas abertas.')).toBeVisible();
  await rui.keyboard.press('Escape');
  await ana.getByRole('button', { name: 'Convidar', exact: true }).click();
  await ana.getByLabel(/Mostrar nas salas abertas/).uncheck();
  await ana.keyboard.press('Escape');
  await expect(rui.getByText('🔓 Aberta')).toHaveCount(0);
  await rui.goto('/salas');
  await expect(rui.getByRole('region', { name: 'Salas abertas' })).toBeVisible();
  await expect(rui.getByRole('region', { name: 'Salas abertas' }).getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
});

test('everyone shares recommendations in the community space, without rooms or tier lists', async ({ browser }) => {
  const ana = await newPerson(browser);
  const rui = await newPerson(browser);

  // The site opens in the community space: pick a name and you are in.
  await ana.goto('/');
  await expect(ana.getByText(/Na Comunidade Lusiaves partilhas/)).toBeVisible();
  await fillProfile(ana, 'Ana');
  // Recommendations only: nothing to drag, no tier list, no tiers to edit, no renaming.
  await expect(ana.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();
  await expect(ana.getByRole('navigation', { name: 'Secções', exact: true }).getByRole('button')).toHaveText([
    /Recomendações/,
    /Procurar/,
    /Pessoas/,
  ]);
  await expect(ana.getByText('Ainda não há recomendações na comunidade')).toBeVisible();
  await expect(ana.getByRole('button', { name: /Tiers/ })).toHaveCount(0);
  await expect(ana.getByRole('button', { name: 'Comunidade Lusiaves' })).toHaveCount(0);

  // Ana recommends a title: she picks it and gives her opinion straight away.
  await ana.getByRole('button', { name: 'Recomendar um filme, série ou anime' }).first().click();
  const quick = ana.getByRole('dialog', { name: 'Recomendar um filme, série ou anime' });
  await expect(quick.getByRole('radio')).toHaveText([/Filmes/, /Séries/, /Anime/]);
  await expect(quick.locator('[data-anime="mv:872585"]')).toBeVisible();
  await quick.getByRole('radio', { name: /Anime/ }).click();
  await quick.locator('[data-anime="al:154587"]').getByRole('button', { name: 'Escolher' }).click();
  const review = ana.getByRole('dialog', { name: 'Sousou no Frieren' });
  await expect(review.getByRole('heading', { name: 'A tua opinião' })).toBeVisible();
  // No tier list in the community.
  await expect(review.getByText('Onde está nas tierlists')).toHaveCount(0);
  await review.getByRole('radio', { name: '5 estrelas' }).click();
  await review.getByRole('button', { name: /Recomendo/ }).first().click();
  await review.getByPlaceholder(/O que achaste/).fill('Obrigatório para toda a gente!');
  await review.getByPlaceholder(/O que achaste/).blur();
  await expect(review.getByText('Guardado')).toBeVisible();
  await ana.keyboard.press('Escape');
  const anaCard = ana.locator('article[data-anime="al:154587"]');
  await expect(anaCard).toContainText('«Obrigatório para toda a gente!» — Tu');
  await expect(anaCard.getByRole('img', { name: '5 de 5 estrelas' }).first()).toBeVisible();

  // Rui arrives: Ana's recommendation is there, and he adds his stars.
  await rui.goto('/');
  await fillProfile(rui, 'Rui');
  const ruiCard = rui.locator('article[data-anime="al:154587"]');
  await expect(ruiCard).toContainText('👍 1 recomenda');
  await expect(ruiCard).toContainText('— Ana');
  await shot(rui, '18-community');
  await ruiCard.getByRole('button', { name: 'Dar a minha opinião' }).click();
  const ruiReview = rui.getByRole('dialog', { name: 'Sousou no Frieren' });
  await expect(ruiReview.getByText('Obrigatório para toda a gente!')).toBeVisible();
  await ruiReview.getByRole('radio', { name: '4 estrelas' }).click();
  await rui.keyboard.press('Escape');
  // Ana sees the average of both, live.
  await expect(anaCard.getByRole('img', { name: '4,5 de 5 estrelas' })).toBeVisible();
  await expect(anaCard).toContainText('2 opiniões');
  await ana.getByRole('radio', { name: 'Mais estrelas' }).click();
  await expect(anaCard).toBeVisible();

  // Rooms are still there, one click away.
  await rui.getByRole('button', { name: 'Salas' }).click();
  await expect(rui).toHaveURL(/\/salas$/);
  await expect(rui.getByRole('heading', { name: 'Salas', exact: true })).toBeVisible();
});

test('books, restaurants and places have their own spaces, with photos', async ({ browser }) => {
  const ana = await newPerson(browser);
  const rui = await newPerson(browser);

  // --- Books -------------------------------------------------------------------------------
  await ana.goto('/');
  await fillProfile(ana, 'Ana');
  const sections = ana.getByRole('navigation', { name: 'Secções da comunidade' }).getByRole('button');
  await expect(sections).toHaveText(['🍿 Filmes e séries', '📚 Livros', '🍽️ Restaurantes', '📍 Sítios']);
  await sections.filter({ hasText: 'Livros' }).click();
  await expect(ana).toHaveURL(/\/livros$/);
  await expect(ana.getByRole('heading', { name: 'Recomendações', exact: true })).toBeVisible();
  await ana.getByRole('button', { name: 'Recomendar um livro' }).first().click();
  const books = ana.getByRole('dialog', { name: 'Recomendar um livro' });
  await books.getByPlaceholder(/Os Maias/).fill('saramago');
  await books.locator('[data-anime="bk:1002"]').getByRole('button', { name: 'Escolher' }).click();
  await expect(ana.getByRole('dialog', { name: 'Ensaio sobre a Cegueira' }).getByRole('button', { name: /Já li/ })).toBeVisible();
  await ana.keyboard.press('Escape');
  await expect(ana.locator('article[data-anime="bk:1002"]')).toContainText('José Saramago');
  await tab(ana, 'Procurar').click();
  await ana.getByRole('button', { name: '🇵🇹 Em português' }).click();
  await expect(ana.locator('[data-anime="bk:1001"]')).toContainText('Eça de Queirós');
  await expect(ana.locator('[data-anime="bk:1003"]')).toHaveCount(0);
  await ana.locator('[data-anime="bk:1001"]').getByRole('button', { name: 'Ver Os Maias' }).click();
  const maias = ana.getByRole('dialog', { name: 'Os Maias' });
  await expect(maias.getByText('716 páginas')).toBeVisible();
  await expect(maias.getByText('A história de três gerações da família Maia.')).toBeVisible();
  await ana.keyboard.press('Escape');

  // --- Restaurants: from the map, and by hand with a photo ------------------------------------
  await sections.filter({ hasText: 'Restaurantes' }).click();
  await expect(ana).toHaveURL(/\/restaurantes$/);
  await tab(ana, 'Recomendações').click();
  const recommend = ana.getByRole('button', { name: 'Recomendar um restaurante' }).first();
  await recommend.click();
  const quick = ana.getByRole('dialog', { name: 'Recomendar um restaurante' });
  await quick.getByPlaceholder(/Tasca do Zé/).fill('leiria');
  await expect(quick.locator('[data-anime="rs:n1234567890"]')).toContainText('Restaurante · Leiria');
  await quick.locator('[data-anime="rs:n1234567890"]').getByRole('button', { name: 'Escolher' }).click();
  await expect(ana.getByRole('dialog', { name: 'Tasca do Zé' })).toBeVisible();
  await ana.keyboard.press('Escape');
  await recommend.click();
  await quick.getByPlaceholder(/Tasca do Zé/).fill('Cantinho da Avó');
  await quick.getByRole('button', { name: 'Adicionar à mão' }).click();
  const byHand = ana.getByRole('dialog', { name: 'Adicionar restaurante', exact: true });
  await expect(byHand.getByLabel('Nome')).toHaveValue('Cantinho da Avó');
  await byHand.getByLabel('Localidade').fill('Marinha Grande');
  await byHand.getByRole('button', { name: 'Adicionar', exact: true }).click();

  // The details open: Ana adds a photo (made in the browser, as a phone camera would).
  const cantinho = ana.getByRole('dialog', { name: 'Cantinho da Avó' });
  await expect(cantinho.getByText('Marinha Grande')).toBeVisible();
  const jpeg = await ana.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1200;
    const x = c.getContext('2d')!;
    x.fillStyle = '#e67e22';
    x.fillRect(0, 0, 1600, 1200);
    x.fillStyle = '#ffffff';
    x.fillRect(400, 300, 800, 600);
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  await cantinho.locator('input[type=file]').setInputFiles({ name: 'almoco.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  await expect(cantinho.getByRole('heading', { name: /Fotos/ })).toContainText('(1)');
  await cantinho.getByRole('button', { name: /Quero ir/ }).click();
  await shot(ana, '19-restaurant-photo');
  await ana.keyboard.press('Escape');
  // The photo is the card's cover.
  const card1 = ana.locator('article').filter({ hasText: 'Cantinho da Avó' });
  await expect(card1.locator('img').first()).toHaveAttribute('src', /\/api\/photos\/[\w-]{21}\/thumb$/);

  // --- Rui sees it all, live ---------------------------------------------------------------
  await rui.goto('/restaurantes');
  await fillProfile(rui, 'Rui');
  await expect(rui.locator('article').filter({ hasText: 'Tasca do Zé' })).toBeVisible();
  await rui.locator('article').filter({ hasText: 'Cantinho da Avó' }).getByRole('button', { name: 'Dar a minha opinião' }).click();
  const cantinhoRui = rui.getByRole('dialog', { name: 'Cantinho da Avó' });
  await expect(cantinhoRui.getByText('📌 Quero ir')).toBeVisible();
  await cantinhoRui.getByRole('button', { name: 'Foto de Ana' }).click();
  const lightbox = rui.getByRole('dialog', { name: 'Foto' });
  await expect(lightbox.getByRole('img', { name: 'Foto de Ana' })).toBeVisible();
  // Only Ana (or an admin) can delete her photo.
  await expect(lightbox.getByRole('button', { name: 'Apagar' })).toHaveCount(0);
  await rui.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  await expect(cantinhoRui).toBeVisible();
  await rui.keyboard.press('Escape');

  // --- Places to visit ---------------------------------------------------------------------
  await rui.getByRole('navigation', { name: 'Secções da comunidade' }).getByRole('button', { name: /Sítios/ }).click();
  await expect(rui).toHaveURL(/\/sitios$/);
  await tab(rui, 'Procurar').click();
  await rui.getByPlaceholder(/Praia da Tocha/).fill('leiria');
  await expect(rui.locator('[data-anime="pl:r555"]')).toContainText('Castelo');
  await expect(rui.locator('[data-anime="pl:n666"]')).toHaveCount(0);
});
