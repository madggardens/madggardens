import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

import { createMagicLink, readCredentials, type E2ECredentials } from './support';

async function signIn(page: Page, account: E2ECredentials['owner']) {
  await page.goto(await createMagicLink(account.email));
  await expect(page).toHaveURL(/\/cuenta#?$/);
}

test('una propuesta permanece privada hasta que un administrador la publica', async ({
  browser,
}) => {
  const credentials = await readCredentials();
  const uniqueName = `Jardín E2E ${Date.now()}`;
  const editedName = `${uniqueName} editado`;
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#65a30d' },
  })
    .png()
    .toBuffer();

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, credentials.owner);
  await ownerPage.goto('/gardens/new');
  await ownerPage.getByLabel('Nombre').fill(uniqueName);
  await ownerPage.getByLabel('Descripción (opcional)').fill('Propuesta creada por la prueba E2E.');
  await ownerPage.getByLabel('Estado actual').selectOption('plantado');
  await ownerPage.locator('.leaflet-container').click();
  await ownerPage.getByLabel('Fotografías (1–5)').setInputFiles({
    name: 'garden.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await ownerPage.getByRole('button', { name: 'Enviar propuesta' }).click();
  await expect(ownerPage).toHaveURL(/\/gardens\/[0-9a-f-]+$/);
  await expect(ownerPage.getByRole('heading', { name: uniqueName })).toBeVisible();
  const gardenPath = new URL(ownerPage.url()).pathname;

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, credentials.other);
  await otherPage.goto(gardenPath);
  await expect(
    otherPage.getByRole('heading', { name: 'No se ha encontrado el jardín' }),
  ).toBeVisible();
  await otherContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, credentials.admin);
  await expect(adminPage.getByText('Administrador')).toBeVisible();
  await adminPage.goto('/admin');
  const proposal = adminPage.getByRole('listitem').filter({ hasText: uniqueName });
  await expect(proposal).toBeVisible();
  adminPage.once('dialog', (dialog) => dialog.accept());
  await proposal.getByRole('button', { name: 'Aprobar' }).click();
  await expect(proposal).toBeHidden();

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(gardenPath);
  await expect(publicPage.getByRole('heading', { name: uniqueName })).toBeVisible();
  await expect(publicPage.getByRole('img', { name: `Fotografía de ${uniqueName}` })).toBeVisible();

  await ownerPage.goto(`${gardenPath}/edit`);
  await ownerPage.getByLabel('Nombre').fill(editedName);
  await ownerPage.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`${gardenPath}$`));
  await expect(ownerPage.getByRole('heading', { name: editedName })).toBeVisible();

  await publicPage.reload();
  await expect(
    publicPage.getByRole('heading', { name: 'No se ha encontrado el jardín' }),
  ).toBeVisible();

  await adminPage.reload();
  const editedProposal = adminPage.getByRole('listitem').filter({ hasText: editedName });
  await expect(editedProposal).toBeVisible();
  adminPage.once('dialog', (dialog) => dialog.accept());
  await editedProposal.getByRole('button', { name: 'Aprobar' }).click();
  await expect(editedProposal).toBeHidden();

  await publicPage.reload();
  await expect(publicPage.getByRole('heading', { name: editedName })).toBeVisible();

  await publicPage.goto('/');
  const mapResults = publicPage.getByRole('region', { name: 'Resultados del mapa' });
  const gardenResult = mapResults.getByRole('button', { name: new RegExp(editedName) });
  await expect(gardenResult).toBeVisible();
  await gardenResult.click();
  const detailPanel = publicPage.getByRole('complementary', {
    name: 'Detalle del jardín seleccionado',
  });
  await expect(detailPanel).toBeFocused();
  await publicPage.getByRole('button', { name: 'Cerrar detalle y volver al mapa' }).click();
  await expect(publicPage.locator('.leaflet-container')).toBeFocused();

  await ownerPage.goto('/cuenta');
  ownerPage.once('dialog', (dialog) => dialog.accept('ELIMINAR'));
  await ownerPage.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(ownerPage).toHaveURL(/\/$/);
  await expect(ownerPage.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();

  await publicPage.goto(gardenPath);
  await expect(publicPage.getByRole('heading', { name: editedName })).toBeVisible();

  await Promise.all([ownerContext.close(), adminContext.close(), publicContext.close()]);
});
