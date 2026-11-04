// End-to-end: sign up → draw plot → context import → agent proposal → accept → slider → export IFC.
// Usage: BASE_URL=http://localhost:5173 node e2e/full-flow.mjs   (needs API with AGENT_OFFLINE=true or a key)
import { createRequire } from 'node:module';
// CommonJS require so a globally installed playwright (NODE_PATH) also works.
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });
const step = (m) => console.log(`• ${m}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DSF ?? 1) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  step('sign up');
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('Nom').fill('Awa Diop');
  await page.getByLabel('E-mail').fill(`awa-${Date.now()}@example.com`);
  await page.getByLabel('Mot de passe').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByRole('heading', { name: 'Projets' }).waitFor();

  step('site wizard');
  await page.getByRole('link', { name: 'Nouveau projet' }).first().click();
  await page.getByLabel('Nom du projet').fill('Immeuble Plateau');
  await page.getByRole('button', { name: 'Suivant' }).click();
  const map = page.getByTestId('plot-map');
  await map.waitFor();
  await page.waitForTimeout(1500);
  const box = await map.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (const [dx, dy] of [[-40, 30], [40, 30], [40, -30], [-40, -30]]) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: 'Fermer la parcelle' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  const selects = page.locator('aside select');
  await selects.nth(2).selectOption('rear');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Zone d'urbanisme").selectOption('test-r');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Créer et importer le contexte' }).click();

  step('workspace');
  await page.getByTestId('viewport').locator('canvas').waitFor({ timeout: 30000 });
  await page.getByText('Règles de TEST').first().waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/workspace.png` });

  step('slider tweak');
  const slider = page.locator('#param-floorsA');
  await slider.fill('6');
  await page.getByText('Enregistré').waitFor({ timeout: 10000 });

  step('compliance panel');
  await page.getByRole('tab', { name: 'Conformité' }).click();
  await page.screenshot({ path: `${OUT}/compliance.png` });

  step('direct edit: add a block, then undo');
  await page.getByRole('button', { name: /Ajouter un bloc/ }).first().click();
  await page.getByText('Bloc B').first().waitFor({ timeout: 10000 });
  await page.getByText('Enregistré').waitFor({ timeout: 10000 });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(2500);

  step('agent proposal');
  await page.getByRole('tab', { name: 'Assistant' }).click();
  await page.getByRole('textbox').fill('Immeuble mixte R+4, commerces en rez-de-chaussée');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await page.getByRole('button', { name: 'Retenir' }).first().waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: 'Aperçu 3D' }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/assistant.png` });
  await page.getByRole('button', { name: 'Retenir' }).first().click();
  await page.getByRole('button', { name: /Retenue/ }).waitFor();

  step('history');
  await page.getByRole('button', { name: /Historique/ }).first().click();
  await page.getByRole('button', { name: /Restaurer/ }).first().waitFor({ timeout: 10000 });

  step('sun');
  await page.getByLabel('Soleil').check();
  await page.getByRole('button', { name: "Carte d'ensoleillement" }).click();
  await page.getByText('Ombre à midi').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/sun.png` });

  step('export IFC');
  // Capture the download URL the toast opens (the file is served as an attachment).
  await page.evaluate(() => { window.open = (u) => { window.__opened = String(u); return null; }; });
  await page.getByRole('button', { name: /Exporter/ }).click();
  await page.getByRole('menuitem', { name: /IFC4/ }).click();
  await page.getByRole('button', { name: 'Télécharger' }).waitFor({ timeout: 40000 });
  await page.getByRole('button', { name: 'Télécharger' }).click();
  const href = await page.evaluate(() => window.__opened);
  const res = await page.request.get(href);
  const text = await res.text();
  if (!text.startsWith('ISO-10303-21')) throw new Error('Export is not an IFC file');
  if (!text.includes('IFCMAPCONVERSION')) throw new Error('IFC lacks georeferencing');
  step(`IFC ok (${text.length} bytes, ${(text.match(/IFCBUILDINGSTOREY\(/g) ?? []).length} storeys)`);

  step('share link');
  await page.getByRole('button', { name: /Partager/ }).first().click();
  await page.getByRole('button', { name: /Créer et copier le lien/ }).click();
  const shareUrl = await page.locator('input[readonly]').first().inputValue();
  await page.keyboard.press('Escape');

  step('compare');
  await page.getByRole('button', { name: 'Dupliquer', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('link', { name: /Comparer/ }).click();
  await page.getByRole('heading', { name: 'Comparer les options' }).waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/compare.png` });

  step('public presentation');
  const anon = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await anon.goto(shareUrl);
  await anon.getByText('Présentation en lecture seule').waitFor({ timeout: 20000 });
  await anon.getByTestId('viewport').locator('canvas').first().waitFor({ timeout: 30000 });
  await anon.close();

  if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  console.log('E2E PASSED');
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => undefined);
  console.error('E2E FAILED:', e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
