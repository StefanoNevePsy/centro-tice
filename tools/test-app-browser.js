#!/usr/bin/env node
/**
 * Prova dell'app nel browser, dall'inizio alla fine, con dati inventati:
 * bambino → attività con set numerati → seduta (tastiera, comportamento, annulla) → salvataggio
 * → nota e diario → grafici → cartella clinica. Fallisce su qualunque errore di pagina.
 *
 *   node tools/test-app-browser.js        (serve Playwright; senza, la prova viene saltata)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright non installato: prova nel browser saltata.'); process.exit(0); }
const radice = path.join(__dirname, '..');
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(radice, p);
  if (!f.startsWith(radice) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': TIPI[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
let n = 0, falliti = 0;
const ok = (c, m) => { n++; if (!c) falliti++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  await new Promise((s) => server.listen(0, '127.0.0.1', s));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const opz = {};
  const pw = '/opt/pw-browsers'; // ambiente di sviluppo con un Chromium già scaricato
  if (!process.env.CI && fs.existsSync(pw)) { const c = fs.readdirSync(pw).find((x) => x.startsWith('chromium-')); if (c) opz.executablePath = `${pw}/${c}/chrome-linux/chrome`; }
  const b = await chromium.launch(opz);
  const errori = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
    await ctx.route('**/tice-config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.TICE_CONFIG={custodeUrl:'',googleClientId:''};" }));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errori.push(e.message));
    p.on('dialog', (d) => d.accept());
    const attesa = (ms) => p.waitForTimeout(ms);
    const salvaFoglio = async () => { await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(500); };
    await p.goto(url); await attesa(1500);
    await p.evaluate(() => TiceHome.vai('bambini')); await attesa(400);

    await p.click('[data-a="nuovo-bambino"]'); await attesa(300);
    await p.fill('.tice-foglio [name=nome]', 'Prova B.'); await salvaFoglio();
    ok(await p.evaluate(() => TiceHome.attuale().vista) === 'programma', 'nuovo bambino: si apre il programma');

    await p.click('[data-a="nuova-att"]'); await attesa(400);
    await p.fill('.tice-foglio [name=nome]', 'Problem solving');
    await p.click('.tice-foglio .ma-tile:has([value=timedelay])'); await p.fill('.tice-foglio [name=tdSeconds]', '2');
    ok(/T\/D 2/.test(await p.locator('[data-ma-anteprima]').innerText()), 'modulo attività: l\'anteprima segue le scelte');
    await salvaFoglio();
    const att = await p.evaluate(() => { const a = state.patients.find((x) => x.name === 'Prova B.').programma.attivita[0]; return { id: a.id, t: a.target.map((x) => x.testo), tipo: a.sessionType }; });
    ok(att.t.join() === 'Set 1,Set 2,Set 3,Set 4,Set 5' && att.tipo === 'timedelay', 'attività con set numerati da 1 a 5, in time delay');
    await p.click(`[data-a="target-numerato"][data-id="${att.id}"]`); await attesa(400);
    ok(await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').programma.attivita[0].target.length) === 6, '«+ Set 6» nel programma');

    await p.click('[data-a="comp-nuovo"]'); await attesa(300); await p.fill('.tice-foglio [name=nome]', 'Colpire'); await salvaFoglio();

    await p.click('[data-a="vai-seduta"]'); await attesa(400);
    await p.click(`.att[data-att="${att.id}"]`); await attesa(200);
    for (const k of ['1', '1', '2', 'z', '1']) { await p.keyboard.press(k); await attesa(60); }
    await p.keyboard.press('Shift+Digit1'); await p.keyboard.press('Shift+Digit1'); await attesa(100);
    await p.click('#tice-annulla'); await attesa(200);
    const bz = await p.evaluate(() => { const b = TiceHome.strumenti.T.bozza; return { seq: Object.values(b.voci)[0].sequenza, ep: Object.values(b.comp)[0].episodi.length }; });
    ok(bz.seq === 'VVV' && bz.ep === 1, 'seduta: tastiera, annulla, episodi del comportamento (' + bz.seq + ', ' + bz.ep + ')');
    await p.click('[data-a="termina"]'); await attesa(400);
    await p.fill('.tice-foglio [name=operatore]', 'Prova'); await p.fill('.tice-foglio [name=nota]', 'Nota di fine seduta.');
    await salvaFoglio(); await attesa(400);
    // il criterio non c'è ancora: eventuali fogli di proposta si chiudono
    while (await p.locator('.tice-foglio').count()) { await p.keyboard.press('Escape'); await attesa(200); }
    const st = await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); return { sed: l.history.filter((h) => h.mode !== 'comportamento').length, comp: l.history.filter((h) => h.mode === 'comportamento').map((h) => h.episodi), note: (l.diario || []).map((x) => x.tag + ':' + x.testo) }; });
    ok(st.sed === 1 && st.comp.join() === '1' && st.note.join() === 'seduta:Nota di fine seduta.', 'seduta salvata: una seduta, un episodio, la nota nel diario');

    await p.click('[data-a="nota-nuova"]'); await attesa(300);
    await p.fill('.tice-foglio [name=testo]', 'Allergia alle arachidi'); await p.click('.tice-foglio .nt-fissa'); await salvaFoglio();
    await p.click('[data-a="vai-diario"]'); await attesa(400);
    ok(await p.locator('.nt-mente .nt-voce').count() === 1 && await p.locator('.nt-giorno .nt-voce').count() === 1, 'diario: una nota da tenere a mente e una del giorno');

    await p.evaluate(() => TiceHome.vai('grafici')); await attesa(800);
    ok(await p.locator('[data-grafici] svg').count() > 0, 'grafici: il grafico del bambino si disegna');
    await p.click('.tice-barra [data-a="apri-cartella"]'); await attesa(1500);
    for (const t of ['overview', 'dates', 'activities', 'viz', 'diary']) { await p.evaluate((x) => { const l = state.patients.find((y) => y.name === 'Prova B.'); switchReportTab(x, l.id); }, t); await attesa(300); }
    ok(!/Colpire/.test(await p.evaluate(() => { const l = state.patients.find((y) => y.name === 'Prova B.'); switchReportTab('activities', l.id); return document.getElementById('report-content').innerText; })), 'cartella clinica: i comportamenti non compaiono fra le attività');
    ok(errori.length === 0, 'nessun errore di pagina' + (errori.length ? ': ' + errori.join(' | ') : ''));
  } catch (e) { falliti++; console.log('  ✗ interrotta: ' + (e.message || e).split('\n')[0] + (errori.length ? ' · errori di pagina: ' + errori.join(' | ') : '')); }
  await b.close(); server.close();
  console.log(`\n${n - falliti} riuscite, ${falliti} fallite`);
  process.exit(falliti ? 1 : 0);
})();
