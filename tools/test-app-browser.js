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
    // frecce ← e →: con un secondo bambino (solo in memoria) si passa dall'uno all'altro e si torna indietro
    await p.evaluate(() => { state.patients.push({ id: 'prova-zeta', name: 'Zeta', history: [] }); TiceHome.ridisegna(); }); await attesa(300);
    const nomeGrafici = () => p.evaluate(() => ((document.querySelector('.grafici-bimbo.qui') || {}).lastElementChild || {}).textContent || '');
    const n0 = (await nomeGrafici()).trim();
    await p.keyboard.press('ArrowRight'); await attesa(300);
    const n1 = (await nomeGrafici()).trim();
    await p.keyboard.press('ArrowLeft'); await attesa(300);
    ok(n0 === 'Prova B.' && n1 === 'Zeta' && (await nomeGrafici()).trim() === 'Prova B.' && /1 di 2/.test(await p.locator('.grafici-n').innerText()), 'grafici: le frecce ←/→ passano al bambino dopo e prima');
    await p.click('[data-a="grafici-passa"][data-d="1"]'); await attesa(300);
    ok((await nomeGrafici()).trim() === 'Zeta', 'grafici: il tasto «bambino successivo»');
    await p.evaluate(() => { const i = state.patients.findIndex((x) => x.id === 'prova-zeta'); if (i >= 0) state.patients.splice(i, 1); TiceHome.attuale(); });
    await p.evaluate(() => { TiceHome.strumenti.T.pid = state.patients.find((x) => x.name === 'Prova B.').id; });
    // schermate spostate dal nucleo: «Andamento» di un comportamento, «Dati fuori dal programma», «Categorie e modalità»
    await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); l.history.push({ id: 'fuori-1', mode: 'quaderno', setName: 'Vecchia attività', date: new Date().toISOString(), correct: 3, total: 4, wrong: 1 }); TiceHome.vai('programma', l.id); }); await attesa(500);
    await p.click('[data-a="comp-andamento"]'); await attesa(400);
    ok(/Colpire/.test(await p.locator('.tice-foglio').innerText()) && await p.locator('.tice-foglio .comp-grafico-box').count() === 1, 'programma: il foglio «Andamento» del comportamento');
    await p.keyboard.press('Escape'); await attesa(300);
    ok(/Dati fuori dal programma/i.test(await p.locator('.tice-main').innerText()), 'programma: la sezione «Dati fuori dal programma»');
    await p.click('[data-a="sistema-fuori"]'); await attesa(400);
    ok(/Correggi i dati/.test(await p.locator('.tice-foglio').innerText()), 'programma: «Correggi i dati» si apre dai dati fuori');
    await p.keyboard.press('Escape'); await attesa(300);
    await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); l.history = l.history.filter((x) => x.id !== 'fuori-1'); TiceHome.vai('bambini'); }); await attesa(400);
    await p.click('.tice-barra [data-a="menu"]'); await attesa(300); await p.click('.tice-foglio [data-foglio="modalita"]'); await attesa(400);
    ok(/Categorie e modalità/.test(await p.locator('.tice-foglio').innerText()), 'menu: il foglio «Categorie e modalità»');
    await p.keyboard.press('Escape'); await attesa(300);
    // import dei quaderni Numbers (js/tice-home-import.js): la schermata, il campo file, un file non valido
    await p.evaluate(() => TiceHome.vai('import')); await attesa(400);
    ok(/Importa quaderni Numbers/.test(await p.locator('.tice-barra').innerText()) && await p.locator('[data-cambio="file-numbers"]').count() === 1, 'import: la schermata con la scelta dei file');
    await p.evaluate(() => { TiceHome.strumenti.T.importazioni.push({ file: 'prova.txt', errore: 'Non è un file .numbers.' }); TiceHome.ridisegna(); }); await attesa(300);
    ok(/prova\.txt/.test(await p.locator('.tice-main').innerText()), 'import: un file non valido compare con il suo errore');
    await p.evaluate(() => { TiceHome.strumenti.T.importazioni.length = 0; TiceHome.vai('bambini'); }); await attesa(400);
    // riordino delle modalità (js/tice-home-classifica.js): dal programma, la schermata «Modalità» con le sue tendine
    await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); l.programma.attivita.forEach((x) => { delete x.modalita; }); TiceHome.vai('programma', l.id); }); await attesa(400);
    await p.click('[data-a="classifica"]'); await attesa(400);
    ok(await p.evaluate(() => TiceHome.attuale().vista) === 'classifica' && await p.locator('[data-cambio="mod-scelta"]').count() >= 1 && await p.locator('[data-a="salva-classifica"]').count() === 1, 'programma: «riordina» apre la schermata Modalità con le scelte');
    // modulo dell'attività e dei target (js/tice-home-modulo-attivita.js): «Modifica attività» salvata senza cambiare nulla, e un target a mano
    await p.evaluate(() => { TiceHome.vai('programma', state.patients.find((x) => x.name === 'Prova B.').id); }); await attesa(400);
    const fotoAtt = () => p.evaluate((id) => { const a = JSON.parse(JSON.stringify(state.patients.find((x) => x.name === 'Prova B.').programma.attivita.find((y) => y.id === id))); delete a.modificato; return JSON.stringify(a); }, att.id);
    const prima = await fotoAtt();
    await p.click(`[data-a="mod-att"][data-id="${att.id}"]`); await attesa(400);
    ok(/Problem solving/.test(await p.locator('.tice-foglio').innerText()), 'modulo attività: «Modifica attività» si apre con i dati');
    await salvaFoglio();
    ok(await fotoAtt() === prima, 'modulo attività: salvando senza cambiare nulla i dati restano identici');
    await p.click(`[data-a="nuovo-target"][data-id="${att.id}"]`); await attesa(400);
    await p.fill('.tice-foglio [name=t]', 'Tavolo\nSedia'); await salvaFoglio();
    ok(await p.evaluate((id) => state.patients.find((x) => x.name === 'Prova B.').programma.attivita.find((y) => y.id === id).target.slice(-2).map((t) => t.testo).join(), att.id) === 'Tavolo,Sedia', 'modulo target: due target scritti a mano si aggiungono all\'attività');
    await p.locator(`[data-a="menu-target"][data-id="${att.id}"]`).last().click(); await attesa(400);
    ok(/Sedia/.test(await p.locator('.tice-foglio').innerText()) && await p.locator('.tice-foglio [data-foglio="passi"]').count() === 1, 'programma: il menu di un target si apre con le sue voci');
    await p.keyboard.press('Escape'); await attesa(300);
    await p.evaluate(() => { TiceHome.vai('bambini'); }); await attesa(400);
    await p.evaluate(() => TiceHome.vai('grafici')); await attesa(500);
    await p.click('.tice-barra [data-a="apri-cartella"]'); await attesa(800);
    ok(await p.evaluate(() => TiceHome.attuale().vista) === 'cartella', 'la cartella nuova si apre dal tasto «Cartella»');
    ok(/Svolta da\s*Prova/.test(await p.locator('.cr-giorno').first().innerText()), 'cartella, Giornate: compare chi ha svolto la seduta («Prova»)');
    ok(!/Colpire/.test(await p.locator('.cr-corpo').innerText()), 'cartella, Giornate: i comportamenti non sono fra le sedute');
    ok(/Prova/.test(await p.locator('.cr-riep').innerText()) && /1\s*giornat/.test(await p.locator('.cr-riep-riga').first().innerText()), 'cartella, Giornate: il riepilogo per persona (giornate e sedute di «Prova»)');
    await p.click('.cr-riep-riga'); await attesa(300);
    ok(await p.locator('.cr-riep-riga.on').count() === 1, 'cartella, Giornate: toccando una persona si applica il filtro «Chi»');
    await p.click('.cr-riep-riga'); await attesa(300);
    await p.click('.cr-giorno .cr-sed'); await attesa(400);
    ok(/Data e ora/.test(await p.locator('.tice-foglio').innerText()) && /Svolta da\s*Prova/.test(await p.locator('.tice-foglio').innerText()) && /Esito/.test(await p.locator('.tice-foglio').innerText()), 'cartella: toccando una seduta si apre il foglio dei dettagli (data e ora, chi, esito)');
    await p.keyboard.press('Escape'); await attesa(300);
    ok(await p.locator('.tice-foglio').count() === 0, 'cartella: il foglio dei dettagli si chiude');
    ok(await p.locator('.cr-scelta').count() === 0, 'cartella: con un solo bambino non compare il selettore');
    const idA = await p.evaluate(() => TiceHome.attuale().pid);
    await p.evaluate(() => { state.patients.push({ id: 'p-prova-zeta', name: 'Zeta Prova', history: [], programma: { attivita: [] } }); TiceHome.ridisegna(); }); await attesa(400);
    await p.click('[data-a="cartella-tab"][data-tab="attivita"]'); await attesa(300);
    await p.click('[data-a="cartella-passa"][data-d="1"]'); await attesa(400);
    ok(await p.evaluate(() => TiceHome.attuale().pid) !== idA && /Zeta Prova/.test(await p.locator('.cr-nome-pag').innerText()), 'cartella: ›  passa al bambino successivo');
    ok(await p.locator('.cr-tab.on').getAttribute('aria-selected') === 'true' && /Attività/.test(await p.locator('.cr-tab.on').innerText()), 'cartella: la scheda scelta resta cambiando bambino');
    await p.selectOption('[data-cr-bambino]', idA); await attesa(400);
    ok(await p.evaluate(() => TiceHome.attuale().pid) === idA, 'cartella: il selettore riporta al bambino di prima');
    await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('ArrowRight'); await attesa(400);
    ok(await p.evaluate(() => TiceHome.attuale().pid) !== idA, 'cartella: la freccia → passa al bambino successivo');
    await p.evaluate(() => { const i = state.patients.findIndex((x) => x.id === 'p-prova-zeta'); state.patients.splice(i, 1); TiceHome.vai('cartella', state.patients.find((x) => x.name === 'Prova B.').id); }); await attesa(500);
    await p.click('[data-a="cartella-tab"][data-tab="giornate"]'); await attesa(300);
    await p.click('[data-a="cartella-tab"][data-tab="attivita"]'); await attesa(300);
    const attTxt = await p.locator('.cr-corpo').innerText();
    ok(/Problem solving/.test(attTxt) && !/Colpire/.test(attTxt), 'cartella, Attività: l\'attività c\'è e i comportamenti no');
    await p.click('.cr-att-testa'); await attesa(300);
    ok(/Prova/.test(await p.locator('.cr-att .cr-sedute').first().innerText()), 'cartella, Attività: aprendola si vedono le sedute con chi le ha svolte');
    await p.click('[data-a="cartella-tab"][data-tab="comportamenti"]'); await attesa(300);
    ok(/Colpire/.test(await p.locator('.cr-corpo').innerText()) && await p.locator('.cr-corpo svg').count() > 0, 'cartella, Comportamenti: il grafico di «Colpire»');
    await p.click('[data-a="cartella-vecchia"]'); await attesa(1800);
    ok(await p.evaluate(() => !!document.getElementById('report-content')), 'dal collegamento si apre ancora la cartella vecchia');
    for (const t of ['overview', 'dates', 'activities', 'viz', 'diary']) { await p.evaluate((x) => { const l = state.patients.find((y) => y.name === 'Prova B.'); switchReportTab(x, l.id); }, t); await attesa(300); }
    ok(!/Colpire/.test(await p.evaluate(() => { const l = state.patients.find((y) => y.name === 'Prova B.'); switchReportTab('activities', l.id); return document.getElementById('report-content').innerText; })), 'cartella clinica: i comportamenti non compaiono fra le attività');
    ok(errori.length === 0, 'nessun errore di pagina' + (errori.length ? ': ' + errori.join(' | ') : ''));
  } catch (e) { falliti++; console.log('  ✗ interrotta: ' + (e.message || e).split('\n')[0] + (errori.length ? ' · errori di pagina: ' + errori.join(' | ') : '')); }
  await b.close(); server.close();
  console.log(`\n${n - falliti} riuscite, ${falliti} fallite`);
  process.exit(falliti ? 1 : 0);
})();
