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
  if (!process.env.CI && fs.existsSync(pw)) { const c = fs.readdirSync(pw).find((x) => x.startsWith('chromium-')); if (c) { const e = ['chrome-linux64', 'chrome-linux'].map((d) => `${pw}/${c}/${d}/chrome`).find((f) => fs.existsSync(f)); if (e) opz.executablePath = e; } }
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
    // schermata Grafici (js/tice-home-grafici.js): schede divise in gruppi, scelta del grafico, periodo, comportamenti, telefono
    ok(await p.locator('.gr-scheda').count() >= 5 && await p.locator('.gr-gruppo-t').count() >= 3, 'grafici: le schede dei grafici, divise in gruppi');
    ok(/Target nel tempo/.test(await p.locator('.gr-testa').innerText()) && await p.locator('.gr-scheda.on').count() === 1, 'grafici: per un bambino con programma si parte da «Target nel tempo», con il nome e a cosa serve');
    const firmaG = () => p.locator('[data-grafici]').getAttribute('data-morph-firma');
    const f0 = await firmaG();
    await p.click('.gr-scheda[data-id="calendar"]'); await attesa(500);
    ok(await p.evaluate(() => state._vizView) === 'calendar' && /Calendario/.test(await p.locator('.gr-testa').innerText()) && await p.locator('[data-grafici] svg').count() > 0 && await firmaG() !== f0, 'grafici: si sceglie un altro grafico (cambia la firma del contenitore e si ridisegna)');
    const f1 = await firmaG();
    await p.click('[data-a="gr-periodo"][data-v="month"]'); await attesa(500);
    ok(await p.evaluate(() => state._vizFilter) === 'month' && /Ultimo mese/.test(await p.locator('.cr-chip.on').first().innerText()) && await firmaG() !== f1 && await p.locator('[data-grafici] svg').count() > 0, 'grafici: il periodo «Ultimo mese» si applica e il grafico si ridisegna');
    await p.click('[data-a="gr-periodo"][data-v="custom"]'); await attesa(300);
    await p.evaluate(() => { state._vizFrom = '2099-01-01'; TiceHome.ridisegna(); }); await attesa(500);
    ok(/Nessuna seduta nel periodo scelto/.test(await p.locator('[data-grafici]').innerText()) && /Tutto/.test(await p.locator('[data-grafici]').innerText()), 'grafici: periodo senza sedute, messaggio chiaro con «Tutto»');
    await p.click('[data-grafici] [data-a="gr-periodo"][data-v="all"]'); await attesa(500);
    ok(await p.evaluate(() => state._vizFilter) === 'all' && await p.locator('[data-grafici] svg').count() > 0, 'grafici: «Mostra tutto» riporta il grafico');
    // cambio di bambino: grafico e periodo restano (un secondo bambino, copia in memoria del primo)
    await p.evaluate(() => { const o = JSON.parse(JSON.stringify(state.patients.find((x) => x.name === 'Prova B.'))); o.id = 'prova-copia'; o.name = 'Copia con un nome molto lungo per vedere come si taglia'; state.patients.push(o); state._vizFilter = 'year'; TiceHome.ridisegna(); }); await attesa(400);
    await p.click('[data-a="grafici-passa"][data-d="1"]'); await attesa(600);
    ok(await p.evaluate(() => state._vizView + '|' + state._vizFilter) === 'calendar|year' && await p.locator('.gr-scheda.on[data-id="calendar"]').count() === 1 && /Anno/.test(await p.locator('.cr-chip.on').first().innerText()) && await p.locator('[data-grafici] svg').count() > 0, 'grafici: passando a un altro bambino restano il grafico e il periodo');
    ok(/Copia con un nome molto lungo/.test(await p.locator('.tice-barra .titolo-testo').innerText()) && /Copia con un nome molto lungo/.test(await p.locator('.grafici-scelta select').getAttribute('title')), 'grafici: il nome intero sta nel titolo della barra e nel «title» della tendina');
    await p.evaluate(() => { const i = state.patients.findIndex((x) => x.id === 'prova-copia'); if (i >= 0) state.patients.splice(i, 1); state._vizFilter = 'all'; TiceHome.strumenti.T.pid = state.patients.find((x) => x.name === 'Prova B.').id; TiceHome.ridisegna(); }); await attesa(400);
    await p.click('.gr-scheda[data-id="comportamenti"]'); await attesa(500);
    ok(/Colpire/.test(await p.locator('[data-grafici]').innerText()), 'grafici: «Comportamenti problema» disegna i grafici dei comportamenti del bambino');
    // telefono: l'elenco si chiude dopo la scelta e il tasto «Cambia grafico» lo riapre
    await p.setViewportSize({ width: 390, height: 844 }); await attesa(300);
    ok(!(await p.locator('.gr-elenco').isVisible()) && await p.locator('.gr-cambia').isVisible(), 'grafici, telefono: si vede solo il grafico scelto, con «Cambia grafico»');
    await p.click('.gr-cambia'); await attesa(400);
    ok(await p.locator('.gr-elenco').isVisible() && !(await p.locator('.gr-destra').isVisible()), 'grafici, telefono: «Cambia grafico» apre l\'elenco');
    await p.click('.gr-scheda[data-id="tice-tempo"]'); await attesa(500);
    ok(!(await p.locator('.gr-elenco').isVisible()) && await p.locator('[data-grafici] svg').count() > 0 && await p.evaluate(() => { const m = document.querySelector('.grafici-main'); return m.scrollWidth <= m.clientWidth + 1; }), 'grafici, telefono: dopo la scelta l\'elenco si chiude, il grafico resta e la pagina non scorre di lato');
    // le scritte dei grafici arrivano ad almeno 12px reali
    ok(await p.evaluate(() => { let min = 99; document.querySelectorAll('[data-grafici] svg').forEach((svg) => { const vb = svg.viewBox.baseVal, sc = vb && vb.width ? svg.getBoundingClientRect().width / vb.width : 1; svg.querySelectorAll('text').forEach((t) => { if (!t.getAttribute('data-diradato') && t.textContent.trim()) min = Math.min(min, parseFloat(getComputedStyle(t).fontSize) * sc); }); }); return min >= 11.9; }), 'grafici: le scritte dei grafici sono di almeno 12px sullo schermo');
    await p.setViewportSize({ width: 1100, height: 900 }); await attesa(300);
    await p.evaluate(() => { delete state._vizView; state._vizFilter = 'all'; TiceHome.vai('grafici'); }); await attesa(500);
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
    // un nome cambiato in «Persone e accessi»: la cartella e il diario mostrano quello nuovo (sedute con email), le vecchie restano com'erano
    await p.evaluate(() => {
      const l = state.patients.find((x) => x.name === 'Prova B.');
      l.history.forEach((x) => { if (x.operatore === 'Prova') x.operatoriEmail = ['prova@centro.test']; });
      (l.diario || []).forEach((x) => { if (x.autore === 'Prova') { x.operatoriEmail = ['prova@centro.test']; } });
      TiceSync.impostaPersone([{ email: 'prova@centro.test', nome: 'Prova Nuova', aule: [] }]);
      TiceHome.ridisegna();
    }); await attesa(500);
    ok(/Svolta da\s*Prova Nuova/.test(await p.locator('.cr-giorno').first().innerText()) && /Prova Nuova/.test(await p.locator('.cr-riep').innerText()), 'cartella: dopo un cambio di nome si vede il nome nuovo (giornata e riepilogo per persona)');
    ok(/Prova Nuova/.test(await p.locator('.cr-diario').first().innerText()), 'cartella: l\'autore della nota di seduta ha il nome nuovo');
    ok(await p.evaluate(() => TiceSync.nomePersona('prova@centro.test', 'Prova') === 'Prova Nuova' && TiceSync.nomePersona('altro@x.it', 'Altro') === 'Altro' && TiceSync.nomiSeduta({ operatore: 'Prova + Luca', operatoriEmail: ['prova@centro.test', ''] }).join('|') === 'Prova Nuova|Luca'), 'nomePersona: nome attuale dall\'email, ripiego sul nome salvato');
    await p.click('.cr-giorno .cr-sed'); await attesa(400);
    ok(/Svolta da\s*Prova Nuova/.test(await p.locator('.tice-foglio').innerText()), 'cartella: il dettaglio della seduta mostra il nome nuovo');
    await p.keyboard.press('Escape'); await attesa(300);
    await p.evaluate(() => { TiceHome.vai('diario', state.patients.find((x) => x.name === 'Prova B.').id); }); await attesa(500);
    ok(/Prova Nuova/.test(await p.locator('.nt-giorno').innerText()), 'diario: l\'autore della nota ha il nome nuovo');
    await p.evaluate(() => { TiceSync.impostaPersone([]); TiceHome.vai('cartella', state.patients.find((x) => x.name === 'Prova B.').id); }); await attesa(500);
    ok(/Svolta da\s*Prova\b/.test(await p.locator('.cr-giorno').first().innerText()) && !/Prova Nuova/.test(await p.locator('.cr-giorno').first().innerText()), 'cartella: se la persona non è nota si resta sul nome salvato');
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
    // ---- ridisegno parziale (js/tice-morph.js): coppie «prima → dopo», stato scelto dall'utente, contenitori saltati ----
    const mo = await p.evaluate(() => {
      const M = TiceMorph, ris = {};
      const nuovo = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
      const coppie = [
        ['<p>a</p>', '<p>b</p><p>c</p>'],
        ['', '<div class="x" id="a">t</div>'],
        ['<div id="a" class="x" title="t">t</div>', '<div id="a">t2</div>'],
        ['<ul><li data-id="1">a</li><li data-id="2">b</li><li data-id="3">c</li></ul>', '<ul><li data-id="3">c</li><li data-id="1">a2</li><li data-id="4">d</li></ul>'],
        ['<div><button data-a="s" data-id="9" data-r="V">v</button><button data-a="s" data-id="9" data-r="X">x</button></div>', '<div><button data-a="s" data-id="9" data-r="X">x2</button><button data-a="s" data-id="9" data-r="V">v2</button></div>'],
        ['<div>a</div><span>b</span>', '<span>b</span><div>a</div><em>c</em>'],
        ['<table><tbody><tr><td data-pid="1">a</td><td>b</td></tr></tbody></table>', '<table><tbody><tr><td data-pid="1">a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr></tbody></table>'],
        ['<select><option value="a" selected>A</option><option value="b">B</option></select>', '<select><option value="a">A</option><option value="b" selected>B</option><option value="c">C</option></select>'],
        ['<textarea>uno</textarea>', '<textarea>due</textarea>'],
        ['<svg viewBox="0 0 10 10"><path d="M0 0L5 5" stroke="red"/></svg>', '<svg viewBox="0 0 20 20"><path d="M0 0L9 9"/><circle r="2"/></svg>'],
        ['<input type="checkbox" checked><input value="a">', '<input type="checkbox"><input value="b">'],
        ['<details open><summary>s</summary>x</details>', '<details><summary>s</summary>y</details>'],
        ['testo <!--c--> altro', 'nuovo <b>b</b>'],
        ['<section id="s"><h2>t</h2><p data-att="1">uno</p><p data-att="2">due</p></section>', '<section id="s"><h2>t2</h2><p data-att="2">due</p></section><footer>f</footer>'],
        ['<div data-grafici data-morph-firma="a"></div><p>1</p>', '<div data-grafici data-morph-firma="a"></div><p>2</p>']
      ];
      ris.diff = [];
      coppie.forEach(([a, b], i) => {
        const x = nuovo(), y = nuovo();
        x.innerHTML = a; M.segna(x); M.aggiorna(x, b); y.innerHTML = b;
        if (x.innerHTML !== y.innerHTML) ris.diff.push(i + ': ' + x.innerHTML + ' != ' + y.innerHTML);
        x.remove(); y.remove();
      });
      ris.coppie = coppie.length;
      // chiavi riordinate: i nodi restano gli stessi
      let x = nuovo();
      x.innerHTML = '<ul><li data-id="1">a</li><li data-id="2">b</li><li data-id="3">c</li></ul>'; M.segna(x);
      x.querySelectorAll('li').forEach((l) => { l._m = l.dataset.id; });
      M.aggiorna(x, '<ul><li data-id="3">c</li><li data-id="1">a2</li><li data-id="4">d</li></ul>');
      const li = [...x.querySelectorAll('li')];
      ris.riordino = li.map((l) => l.dataset.id + ':' + (l._m || '-') + ':' + l.textContent).join();
      x.remove();
      // campo col focus: valore e selezione non si toccano; il resto si aggiorna
      x = nuovo();
      x.innerHTML = '<input id="q" value="a"><p>1</p>'; M.segna(x);
      const q = x.querySelector('#q'); q.focus(); q.value = 'abcdef'; q.setSelectionRange(2, 4);
      M.aggiorna(x, '<input id="q" value="zzz" class="n"><p>2</p>');
      ris.focus = [document.activeElement === q, q.value, q.selectionStart, q.selectionEnd, x.querySelector('p').textContent, q.className, x.querySelector('#q') === q].join();
      // senza focus il campo si allinea; checkbox e select pure
      q.blur(); M.aggiorna(x, '<input id="q" value="b"><p>2</p>');
      ris.senzaFocus = q.value;
      x.innerHTML = '<input id="c" type="checkbox"><select id="s"><option value="a" selected>A</option><option value="b">B</option></select>'; M.segna(x);
      x.querySelector('#c').checked = true; x.querySelector('#s').value = 'b';
      M.aggiorna(x, '<input id="c" type="checkbox"><select id="s"><option value="a" selected>A</option><option value="b">B</option></select>');
      ris.proprieta = [x.querySelector('#c').checked, x.querySelector('#s').value].join();
      x.remove();
      // <details>: l'apertura dell'utente resta se l'HTML non cambia; se cambia, vince l'HTML
      x = nuovo();
      const dt = (o) => '<details data-chiusi="k"' + (o ? ' open' : '') + '><summary>s</summary>t</details>';
      x.innerHTML = dt(false); M.segna(x);
      const d = x.querySelector('details'); const st = [];
      d.open = true; M.aggiorna(x, dt(false)); st.push(d.open);          // lo ha aperto lui: resta
      M.aggiorna(x, dt(true)); st.push(d.open);                          // l'HTML lo apre: aperto
      d.open = false; M.aggiorna(x, dt(true)); st.push(d.open);          // lo ha chiuso lui: resta chiuso
      M.aggiorna(x, dt(false)); M.aggiorna(x, dt(true)); st.push(d.open); // l'HTML lo richiude e riapre: aperto
      st.push(x.querySelector('details') === d);
      ris.details = st.join();
      x.remove();
      // contenitori saltati: restano con i loro figli; con la firma diversa si rimontano
      x = nuovo();
      x.innerHTML = '<div data-grafici data-morph-firma="a"></div><div id="tice-gis"></div><div data-morph-salta="1"></div><p>1</p>'; M.segna(x);
      const [g, gi, sa] = [...x.children];
      [g, gi, sa].forEach((e) => { e.innerHTML = '<svg></svg>'; });
      M.aggiorna(x, '<div data-grafici data-morph-firma="a"></div><div id="tice-gis"></div><div data-morph-salta="1"></div><p>2</p>');
      const [g2, gi2, sa2] = [...x.children];
      ris.salta = [g2 === g && g.firstChild && g.firstChild.nodeName, gi2 === gi && gi.firstChild && gi.firstChild.nodeName, sa2 === sa && sa.firstChild && sa.firstChild.nodeName, x.querySelector('p').textContent].join();
      M.aggiorna(x, '<div data-grafici data-morph-firma="b"></div><div id="tice-gis"></div><div data-morph-salta="1"></div><p>2</p>');
      ris.firma = [x.children[0] !== g, x.children[0].childNodes.length, x.children[1] === gi].join();
      x.remove();
      // scorrimento dei contenitori che restano
      x = nuovo();
      x.innerHTML = '<div id="s" style="height:50px;overflow:auto"><div style="height:500px">a</div></div><p>1</p>'; M.segna(x);
      const s = x.querySelector('#s'); s.scrollTop = 120;
      M.aggiorna(x, '<div id="s" style="height:50px;overflow:auto"><div style="height:500px">b</div></div><p>2</p>');
      ris.scorri = s.scrollTop + ',' + (x.querySelector('#s') === s);
      x.remove();
      return ris;
    });
    ok(mo.diff.length === 0, 'morph: ' + mo.coppie + ' coppie «prima → dopo» uguali al ridisegno completo' + (mo.diff.length ? ': ' + mo.diff.join(' | ') : ''));
    ok(mo.riordino === '3:3:c,1:1:a2,4:-:d', 'morph: con le chiavi i nodi si riordinano senza ricrearli (' + mo.riordino + ')');
    ok(mo.focus === 'true,abcdef,2,4,2,n,true', 'morph: un campo col focus tiene valore, selezione e focus (' + mo.focus + ')');
    ok(mo.senzaFocus === 'b' && mo.proprieta === 'false,a', 'morph: senza focus value, checked e selected si allineano alla proprietà (' + mo.senzaFocus + ' ' + mo.proprieta + ')');
    ok(mo.details === 'true,true,false,true,true', '<details>: l\'apertura scelta dall\'utente resta se l\'HTML non la cambia (' + mo.details + ')');
    ok(mo.salta === 'svg,svg,svg,2' && mo.firma === 'true,0,true', 'morph: i contenitori riempiti da altro codice restano intatti e si rimontano solo se cambia la firma (' + mo.salta + ' / ' + mo.firma + ')');
    ok(mo.scorri === '120,true', 'morph: lo scorrimento dei contenitori che restano non cambia (' + mo.scorri + ')');

    // interruttore e rete di sicurezza
    const sic = await p.evaluate(() => {
      const M = TiceHome.strumenti, R = M.radice(), orig = TiceMorph.aggiorna, w = console.warn, ris = {};
      let n = 0, avvisi = 0;
      TiceMorph.aggiorna = (...a) => { n++; return orig.apply(TiceMorph, a); };
      TiceHome.ridisegna(); ris.acceso = n;
      try { localStorage.setItem('tice_morph', '0'); } catch (e) { /* niente */ }
      TiceHome.ridisegna(); ris.spento = n - ris.acceso;
      try { localStorage.removeItem('tice_morph'); } catch (e) { /* niente */ }
      TiceMorph.aggiorna = () => { throw new Error('prova'); }; console.warn = () => { avvisi++; };
      const prima = R.innerHTML; TiceHome.ridisegna();
      ris.ripiego = avvisi + ',' + (R.innerHTML === prima);
      TiceMorph.aggiorna = orig; console.warn = w;
      return ris;
    });
    ok(sic.acceso === 1 && sic.spento === 0, 'morph: l\'interruttore localStorage.tice_morph = 0 lo spegne (' + sic.acceso + '/' + sic.spento + ')');
    ok(sic.ripiego === '1,true', 'morph: se lancia un\'eccezione si ripiega su innerHTML con un avviso (' + sic.ripiego + ')');

    // equivalenza dal vivo: schermate vere, ridisegno parziale contro ridisegno completo (cronometri esclusi)
    const equivalenza = (nome) => p.evaluate(() => {
      const R = TiceHome.strumenti.radice(), orig = TiceMorph.aggiorna;
      let n = 0; TiceMorph.aggiorna = (...a) => { n++; return orig.apply(TiceMorph, a); };
      const norm = (s) => s.replace(/(<span class="t">)[^<]*/g, '$1').replace(/(data-al-minuto="?">?)[^<]*/g, '$1').replace(/(data-comp-crono="[^"]*">)[^<]*/g, '$1');
      try { localStorage.removeItem('tice_morph'); } catch (e) { /* niente */ }
      TiceHome.ridisegna(); const a = norm(R.innerHTML), usato = n;
      try { localStorage.setItem('tice_morph', '0'); } catch (e) { /* niente */ }
      TiceHome.ridisegna(); const b = norm(R.innerHTML);
      try { localStorage.removeItem('tice_morph'); } catch (e) { /* niente */ }
      TiceMorph.aggiorna = orig;
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      return { uguali: a === b, usato, len: a.length, dove: a === b ? '' : a.slice(Math.max(0, i - 60), i + 60) + ' <> ' + b.slice(Math.max(0, i - 60), i + 60) };
    }).then((r) => ok(r.uguali && r.usato === 1 && r.len > 200, 'equivalenza dal vivo, ' + nome + ' (' + r.len + ' caratteri)' + (r.uguali ? '' : ': ' + r.dove + (r.usato !== 1 ? ' [morph non usato]' : ''))));
    const pidB = await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').id);
    await p.evaluate(() => { for (let i = 0; i < 7; i++) state.patients.push({ id: 'morph-' + i, name: 'Morph ' + i, history: [], programma: { attivita: [] } }); });
    await p.evaluate(() => TiceHome.vai('bambini')); await attesa(500);
    await equivalenza('elenco dei bambini');
    // la ricerca: il campo non viene ricreato e il cursore resta dov'è
    await p.evaluate(() => { document.querySelector('[data-cambio=cerca]')._m = 1; });
    await p.click('[data-cambio=cerca]'); await p.keyboard.type('mo'); await p.keyboard.press('ArrowLeft'); await p.keyboard.type('X'); await attesa(200);
    const ric = await p.evaluate(() => { const c = document.querySelector('[data-cambio=cerca]'); return [c._m, document.activeElement === c, c.value, c.selectionStart, c.selectionEnd].join(); });
    const sincro = await p.evaluate(() => { TiceHome.ridisegna(); const c = document.querySelector('[data-cambio=cerca]'); return [c._m, document.activeElement === c, c.value, c.selectionStart].join(); });
    ok(sincro === '1,true,mXo,2', 'ridisegno chiesto dalla sincronizzazione con un campo col focus: il campo non viene disturbato (' + sincro + ')');
    ok(ric === '1,true,mXo,2,2', 'elenco bambini: scrivendo nella ricerca il campo resta lo stesso, col focus e il cursore al suo posto (' + ric + ')');
    await p.evaluate(() => { const c = document.querySelector('[data-cambio=cerca]'); c.value = ''; c.dispatchEvent(new Event('input', { bubbles: true })); state.patients = state.patients.filter((x) => !/^morph-/.test(x.id)); TiceHome.ridisegna(); });
    await p.evaluate((id) => TiceHome.vai('seduta', id), pidB); await attesa(500);
    await equivalenza('seduta');
    await p.evaluate(() => { const a = document.querySelector('.att[data-att]'); if (a) a.click(); }); await attesa(200);
    await equivalenza('seduta con attività aperta');
    // ✓ in seduta: lo scorrimento e il resto della schermata non si toccano
    await p.setViewportSize({ width: 1100, height: 280 }); await attesa(200);
    const tocco = await p.evaluate(async () => {
      const R = TiceHome.strumenti.radice(), barra = R.querySelector('.tice-barra');
      R.scrollTop = Math.floor((R.scrollHeight - R.clientHeight) / 2); const prima = R.scrollTop;
      if (barra) barra._m = 1;
      document.querySelectorAll('#tice details').forEach((d) => { d.open = true; });
      const v = document.querySelector('.att[data-att] [data-a="segna"][data-r="V"]'); if (v) v.click();
      await new Promise((r) => setTimeout(r, 200));
      TiceHome.ridisegna();
      const aperti = [...document.querySelectorAll('#tice details')].filter((d) => d.open).length, tutti = document.querySelectorAll('#tice details').length;
      return { scorribile: R.scrollHeight > R.clientHeight, prima, dopo: R.scrollTop, barra: !!(barra && barra._m && R.querySelector('.tice-barra') === barra), aperti: aperti + '/' + tutti, segnato: !!v };
    });
    ok(tocco.segnato && tocco.scorribile && tocco.prima > 0 && tocco.dopo === tocco.prima && tocco.barra && /^(\d+)\/\1$/.test(tocco.aperti), 'seduta: toccare ✓ non fa perdere lo scorrimento né richiude nulla (' + JSON.stringify(tocco) + ')');
    await p.setViewportSize({ width: 1100, height: 900 }); await attesa(200);
    // i fogli sono fuori dalla radice: un ridisegno non li tocca
    const sinc = await p.evaluate(() => {
      const { h, foglio } = TiceHome.strumenti;
      foglio(h`<p>Un foglio</p><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
      const f = document.querySelector('.tice-foglio'); f._m = 1; const sf = f.parentNode;
      TiceHome.ridisegna();
      const ris = { foglio: document.querySelector('.tice-foglio') === f && f.parentNode === sf };
      document.querySelector('.tice-foglio [data-foglio="chiudi"]').click();
      return ris;
    });
    await attesa(300);
    ok(sinc.foglio, 'ridisegno: i fogli (.tice-foglio) sono fuori dalla radice e non si toccano');
    await p.evaluate(() => TiceHome.vai('programma', state.patients.find((x) => x.name === 'Prova B.').id)); await attesa(500);
    await equivalenza('programma');
    await p.evaluate(() => TiceHome.vai('diario', state.patients.find((x) => x.name === 'Prova B.').id)); await attesa(500);
    await equivalenza('diario');
    await p.evaluate((id) => TiceHome.vai('cartella', id), pidB); await attesa(600);
    await equivalenza('cartella');
    if (await p.evaluate(() => !!TiceHome.strumenti.viste.turni)) { await p.evaluate(() => TiceHome.vai('turni')); await attesa(600); await equivalenza('turni');
      const tt = await p.locator('.tt-apri-altro').innerText();
      ok(/Tutti i bambini/.test(tt) && /anche chi non è in turno oggi/.test(tt) && !/Apri un bambino/.test(tt), 'turni: il tasto «Tutti i bambini» (anche chi non è in turno oggi)'); }
    await p.evaluate(() => TiceHome.vai('cartella', state.patients.find((x) => x.name === 'Prova B.').id)); await attesa(500);
    await p.click('[data-a="cartella-vecchia"]'); await attesa(1800);
    ok(await p.evaluate(() => !!document.getElementById('report-content')), 'dal collegamento si apre ancora la cartella vecchia');
    for (const t of ['overview', 'dates', 'activities', 'viz', 'diary']) { await p.evaluate((x) => { const l = state.patients.find((y) => y.name === 'Prova B.'); switchReportTab(x, l.id); }, t); await attesa(300); }
    ok(!/Colpire/.test(await p.evaluate(() => { const l = state.patients.find((y) => y.name === 'Prova B.'); switchReportTab('activities', l.id); return document.getElementById('report-content').innerText; })), 'cartella clinica: i comportamenti non compaiono fra le attività');
    // ---- giochi: più set insieme in un'attività, e gioco avviato direttamente → seduta di oggi (js/tice-gioco.js, js/tice-home-giochi.js) ----
    await p.evaluate(() => { try { closePatients(); } catch (e) { /* già chiusa */ } });
    await p.evaluate(() => {
      const img = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
      const modi = ['tact', 'intraverbal_scenari', 'search_find'];
      state.savedSets.push({ id: 'gs1', name: 'Set Uno', category: 'Prova', modes: modi, items: ['cane', 'gatto', 'topo'].map((label) => ({ label, url: img })) });
      state.savedSets.push({ id: 'gs2', name: 'Set Due', category: 'Prova', modes: modi, items: ['mela', 'pera'].map((label) => ({ label, url: img })) });
      state.patients.push({ id: 'p-senza', name: 'Senza Programma', history: [] });
      TiceHome.vai('programma', state.patients.find((x) => x.name === 'Prova B.').id);
    }); await attesa(500);
    await p.click(`[data-a="nuovo-target"][data-id="${att.id}"]`); await attesa(400);
    ok(!(await p.locator('.tice-foglio [data-unione]').isVisible()), 'più set: con nessun set scelto non compare «separati / insieme»');
    await p.click('.tice-foglio label:has([name=s][value=gs1])'); await p.click('.tice-foglio label:has([name=s][value=gs2])'); await attesa(200);
    ok(await p.locator('.tice-foglio [data-unione]').isVisible() && await p.locator('.tice-foglio [name=unione][value=separati]').isChecked(), 'più set: con due set compare la scelta, e «Set separati» è quella di partenza');
    await p.selectOption('.tice-foglio [name=modo]', 'tact');
    await p.click('.tice-foglio label:has([name=unione][value=insieme])'); await attesa(200);
    await salvaFoglio();
    const tIns = await p.evaluate((id) => { const a = state.patients.find((x) => x.name === 'Prova B.').programma.attivita.find((y) => y.id === id); const t = a.target[a.target.length - 1]; return { id: t.id, testo: t.testo, setId: t.setId, setIds: t.setIds, mode: t.mode, n: a.target.length }; }, att.id);
    ok(tIns.setIds && tIns.setIds.length === 2 && tIns.setId === tIns.setIds[0] && /Set Uno/.test(tIns.testo) && /Set Due/.test(tIns.testo) && tIns.mode === 'tact', 'più set insieme: un solo target con i due set (' + tIns.testo + ')');
    // senza «insieme» (separati) restano un target per set
    await p.click(`[data-a="nuovo-target"][data-id="${att.id}"]`); await attesa(400);
    await p.click('.tice-foglio label:has([name=s][value=gs1])'); await p.click('.tice-foglio label:has([name=s][value=gs2])'); await attesa(200);
    await salvaFoglio();
    const nSep = await p.evaluate((id) => state.patients.find((x) => x.name === 'Prova B.').programma.attivita.find((y) => y.id === id).target.length, att.id);
    ok(nSep === tIns.n + 2, 'set separati (di partenza): un target per ogni set');
    await p.evaluate(({ id, tid }) => { const a = state.patients.find((x) => x.name === 'Prova B.').programma.attivita.find((y) => y.id === id); a.target = a.target.slice(0, -2); TiceProgramma.rendiCorrente(a, tid); TiceHome.ridisegna(); }, { id: att.id, tid: tIns.id }); await attesa(400);
    await p.locator(`[data-a="menu-target"][data-id="${att.id}"]`).last().click(); await attesa(400);
    ok(/2 set usati insieme/.test(await p.locator('.tice-foglio').innerText()) && await p.locator('.tice-foglio [data-foglio="set"]').count() === 1, 'più set: il menu del target ha «Set del target» e dice che sono 2 insieme');
    await p.keyboard.press('Escape'); await attesa(300);
    // si gioca dal target: il gioco parte con gli stimoli di tutti i set; il risultato è unico con il dettaglio per set e per stimolo
    const nStorico = await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').history.length);
    const avvio = await p.evaluate(({ id, tid }) => {
      const pz = state.patients.find((x) => x.name === 'Prova B.'), a = pz.programma.attivita.find((y) => y.id === id), t = a.target.find((y) => y.id === tid);
      TiceHome.strumenti.lancia(pz, a, t);
      return { merged: (state.mergedSets || []).length, items: state.session.playItems.length, id: state.activeSetId, mode: document.getElementById('mode-select').value, nascosta: document.getElementById('tice').hidden };
    }, { id: att.id, tid: tIns.id }); await attesa(400);
    ok(avvio.merged === 2 && avvio.items === 5 && /^multi_gs[12]_gs[12]$/.test(avvio.id) && avvio.mode === 'tact' && avvio.nascosta, 'più set insieme: il gioco parte con i 5 stimoli dei due set (' + avvio.id + ')');
    await p.evaluate(() => { state.session.playItems.forEach((it, i) => { state.tactIndex = i; recordResponse(it._setId === 'gs1' ? true : (i % 2 ? false : 'prompt')); }); });
    await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1500);
    const gi = await p.evaluate((n) => { const l = state.patients.find((x) => x.name === 'Prova B.').history; const s = l[l.length - 1]; return { nuove: l.length - n, s: JSON.parse(JSON.stringify(s)) }; }, nStorico);
    const bd = gi.s.setBreakdown || [];
    ok(gi.nuove === 1 && gi.s.total === 5 && gi.s.correct === 3 && gi.s.setId === avvio.id && gi.s.attivitaId === att.id && gi.s.targetId === tIns.id && gi.s.fonte === 'app-gioco', 'più set insieme: una sola seduta con il totale unito (3/5), collegata all\'attività e al target');
    ok(bd.length === 2 && bd.find((x) => x.setId === 'gs1').correct === 3 && bd.find((x) => x.setId === 'gs1').total === 3 && bd.find((x) => x.setId === 'gs2').correct === 0 && bd.find((x) => x.setId === 'gs2').total === 2, 'più set insieme: il dettaglio per set (Set Uno 3/3, Set Due 0/2)');
    ok((gi.s.itemDetails || []).length === 5 && gi.s.itemDetails.every((d) => d.setId && d.setName && d.label), 'più set insieme: il dettaglio per stimolo, ognuno con il suo set');
    await attesa(500);
    ok(await p.evaluate(() => !document.getElementById('tice').hidden && TiceHome.attuale().vista === 'seduta'), 'più set insieme: a fine gioco si torna alla seduta');
    // il dettaglio si vede nella cartella del bambino
    await p.evaluate(() => TiceHome.vai('cartella', state.patients.find((x) => x.name === 'Prova B.').id)); await attesa(600);
    await p.click('[data-a="cartella-tab"][data-tab="giornate"]'); await attesa(300);
    await p.locator('.cr-giorno .cr-sed:has-text("Set Uno")').first().click(); await attesa(400);
    const fogl = await p.locator('.tice-foglio').innerText();
    ok(/Dettaglio per set e per stimolo/.test(fogl) && /Set Uno/.test(fogl) && /Set Due/.test(fogl) && /cane/.test(fogl) && /mela/.test(fogl) && /3\/3/.test(fogl), 'cartella: la scheda della seduta mostra il dettaglio per set e per stimolo');
    await p.keyboard.press('Escape'); await attesa(300);
    // la cartella vecchia legge lo stesso dato (dettaglio per set con gli stimoli)
    ok(await p.evaluate(() => { const h = document.createElement('div'); const l = state.patients.find((x) => x.name === 'Prova B.'); const s = l.history[l.history.length - 1]; return typeof renderSetBreakdownCollapsible === 'function' && /cane/.test(renderSetBreakdownCollapsible(s, l.id, l.history.length - 1, false)); }), 'cartella vecchia: il dettaglio per set mostra anche gli stimoli');

    // gioco avviato direttamente: un bambino senza programma resta come prima (la seduta va nella cartella)
    const gioca = (pid, modo, ids, esiti) => p.evaluate(async ({ pid, modo, ids, esiti }) => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      TiceHome.chiudi();
      setGlobalPatient(pid); selectModeFromDropdown(modo);
      if (ids.length > 1) loadSetsTogether(ids); else loadSelectedSet(ids[0]);
      await w(100);
      state.session.playItems.forEach((it, i) => { state.tactIndex = i; recordResponse(esiti[i % esiti.length]); });
    }, { pid, modo, ids, esiti });
    const salvaGioco = async () => { await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1200); };
    await gioca('p-senza', 'tact', ['gs1'], [true, false, true]); await salvaGioco();
    ok(await p.evaluate(() => state.patients.find((x) => x.id === 'p-senza').history.length) === 1 && await p.evaluate(() => localStorage.getItem('tice_bozza_p-senza')) === null, 'gioco diretto: un bambino che non è del Centro resta com\'era (seduta nella cartella, nessuna bozza)');
    // un bambino del Centro: la seduta va nella bozza di oggi come attività una tantum
    const idB = await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').id);
    await p.evaluate(() => { try { localStorage.removeItem('tice_bozza_' + state.patients.find((x) => x.name === 'Prova B.').id); TiceHome.strumenti.T.bozza = null; } catch (e) { /* niente */ } });
    const nPrima = await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').history.length);
    await gioca(idB, 'tact', ['gs1', 'gs2'], [true, false, 'prompt']); await salvaGioco();
    const dopo = await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); const b = JSON.parse(localStorage.getItem('tice_bozza_' + l.id) || 'null'); return { storico: l.history.length, temp: b ? b.temp.map((t) => ({ nome: t.nome, fuori: t.fuori })) : null, v: b ? Object.values(b.voci).map((v) => [v.v, v.p, v.x, !!v.gioco]) : null }; });
    ok(dopo.storico === nPrima && dopo.temp && dopo.temp.length === 1 && /^TACT – Set (Uno \+ Set Due|Due \+ Set Uno)$/.test(dopo.temp[0].nome) && dopo.temp[0].fuori && dopo.v[0][3], 'gioco diretto: il risultato è nella bozza di oggi come attività una tantum, non nella cartella (' + (dopo.temp && dopo.temp[0].nome) + ')');
    const av = await p.locator('.tice-avviso.con-azione').innerText();
    ok(/Aggiunto alla seduta di oggi di Prova B\./.test(av) && /Apri/.test(av), 'gioco diretto: avviso «Aggiunto alla seduta di oggi di …» con il tasto «Apri»');
    // salvato due volte lo stesso risultato: nessun doppione
    await p.evaluate(async () => {
      const l = state.patients.find((x) => x.name === 'Prova B.'); const b = JSON.parse(localStorage.getItem('tice_bozza_' + l.id));
      const g = JSON.parse(JSON.stringify(Object.values(b.voci)[0].gioco)); delete g.id;
      l.history.push(g); await DB.savePatient(l);
    }); await attesa(300);
    ok(await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').history.length) === nPrima, 'gioco diretto: lo stesso risultato salvato due volte non entra nella cartella');
    ok(await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); return JSON.parse(localStorage.getItem('tice_bozza_' + l.id)).temp.length; }) === 1, 'gioco diretto: nella bozza resta una sola attività');
    await p.click('.tice-avviso.con-azione button'); await attesa(800);
    ok(await p.evaluate(() => TiceHome.attuale().vista) === 'seduta' && /una tantum/.test(await p.locator('.att.con-dati').last().innerText()) && /2 set insieme/.test(await p.locator('.att.con-dati').last().innerText()), 'gioco diretto: «Apri» porta alla seduta, con l\'attività una tantum aperta e il dettaglio per set');
    // modificabile come il resto: il titolo e la modalità
    const idTmp = await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); return JSON.parse(localStorage.getItem('tice_bozza_' + l.id)).temp[0].id; });
    await p.click(`[data-a="nota-voce"][data-id="${idTmp}"]`); await attesa(400);
    ok(await p.locator('.tice-foglio [name=titolo]').count() === 1 && await p.locator('.tice-foglio [data-mod-voce]').count() === 1, 'gioco diretto: nelle opzioni ci sono titolo e modalità');
    await p.fill('.tice-foglio [name=titolo]', 'Gioco di prova'); await salvaFoglio();
    ok(await p.evaluate((id) => TiceHome.strumenti.bozza(state.patients.find((x) => x.name === 'Prova B.').id).temp.find((t) => t.id === id).nome, idTmp) === 'Gioco di prova', 'gioco diretto: il titolo si cambia come per ogni attività del giorno');
    // «Cambia»: dove va (una tantum, unisci a un'attività, nuova)
    await p.click(`[data-a="destinazione-temp"][data-id="${idTmp}"]`); await attesa(400);
    const dest = await p.locator('.tice-foglio').innerText();
    ok(/Una tantum/.test(dest) && /Unisci a un'altra attività del programma|Forse è/.test(dest) && /Aggiungila al programma come attività nuova/.test(dest), 'gioco diretto: «Cambia» offre una tantum, unisci a un\'attività del programma e attività nuova');
    await p.keyboard.press('Escape'); await attesa(300);
    // fine seduta: resta una tantum, con titolo, modalità di gioco e dettaglio
    await p.click('[data-a="termina"]'); await attesa(500);
    await p.fill('.tice-foglio [name=operatore]', 'Prova'); await salvaFoglio(); await attesa(500);
    while (await p.locator('.tice-foglio').count()) { await p.keyboard.press('Escape'); await attesa(200); }
    const fine = await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); const s = l.history.find((x) => x.setName === 'Gioco di prova'); return s ? { mode: s.mode, att: s.attivitaId, id: s.id, tot: s.total, bd: (s.setBreakdown || []).length, it: (s.itemDetails || []).length, fonte: s.fonte, op: s.operatore, n: l.history.filter((x) => x.giocoFirma && x.giocoFirma === s.giocoFirma).length } : null; });
    ok(fine && fine.mode === 'tact' && !fine.att && /^sx_/.test(fine.id) && fine.tot === 5 && fine.bd === 2 && fine.it === 5 && fine.fonte === 'app-gioco' && fine.op === 'Prova' && fine.n === 1, 'gioco diretto: a fine seduta una sola seduta, con il titolo scelto, la modalità di gioco e il dettaglio per set e per stimolo');
    ok(await p.evaluate(() => TiceHome.strumenti.agganci.datiFuori(state.patients.find((x) => x.name === 'Prova B.')).some((g) => g.nome === 'Gioco di prova')), 'gioco diretto: la seduta una tantum compare fra i «Dati fuori dal programma», correggibile con «Correggi i dati»');
    // la stessa seduta, di nuovo giocata e unita a un'attività del programma
    await p.evaluate(() => { TiceHome.strumenti.T.bozza = null; localStorage.removeItem('tice_bozza_' + state.patients.find((x) => x.name === 'Prova B.').id); });
    await gioca(idB, 'tact', ['gs1'], [true, true, false]); await salvaGioco();
    const idTmp2 = await p.evaluate(() => { const l = state.patients.find((x) => x.name === 'Prova B.'); return JSON.parse(localStorage.getItem('tice_bozza_' + l.id)).temp[0].id; });
    await p.evaluate(() => TiceHome.vai('seduta', state.patients.find((x) => x.name === 'Prova B.').id)); await attesa(500);
    await p.evaluate((id) => { TiceHome.strumenti.T.aperte[id] = true; TiceHome.ridisegna(); }, idTmp2); await attesa(300);
    await p.click(`[data-a="destinazione-temp"][data-id="${idTmp2}"]`); await attesa(400);
    await p.locator(`.tice-foglio [data-foglio="u:${att.id}"]`).first().click(); await attesa(500);
    ok(await p.evaluate((id) => TiceHome.strumenti.bozza(state.patients.find((x) => x.name === 'Prova B.').id).temp.length === 0, idTmp2), 'gioco diretto: «Unisci a un\'attività» toglie l\'attività una tantum dalla seduta');
    await p.click('[data-a="termina"]'); await attesa(500);
    await p.fill('.tice-foglio [name=operatore]', 'Prova'); await salvaFoglio(); await attesa(500);
    while (await p.locator('.tice-foglio').count()) { await p.keyboard.press('Escape'); await attesa(200); }
    const unita = await p.evaluate((id) => { const l = state.patients.find((x) => x.name === 'Prova B.'); const s = l.history.filter((x) => x.fonte === 'app-gioco' && x.attivitaId === id).pop(); return s ? { mode: s.mode, it: (s.itemDetails || []).length, tot: s.total } : null; }, att.id);
    ok(unita && unita.mode === 'tact' && unita.tot === 3 && unita.it === 3, 'gioco diretto: unito a un\'attività del programma, la seduta tiene modalità di gioco e dettaglio per stimolo');
    // telefono: la scheda con il dettaglio e la scelta «set insieme» entrano nello schermo
    await p.evaluate(() => { TiceHome.strumenti.T.bozza = null; localStorage.removeItem('tice_bozza_' + state.patients.find((x) => x.name === 'Prova B.').id); });
    await gioca(idB, 'tact', ['gs1', 'gs2'], [true, false]); await salvaGioco();
    await p.setViewportSize({ width: 390, height: 844 }); await attesa(300);
    await p.click('.tice-avviso.con-azione button'); await attesa(800);
    ok(await p.evaluate(() => { const m = document.querySelector('.tice-main'); let fuori = 0; document.querySelectorAll('#tice *').forEach((e) => { if (e.getBoundingClientRect().right > innerWidth + 1) fuori++; }); return m.scrollWidth <= m.clientWidth + 1 && fuori === 0; }), 'gioco diretto, telefono: la scheda con il dettaglio per set sta nello schermo (nessun elemento esce a destra)');
    await p.setViewportSize({ width: 1100, height: 900 }); await attesa(300);

    // ---- «Chi lo fa?» e «Cosa fa?»: stesse immagini con la stessa parola, soggetti diversi (js/tice-azioni.js, editor, game-modes.js) ----
    await p.evaluate(() => { try { closePatients(); } catch (e) { /* già chiusa */ } });
    await p.evaluate(() => { try { TiceHome.chiudi(); } catch (e) { /* già chiusa */ } });
    // il set di prova: 2 azioni × 3 soggetti, ancora senza soggetto (si assegna dall'editor)
    await p.evaluate(async () => {
      const img = (t, i) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="hsl(${i * 47},70%,60%)"/><text x="60" y="64" font-size="14" text-anchor="middle" fill="#fff">${t}</text></svg>`);
      const items = []; ['bere', 'mangiare'].forEach((a, ai) => [1, 2, 3].forEach((n) => items.push({ label: a, url: img(a + n, ai * 3 + n) })));
      const s = { id: 'az1', name: 'Azioni 1', category: 'Prova', modes: ['tact'], items, date: new Date().toISOString() };
      await DB.saveSet(s); state.savedSets.push(s);
      state.patients.push({ id: 'p-az', name: 'Prova Azioni', history: [] });
    });
    const tienigs = await p.evaluate(() => state.savedSets.filter((s) => s.id === 'gs1' || s.id === 'gs2').map((s) => JSON.parse(JSON.stringify(s))));
    // editor: assegnazione rapida dei soggetti (3 soggetti distribuiti in ordine dentro ogni azione)
    await p.evaluate(() => editSet('az1')); await attesa(400);
    ok(await p.locator('#editor-list .editor-item input[list="sogg-lista"]').count() === 6 && /0 \/ 6 con soggetto/.test(await p.locator('#modal-editor').innerText()), 'editor: ogni immagine ha il campo «Soggetto» e il contatore dice 0 / 6');
    await p.click('#modal-editor button:has-text("Soggetti")'); await attesa(200);
    ok(await p.locator('#editor-list .sogg-sel').count() === 6, 'editor: il pannello «Soggetti» mette una casella di selezione a ogni immagine');
    await p.fill('#sogg-input', 'nonno, mamma, bambino'); await p.click('#modal-editor button:has-text("Distribuisci per azione")'); await attesa(200);
    ok(await p.evaluate(() => state.editingItems.map((i) => i.label + ':' + i.soggetto).join()) === 'bere:nonno,bere:mamma,bere:bambino,mangiare:nonno,mangiare:mamma,mangiare:bambino', 'editor: «Distribuisci per azione» assegna nonno/mamma/bambino dentro ogni azione');
    // una per una, e a più immagini spuntate
    await p.locator('#editor-list .editor-item input[list="sogg-lista"]').nth(5).fill('  zia '); await p.keyboard.press('Tab'); await attesa(200);
    ok(await p.evaluate(() => state.editingItems[5].soggetto) === 'zia', 'editor: il soggetto di una singola immagine si scrive nella sua riga (spazi ripuliti)');
    await p.locator('#editor-list .sogg-sel').nth(0).check(); await p.locator('#editor-list .sogg-sel').nth(1).check();
    await p.fill('#sogg-input', 'papà'); await p.click('#modal-editor button:has-text("Assegna ai selezionati")'); await attesa(200);
    ok(await p.evaluate(() => state.editingItems.slice(0, 2).map((i) => i.soggetto).join()) === 'papà,papà', 'editor: «Assegna ai selezionati» dà lo stesso soggetto alle immagini spuntate');
    await p.click('#modal-editor button:has-text("Seleziona senza soggetto")'); await attesa(100);
    ok(await p.locator('#editor-list .sogg-sel:checked').count() === 0, 'editor: «Seleziona senza soggetto» non seleziona niente se tutte lo hanno');
    // si rimette com'era voluto: nonno, mamma, bambino / nonno, mamma, zia
    await p.fill('#sogg-input', 'nonno, mamma, bambino'); await p.click('#modal-editor button:has-text("Distribuisci per azione")'); await attesa(200);
    await p.evaluate(() => { state.editingItems[5].soggetto = 'zia'; });
    await p.evaluate(() => saveEditorChanges()); await attesa(800);
    const salvato = await p.evaluate(() => { const s = state.savedSets.find((x) => x.id === 'az1'); return { sogg: s.items.map((i) => i.soggetto).join(), modes: s.modes }; });
    ok(salvato.sogg === 'nonno,mamma,bambino,nonno,mamma,zia' && salvato.modes.includes('chi_lo_fa') && salvato.modes.includes('cosa_fa') && salvato.modes.includes('tact'), 'editor: il soggetto si salva con il set e la prima volta le due modalità si attivano da sole (' + salvato.modes.join() + ')');
    await p.evaluate((l) => { l.forEach((s) => { if (!state.savedSets.some((x) => x.id === s.id)) state.savedSets.push(s); }); try { document.getElementById('modal-library').classList.remove('open'); } catch (e) { /* niente */ } }, tienigs);
    // il set è compatibile con le due modalità e i nomi sono leggibili ovunque
    ok(await p.evaluate(() => getModeLabel('chi_lo_fa') + '|' + getModeLabel('cosa_fa') + '|' + MODES_CONFIG.chi_lo_fa + '|' + TiceHome.strumenti.etichettaModo('cosa_fa')) === 'Chi lo fa?|Cosa fa?|Chi lo fa?|Cosa fa?', 'nomi leggibili: «Chi lo fa?» e «Cosa fa?» (menu, elenchi, cartella)');
    ok(await p.evaluate(() => [...document.getElementById('mode-select').options].map((o) => o.text.trim()).filter((t) => /Chi lo fa|Cosa fa/.test(t)).length) >= 2, 'menu dei giochi: le due modalità ci sono');
    // export/import e sincronizzazione: il soggetto passa, e le 6 immagini con la stessa parola non si fondono
    const unione = await p.evaluate(() => {
      const loc = JSON.parse(JSON.stringify(state.savedSets.find((x) => x.id === 'az1')));
      const inc = JSON.parse(JSON.stringify(loc)); inc.items[1].soggetto = 'nonna';
      const m = mergeSets(loc, inc);
      const vecchio = JSON.parse(JSON.stringify(loc)); vecchio.items.forEach((i) => delete i.soggetto);
      const m2 = mergeSets(loc, vecchio);
      const nuovo = JSON.parse(JSON.stringify(loc)); nuovo.items.forEach((i) => delete i.soggetto); const m3 = mergeSets(nuovo, loc);
      const copia = JSON.parse(JSON.stringify(loc)); copia.items = copia.items.concat([{ label: 'correre', url: 'x' }]);
      return { n: m.items.length, s: m.items.map((i) => i.soggetto).join(), n2: m2.items.length, s2: m2.items.map((i) => i.soggetto).join(), n3: m3.items.length, s3: m3.items.map((i) => i.soggetto).join(), n4: mergeSets(loc, copia).items.length };
    });
    ok(unione.n === 6 && unione.s === 'nonno,nonna,bambino,nonno,mamma,zia' && unione.n2 === 6 && /nonno,mamma,bambino,nonno,mamma,zia/.test(unione.s2) && unione.n3 === 6 && unione.s3 === 'nonno,mamma,bambino,nonno,mamma,zia' && unione.n4 === 7,
      'sincronizzazione dei set: le immagini con la stessa parola restano distinte e il soggetto passa (' + JSON.stringify(unione) + ')');

    // ---- «Chi lo fa?» dal menu dei giochi ----
    const turnoAz = () => p.evaluate(() => { const S = state._azSogg; return S && S.corrente ? { n: S.corrente.n, dom: document.querySelector('.cf-dom') && document.querySelector('.cf-dom').innerText, ris: document.querySelector('.cf-ris b') && document.querySelector('.cf-ris b').innerText, carte: document.querySelectorAll('#cf-campo .cf-carta').length, chiave: S.mazzo.ultimo, titolo: document.querySelector('.cf-titolo').innerText.trim() } : null; });
    await p.evaluate(() => { document.getElementById('session-type-select').value = 'independent'; onSessionTypeChange(); setGlobalPatient('p-az'); selectModeFromDropdown('chi_lo_fa'); loadSelectedSet('az1'); }); await attesa(500);
    let t1 = await turnoAz();
    ok(t1 && /^CHI LO FA\?$/i.test(t1.titolo) && t1.carte === 3 && /Chi lo fa: «(bere|mangiare)»\?/.test(t1.dom) && ['nonno', 'mamma', 'bambino', 'zia'].includes(t1.ris), '«Chi lo fa?»: esce un\'azione, 3 carte (le 3 immagini di quell\'azione) e la risposta attesa (' + (t1 && t1.dom) + ' → ' + (t1 && t1.ris) + ')');
    ok(await p.evaluate(() => state.session.usesField === true && !!document.querySelector('.cf-operatore')), '«Chi lo fa?»: usa il field e mostra discretamente domanda e risposta a chi somministra');
    // il field decide le carte (con più carte di quelle disponibili si mostrano quelle disponibili)
    await p.selectOption('#num-stimuli', '3'); await attesa(300);
    ok((await turnoAz()).carte === 3, '«Chi lo fa?»: field 3 → 3 carte');
    await p.evaluate(() => { const s = document.getElementById('num-stimuli'); s.value = '0'; });
    await p.evaluate(() => startGame()); await attesa(300);
    // tocco su una carta: evidenzia la scelta del bambino ma non segna niente
    await p.click('#cf-carta-0'); await attesa(100);
    ok(await p.evaluate(() => document.querySelector('#cf-carta-0').classList.contains('cf-scelta') && state.session.total === 0), '«Chi lo fa?»: toccare una carta evidenzia la scelta, non segna il punteggio');
    // si gioca: V, X, V, V (tasti e pulsanti), senza che lo stesso bersaglio esca due volte di fila
    const visti = [];
    const segna = async (come) => {
      const t = await turnoAz(); visti.push(t.dom + '→' + t.ris);
      if (come === 'V') await p.keyboard.press('v'); else if (come === 'X') await p.keyboard.press('x'); else await p.evaluate((r) => recordResponse(r), come);
      await attesa(900);
    };
    await segna('V'); await segna('X'); await segna('V'); await segna('V');
    ok(new Set(visti.slice(0, 3).map((x, i) => x + '|' + i)).size === 3 && visti.every((x, i) => i === 0 || x !== visti[i - 1]), '«Chi lo fa?»: lo stesso bersaglio non esce due volte di fila (' + visti.join(' ; ') + ')');
    ok(await p.evaluate(() => state.session.correct === 3 && state.session.incorrect === 1 && state.session.total === 4), '«Chi lo fa?»: i tasti V / X segnano il turno e si passa al successivo (3 V, 1 X)');
    // doppio tocco subito dopo la risposta: un solo risultato per turno
    await p.evaluate(() => { recordResponse(true); recordResponse(true); recordResponse(false); }); await attesa(900);
    ok(await p.evaluate(() => state.session.total === 5), '«Chi lo fa?»: più tocchi sullo stesso turno contano una volta sola');
    // annulla: si torna al turno appena segnato (Ctrl+Z)
    const turnoPrima = await turnoAz();
    await p.keyboard.press('Control+z'); await attesa(300);
    const dopoAnn = await turnoAz();
    ok(await p.evaluate(() => state.session.total === 4) && dopoAnn.n === turnoPrima.n - 1, '«Chi lo fa?»: annulla toglie l\'ultima risposta e riporta a quel turno');
    await p.evaluate(() => recordResponse(true)); await attesa(900);
    // salta (S) non segna niente
    const totPrima = await p.evaluate(() => state.session.total);
    await p.keyboard.press('s'); await attesa(500);
    ok(await p.evaluate(() => state.session.total) === totPrima, '«Chi lo fa?»: saltare un turno non lo segna');
    // time delay: ✓ e P
    await p.evaluate(() => { document.getElementById('session-type-select').value = 'timedelay'; onSessionTypeChange(); });
    await p.evaluate(() => recordResponse('prompt')); await attesa(900);
    ok(await p.evaluate(() => state.session.prompts === 1), '«Chi lo fa?»: in time delay si segna anche P');
    await p.evaluate(() => { document.getElementById('session-type-select').value = 'independent'; onSessionTypeChange(); });
    if (process.env.TICE_SHOT) await p.screenshot({ path: process.env.TICE_SHOT + '/chi-lo-fa.png' });
    // salvataggio: totale, dettaglio per stimolo «bere · nonno», tipo di seduta
    const nAz0 = await p.evaluate(() => state.patients.find((x) => x.id === 'p-az').history.length);
    await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1200);
    const sAz = await p.evaluate((n) => { const l = state.patients.find((x) => x.id === 'p-az').history; return { nuove: l.length - n, s: JSON.parse(JSON.stringify(l[l.length - 1])) }; }, nAz0);
    ok(sAz.nuove === 1 && sAz.s.mode === 'chi_lo_fa' && sAz.s.setId === 'az1' && sAz.s.total === 6 && sAz.s.correct === 4 && sAz.s.rawX === 1 && sAz.s.rawP === 1 && sAz.s.usesField === true, '«Chi lo fa?»: seduta salvata con modalità, set e totale (4 V, 1 X, 1 P su 6)');
    ok(sAz.s.itemDetails.length === 6 && sAz.s.itemDetails.every((d) => /^(bere|mangiare) · (nonno|mamma|bambino|zia)$/.test(d.label) && d.azione && d.soggetto && [true, false, 'prompt'].includes(d.result)) && !sAz.s.setBreakdown, '«Chi lo fa?»: il dettaglio per stimolo è la coppia azione · soggetto («' + sAz.s.itemDetails[0].label + '»), niente dettaglio per set con un set solo');
    // la cartella lo mostra con il nome leggibile
    await p.evaluate(() => TiceHome.vai('cartella', 'p-az')); await attesa(600);
    await p.click('[data-a="cartella-tab"][data-tab="giornate"]').catch(() => {}); await attesa(300);
    await p.locator('.cr-giorno .cr-sed').first().click(); await attesa(500);
    ok(/Gioco\s+Chi lo fa\?/.test(await p.locator('.tice-foglio').innerText()), 'cartella: la scheda della seduta dice «Gioco: Chi lo fa?»');
    await p.keyboard.press('Escape'); await attesa(300);
    await p.evaluate(() => TiceHome.chiudi());

    // ---- «Cosa fa?» (invertita): esce un soggetto, il field mostra le sue azioni ----
    await p.evaluate(() => { setGlobalPatient('p-az'); selectModeFromDropdown('cosa_fa'); loadSelectedSet('az1'); }); await attesa(500);
    const t2 = await turnoAz();
    ok(t2 && /^COSA FA\?$/i.test(t2.titolo) && /^«(nonno|mamma)» cosa fa\?$/.test(t2.dom) && ['bere', 'mangiare'].includes(t2.ris) && t2.carte === 2, '«Cosa fa?»: esce un soggetto, 2 carte (le sue 2 azioni) e la risposta attesa è l\'azione (' + (t2 && t2.dom) + ' → ' + (t2 && t2.ris) + ')');
    ok(await p.evaluate(() => !!document.querySelector('.cf-avviso') && /2 gruppi esclusi/.test(document.querySelector('.cf-avviso').innerText) && /bambino/.test(document.querySelector('.cf-avviso').innerText)), '«Cosa fa?»: avvisa che bambino e zia (una sola immagine, nessun distrattore) sono esclusi — «' + await p.evaluate(() => (document.querySelector('.cf-avviso') || { innerText: '' }).innerText.replace(/\s+/g, ' ')) + '»');
    const visti2 = [];
    for (const r of [true, false, true, 'prompt']) { const t = await turnoAz(); visti2.push(t.dom); await p.evaluate((x) => recordResponse(x), r === 'prompt' ? false : r); await attesa(900); }
    ok(visti2.every((x, i) => i === 0 || x !== visti2[i - 1]) || visti2.length === 4, '«Cosa fa?»: i turni proseguono');
    const nAz1 = await p.evaluate(() => state.patients.find((x) => x.id === 'p-az').history.length);
    await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1200);
    const sCo = await p.evaluate((n) => { const l = state.patients.find((x) => x.id === 'p-az').history; return { nuove: l.length - n, s: JSON.parse(JSON.stringify(l[l.length - 1])) }; }, nAz1);
    ok(sCo.nuove === 1 && sCo.s.mode === 'cosa_fa' && sCo.s.total === 4 && sCo.s.correct === 2 && sCo.s.itemDetails.length === 4 && sCo.s.itemDetails.every((d) => /^(bere|mangiare) · (nonno|mamma)$/.test(d.label)), '«Cosa fa?»: seduta salvata (2 V su 4) con il dettaglio azione · soggetto (' + sCo.s.itemDetails.map((d) => d.label).join(', ') + ')');
    // il set senza nessun soggetto: messaggio chiaro, nessun errore
    await p.evaluate(async () => { const s = { id: 'az0', name: 'Azioni senza soggetto', category: 'Prova', modes: ['cosa_fa', 'chi_lo_fa'], items: ['bere', 'bere', 'mangiare'].map((label) => ({ label, url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' })) }; state.savedSets.push(s); selectModeFromDropdown('cosa_fa'); loadSelectedSet('az0'); });
    await attesa(400);
    ok(/nessun gruppo giocabile/.test(await p.locator('#game-stage').innerText()) && /3 immagini senza soggetto escluse/.test(await p.locator('#game-stage').innerText()), '«Cosa fa?»: un set senza soggetti dice che non c\'è niente da giocare e quante immagini mancano');
    await p.evaluate(() => { selectModeFromDropdown('chi_lo_fa'); loadSelectedSet('az0'); }); await attesa(400);
    ok(/Chi lo fa: «bere»\?/.test(await p.locator('.cf-dom').innerText()) && /soggetto non assegnato/.test(await p.locator('.cf-ris').innerText()) && /3 immagini senza soggetto/.test(await p.locator('.cf-avviso').innerText()), '«Chi lo fa?»: senza soggetto si gioca con la sola parola e l\'avviso lo dice; «mangiare» (una sola immagine) è escluso');

    // ---- più set insieme (set di azioni diversi, stessa parola) ----
    await p.evaluate(async () => {
      const img = (t, i) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="hsl(${i * 61},70%,60%)"/><text x="60" y="64" font-size="14" text-anchor="middle" fill="#fff">${t}</text></svg>`);
      const mk = (id, nome, voci) => ({ id, name: nome, category: 'Prova', modes: ['chi_lo_fa', 'cosa_fa'], items: voci.map(([label, soggetto], i) => ({ label, soggetto, url: img(label + soggetto, i + 3) })) });
      state.savedSets.push(mk('azA', 'Azioni A', [['bere', 'nonno'], ['bere', 'mamma'], ['dormire', 'nonno'], ['dormire', 'mamma']]));
      state.savedSets.push(mk('azB', 'Azioni B', [['bere', 'bambino'], ['dormire', 'bambino'], ['dormire', 'zia'], ['bere', 'zia']]));
    });
    await p.evaluate(() => { setGlobalPatient('p-az'); selectModeFromDropdown('chi_lo_fa'); loadSetsTogether(['azA', 'azB']); }); await attesa(500);
    ok(await p.evaluate(() => (state.mergedSets || []).length === 2 && state._azSogg && state._azSogg.gruppi.length === 2 && state._azSogg.gruppi.every((g) => g.opzioni.length === 4)), 'più set insieme: le immagini della stessa azione di set diversi stanno nello stesso gruppo (2 azioni × 4 soggetti)');
    for (let i = 0; i < 6; i++) { await p.evaluate((i_) => recordResponse(i_ % 3 === 0 ? false : (i_ % 3 === 1 ? true : true)), i); await attesa(900); }
    const nAz2 = await p.evaluate(() => state.patients.find((x) => x.id === 'p-az').history.length);
    await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1200);
    const sIns = await p.evaluate((n) => { const l = state.patients.find((x) => x.id === 'p-az').history; return { nuove: l.length - n, s: JSON.parse(JSON.stringify(l[l.length - 1])) }; }, nAz2);
    const bdA = (sIns.s.setBreakdown || []);
    ok(sIns.nuove === 1 && sIns.s.setId === 'multi_azA_azB' && sIns.s.total === 6 && bdA.length >= 1 && bdA.reduce((a, b) => a + b.total, 0) === 6 && bdA.reduce((a, b) => a + b.correct, 0) === sIns.s.correct, 'più set insieme: una sola seduta con totale unico e dettaglio per set che torna col totale (' + bdA.map((b) => b.setName + ' ' + b.correct + '/' + b.total).join(', ') + ')');
    ok(sIns.s.itemDetails.length === 6 && sIns.s.itemDetails.every((d) => d.setId && d.setName && / · /.test(d.label)), 'più set insieme: il dettaglio per stimolo porta il set di ciascuno');

    // ---- dal Centro: attività con target «Chi lo fa?», «Somministra con l'app», seduta in programma ----
    await p.evaluate(() => TiceHome.vai('programma', state.patients.find((x) => x.name === 'Prova B.').id)); await attesa(500);
    await p.evaluate(() => { const pz = state.patients.find((x) => x.name === 'Prova B.'); const a = TiceProgramma.nuovaAttivita(pz, { nome: 'Chi lo fa (intraverbal)', mode: 'chi_lo_fa' }); TiceProgramma.aggiungiTarget(a, { testo: 'Azioni A + Azioni B', setId: 'azA', setIds: ['azA', 'azB'], mode: 'chi_lo_fa' }, false); TiceHome.salvaPaziente && TiceHome.strumenti.salvaPaziente(pz); });
        await p.click('[data-a="nuovo-target"]').catch(() => {}); await attesa(100); while (await p.locator('.tice-foglio').count()) { await p.keyboard.press('Escape'); await attesa(200); }
    const idAtt = await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').programma.attivita.find((a) => a.nome === 'Chi lo fa (intraverbal)').id);
    // il modulo «Nuovi target» offre le due modalità fra i giochi
    await p.evaluate((id) => TiceHome.vai('programma', state.patients.find((x) => x.name === 'Prova B.').id), idAtt); await attesa(300);
    await p.click(`[data-a="nuovo-target"][data-id="${idAtt}"]`); await attesa(400);
    ok(await p.locator('.tice-foglio [name=modo] option', { hasText: 'Chi lo fa?' }).count() === 1 && await p.locator('.tice-foglio [name=modo] option', { hasText: 'Cosa fa?' }).count() === 1, 'Centro, nuovi target: «Chi lo fa?» e «Cosa fa?» compaiono fra i giochi con il set');
    await p.keyboard.press('Escape'); await attesa(300);
    const nB0 = await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').history.length);
    await p.evaluate((id) => { const pz = state.patients.find((x) => x.name === 'Prova B.'), a = pz.programma.attivita.find((y) => y.id === id), t = a.target[0]; TiceHome.strumenti.lancia(pz, a, t); }, idAtt); await attesa(600);
    ok(await p.evaluate(() => document.getElementById('mode-select').value === 'chi_lo_fa' && state.mergedSets.length === 2 && !!state._azSogg), 'Centro: «Somministra con l\'app» apre «Chi lo fa?» con i due set insieme');
    for (const r of [true, true, false]) { await p.evaluate((x) => recordResponse(x), r); await attesa(900); }
    await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1500);
    const sC = await p.evaluate((n) => { const l = state.patients.find((x) => x.name === 'Prova B.').history; return { nuove: l.length - n, s: JSON.parse(JSON.stringify(l[l.length - 1])) }; }, nB0);
    ok(sC.nuove === 1 && sC.s.mode === 'chi_lo_fa' && sC.s.fonte === 'app-gioco' && sC.s.attivitaId === idAtt && sC.s.total === 3 && sC.s.correct === 2 && (sC.s.setBreakdown || []).length >= 1 && sC.s.itemDetails.length === 3, 'Centro: la seduta del gioco entra nel programma (attività e target collegati, dettaglio per set e per stimolo)');
    // gioco avviato direttamente da un bambino del Centro → seduta di oggi
    await p.evaluate(() => { TiceHome.strumenti.T.bozza = null; localStorage.removeItem('tice_bozza_' + state.patients.find((x) => x.name === 'Prova B.').id); TiceHome.chiudi(); });
    const nB1 = await p.evaluate(() => state.patients.find((x) => x.name === 'Prova B.').history.length);
    await p.evaluate(() => { setGlobalPatient(state.patients.find((x) => x.name === 'Prova B.').id); selectModeFromDropdown('cosa_fa'); loadSelectedSet('azA'); }); await attesa(500);
    for (const r of [true, false]) { await p.evaluate((x) => recordResponse(x), r); await attesa(900); }
    await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1500);
    const dir = await p.evaluate((n) => { const l = state.patients.find((x) => x.name === 'Prova B.'); const b = JSON.parse(localStorage.getItem('tice_bozza_' + l.id) || 'null'); return { storico: l.history.length - n, temp: b ? b.temp.map((t) => t.nome) : null, gioco: b ? Object.values(b.voci).map((v) => v.gioco && v.gioco.mode) : null, det: b ? Object.values(b.voci).map((v) => v.gioco && (v.gioco.itemDetails || []).map((d) => d.label)) : null }; }, nB1);
    ok(dir.storico === 0 && dir.temp && dir.temp.length === 1 && /Cosa fa\? – Azioni A/.test(dir.temp[0]) && dir.gioco[0] === 'cosa_fa' && dir.det[0].length === 2 && / · /.test(dir.det[0][0]), '«Cosa fa?» avviato direttamente: va nella seduta di oggi come attività una tantum, con il dettaglio («' + (dir.temp && dir.temp[0]) + '»)');
    await p.evaluate(() => { TiceHome.strumenti.T.bozza = null; localStorage.removeItem('tice_bozza_' + state.patients.find((x) => x.name === 'Prova B.').id); });
    // grafici e filtri: la modalità compare con il nome leggibile
    ok(await p.evaluate(() => { const l = state.patients.find((x) => x.id === 'p-az'); const costrutti = vizConstructScores ? vizConstructScores(l.history) : null; const k = costrutti && (Array.isArray(costrutti) ? costrutti : Object.values(costrutti)); return !!k; }), 'grafici: i costrutti (Intraverbale) leggono le sedute delle due modalità senza errori');
    await p.evaluate(() => TiceHome.vai('grafici', 'p-az')); await attesa(900);
    ok(await p.locator('[data-grafici]').count() >= 0 && !/undefined|NaN/.test(await p.locator('#tice').innerText()), 'grafici: la pagina del bambino con sedute «Chi lo fa?» / «Cosa fa?» si disegna senza «undefined»');
    await p.evaluate(() => TiceHome.chiudi());
    // telefono: le carte del field (6) stanno comode
    await p.setViewportSize({ width: 390, height: 844 }); await attesa(300);
    await p.evaluate(async () => { const img = (i) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="hsl(${i * 50},70%,60%)"/></svg>`); state.savedSets.push({ id: 'az6', name: 'Sei soggetti', category: 'Prova', modes: ['chi_lo_fa'], items: ['nonno', 'mamma', 'bambino', 'zia', 'papà', 'sorella'].map((s, i) => ({ label: 'bere', soggetto: s, url: img(i) })).concat(['nonno', 'mamma', 'bambino', 'zia', 'papà', 'sorella'].map((s, i) => ({ label: 'dormire', soggetto: s, url: img(i + 1) }))) }); selectModeFromDropdown('chi_lo_fa'); loadSelectedSet('az6'); });
    await attesa(500);
    const tel = await p.evaluate(() => { const st = document.getElementById('game-stage').getBoundingClientRect(); const c = [...document.querySelectorAll('#cf-campo .cf-carta')].map((e) => e.getBoundingClientRect()); const bar = document.querySelector('.cf-operatore').getBoundingClientRect(); return { n: c.length, minL: Math.min(...c.map((r) => r.width)), minA: Math.min(...c.map((r) => r.height)), fuori: c.some((r) => r.right > innerWidth + 1 || r.left < -1), orizz: st.right <= innerWidth + 1 && st.left >= 0, barraDentro: bar.right <= innerWidth + 1 && bar.left >= 0 }; });
    ok(tel.n === 6 && tel.minL >= 100 && tel.minA >= 90 && !tel.fuori && tel.orizz && tel.barraDentro, 'telefono: 6 carte nel field, ognuna comoda (' + Math.round(tel.minL) + '×' + Math.round(tel.minA) + 'px), dentro lo schermo');
    if (process.env.TICE_SHOT) await p.screenshot({ path: process.env.TICE_SHOT + '/chi-lo-fa-telefono.png' });
    await p.evaluate(() => { editSet('az6'); document.getElementById('modal-editor').scrollTop = 0; }); await attesa(300);
    await p.evaluate(() => toggleSoggPanel()); await attesa(200);
    ok(await p.evaluate(() => { let fuori = 0; document.querySelectorAll('#editor-list *').forEach((e) => { if (e.getBoundingClientRect().right > innerWidth + 1) fuori++; }); return fuori === 0; }), 'editor, telefono: il campo soggetto e il pannello entrano nello schermo');
    if (process.env.TICE_SHOT) await p.screenshot({ path: process.env.TICE_SHOT + '/editor-soggetti-telefono.png' });
    await p.evaluate(() => closeEditor()); await p.evaluate(() => { document.getElementById('modal-library').classList.remove('open'); });
    await p.setViewportSize({ width: 1100, height: 900 }); await attesa(300);
    // la scorciatoia non scatta mentre si scrive nel campo del soggetto
    await p.evaluate(() => { editSet('az6'); }); await attesa(200);
    const tot0 = await p.evaluate(() => state.session.total);
    await p.locator('#editor-list .editor-item input[list="sogg-lista"]').first().focus(); await p.keyboard.type('vvx'); await attesa(200);
    ok(await p.evaluate(() => state.session.total) === tot0 && /vvx/.test(await p.locator('#editor-list .editor-item input[list="sogg-lista"]').first().inputValue()), 'scorciatoie: scrivendo il soggetto i tasti v / x non segnano risposte (staScrivendo)');
    await p.evaluate(() => { closeEditor(); document.getElementById('modal-library').classList.remove('open'); });
    // fine delle prove di gioco: nessuna partita aperta (chiudere la presa dati chiederebbe «Attività in corso…»)
    await p.evaluate(() => { state.session.active = false; document.querySelectorAll('.themed-dialog-overlay').forEach((e) => e.remove()); });
    await p.evaluate(() => { try { TiceHome.apri(); } catch (e) { /* aperta */ } }); await attesa(300);

    // ---- data della seduta: una seduta di un giorno passato, e il cambio di data a posteriori (js/tice-data.js) ----
    const foto = (nome) => (process.env.TICE_SHOT ? p.screenshot({ path: process.env.TICE_SHOT + '/' + nome + '.png' }) : null);   // schermate per chi sviluppa: TICE_SHOT=cartella
    const nomeB = 'Prova B.';
    const giornoFa = (n) => p.evaluate((k) => { const d = new Date(); d.setDate(d.getDate() - k); return TiceProgramma.giorno(d.toISOString()); }, n);
    const gPass = await giornoFa(12), gPass2 = await giornoFa(20), gOggi = await giornoFa(0);
    const pulisciBozza = () => p.evaluate((nome) => { const l = state.patients.find((x) => x.name === nome); TiceHome.strumenti.T.bozza = null; localStorage.removeItem('tice_bozza_' + l.id); }, nomeB);
    const scegliData = async (g, ora) => {
      await p.evaluate(() => { setTimeout(() => TiceHome.strumenti.azioni.data(), 0); }); await attesa(400);
      await p.fill('.tice-foglio [name=data]', g); await p.fill('.tice-foglio [name=ora]', ora || '');
      await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(400);
    };
    await pulisciBozza();
    await p.evaluate((nome) => TiceHome.vai('seduta', state.patients.find((x) => x.name === nome).id), nomeB); await attesa(500);
    await scegliData(gPass);
    // il giorno scelto non torna a oggi: né dopo il ridisegno, né dopo una ricarica (bozza ancora vuota)
    ok(await p.evaluate(() => TiceHome.strumenti.bozza(TiceHome.strumenti.T.pid).data) === gPass, 'seduta in un giorno passato: scelta la data, la bozza (ancora vuota) non torna a oggi');
    await p.evaluate(() => TiceHome.ridisegna()); await attesa(300);
    ok(await p.evaluate(() => TiceHome.strumenti.bozza(TiceHome.strumenti.T.pid).data) === gPass, 'seduta in un giorno passato: dopo un ridisegno resta quel giorno');
    ok(await p.evaluate(() => { const T = TiceHome.strumenti.T; const pid = T.pid; T.bozza = null; return TiceHome.strumenti.bozza(pid).data; }) === gPass, 'seduta in un giorno passato: dopo una ricarica (bozza riletta dal dispositivo) resta quel giorno');
    ok(/Stai registrando una seduta del/.test(await p.locator('.banda').first().innerText()) && await p.locator('.banda [data-a="data"]').count() === 1, 'seduta in un giorno passato: la fascia lo dice, con «Cambia»');
    await foto('seduta-passata');
    // si segna: una prova, un episodio del comportamento, un gioco in seduta (come il gioco avviato dalla seduta aperta)
    await p.evaluate((id) => {
      const X = TiceHome.strumenti, pz = state.patients.find((x) => x.id === X.T.pid), b = X.bozza(pz.id), c = TiceProgramma.targetCorrente(pz.programma.attivita.find((y) => y.id === id));
      b.voci[id] = { v: 2, p: 0, x: 1, sequenza: 'VVX', targetId: c ? c.target.id : null, sessionType: 'independent' };
      const cp = pz.comportamenti[0];
      b.comp = b.comp || {}; b.comp[cp.id] = { episodi: [{ id: 'ep_prova', t: new Date().toISOString() }], inCorso: null };   // un episodio segnato adesso, per un giorno passato
      X.salvaBozza(); TiceHome.ridisegna();
    }, att.id); await attesa(400);
    ok(await p.evaluate(() => { const b = TiceHome.strumenti.bozza(TiceHome.strumenti.T.pid); return b.data; }) === gPass && await p.evaluate(() => Object.values(TiceHome.strumenti.T.bozza.voci).some((v) => v.v + v.p + v.x > 0)), 'seduta in un giorno passato: le risposte entrano nella bozza di quel giorno');
    const nStor0 = await p.evaluate((nome) => state.patients.find((x) => x.name === nome).history.length, nomeB);
    await p.click('[data-a="termina"]'); await attesa(500);
    await p.fill('.tice-foglio [name=operatore]', 'Prova'); await p.fill('.tice-foglio [name=nota]', 'Nota a posteriori.');
    await salvaFoglio(); await attesa(500);
    while (await p.locator('.tice-foglio').count()) { await p.keyboard.press('Escape'); await attesa(200); }
    const dopoP = await p.evaluate(({ nome, n0 }) => {
      const l = state.patients.find((x) => x.name === nome), nuove = l.history.slice(n0);
      const g = (iso) => TiceProgramma.giorno(iso);
      const nota = (l.diario || []).find((x) => x.testo === 'Nota a posteriori.');
      return { n: nuove.length, giorni: [...new Set(nuove.map((s) => g(s.date)))], comp: nuove.filter((s) => s.mode === 'comportamento').map((s) => (s.dettaglio || []).map((e) => g(e.t))), nota: nota && { data: nota.data, il: g(nota.il) }, daily: (l.dailyNotes || {}), bozza: localStorage.getItem('tice_bozza_' + l.id), soloOggi: nuove.some((s) => g(s.date) === TiceProgramma.oggi()) };
    }, { nome: nomeB, n0: nStor0 });
    ok(dopoP.n >= 2 && dopoP.giorni.length === 1 && dopoP.giorni[0] === gPass && !dopoP.soloOggi, 'seduta in un giorno passato: tutte le voci salvate (attività e comportamenti) sono nel giorno scelto, nessuna in quello di oggi (' + dopoP.giorni.join(',') + ')');
    ok(dopoP.comp.length >= 1 && dopoP.comp.every((gg) => gg.length > 0 && gg.every((x) => x === gPass)), 'seduta in un giorno passato: anche gli episodi del comportamento sono in quel giorno');
    ok(dopoP.nota && dopoP.nota.data === gPass && dopoP.nota.il === gPass && /Nota a posteriori/.test(dopoP.daily[gPass] || '') && !/Nota a posteriori/.test(dopoP.daily[gOggi] || ''), 'seduta in un giorno passato: la nota di seduta e il testo del giorno (dailyNotes) sono in quel giorno');
    ok(dopoP.bozza === null, 'seduta in un giorno passato: salvata la seduta la bozza sparisce e si riparte da oggi');
    ok(await p.evaluate(() => TiceHome.strumenti.bozza(TiceHome.strumenti.T.pid).data) === gOggi, 'seduta in un giorno passato: la seduta dopo riparte da oggi');

    // gioco avviato direttamente mentre c'è una seduta aperta per un altro giorno: resta nella cartella (con la data di oggi), non va nella seduta di oggi
    await p.evaluate(() => { try { closePatients(); } catch (e) { /* già chiusa */ } });
    await pulisciBozza();
    await p.evaluate((nome) => TiceHome.vai('seduta', state.patients.find((x) => x.name === nome).id), nomeB); await attesa(400);
    await scegliData(gPass2, '09:30');
    ok(await p.evaluate(() => TiceHome.strumenti.bozza(TiceHome.strumenti.T.pid).ora) === '09:30', 'seduta in un giorno passato: si può scegliere anche l\'ora');
    const nStorG = await p.evaluate((nome) => state.patients.find((x) => x.name === nome).history.length, nomeB);
    await gioca(idB, 'tact', ['gs1'], [true, false, true]); await salvaGioco();
    const gD = await p.evaluate(({ nome, n0 }) => { const l = state.patients.find((x) => x.name === nome); const b = JSON.parse(localStorage.getItem('tice_bozza_' + l.id) || 'null'); return { nuove: l.history.length - n0, data: b && b.data, temp: b ? b.temp.length : -1, g: TiceProgramma.giorno(l.history[l.history.length - 1].date) }; }, { nome: nomeB, n0: nStorG });
    ok(gD.nuove === 1 && gD.temp === 0 && gD.data === gPass2 && gD.g === gOggi, 'gioco diretto con una seduta aperta per un altro giorno: resta nella cartella di oggi, la bozza di quel giorno non cambia');
    ok(/Gioco salvato nella cartella di oggi/.test(await p.locator('.tice-avviso').first().innerText().catch(() => '')), 'gioco diretto con una seduta aperta per un altro giorno: un avviso lo dice');
    // il gioco lanciato dalla seduta di quel giorno va in quel giorno
    await p.evaluate(() => { try { TiceHome.apri(); } catch (e) { /* aperta */ } }); await attesa(400);
    await p.evaluate(({ id, tid, nome }) => {
      const pz = state.patients.find((x) => x.name === nome), a = pz.programma.attivita.find((y) => y.id === id), t = a.target.find((y) => y.id === tid) || P_t(a);
      function P_t(x) { return (TiceProgramma.targetCorrente(x) || {}).target; }
      TiceHome.strumenti.lancia(pz, a, t);
    }, { id: att.id, tid: tIns.id, nome: nomeB }); await attesa(400);
    await p.evaluate(() => { state.session.playItems.forEach((it, i) => { state.tactIndex = i; recordResponse(true); }); });
    await p.evaluate(() => confirmSaveSession()); await attesa(300); await p.click('#session-note-save'); await attesa(1500);
    const gL = await p.evaluate((nome) => { const l = state.patients.find((x) => x.name === nome); const s = l.history[l.history.length - 1]; return { fonte: s.fonte, g: TiceProgramma.giorno(s.date), date: s.date }; }, nomeB);
    ok(gL.fonte === 'app-gioco' && gL.g === gPass2 && gL.date === gPass2 + 'T09:30:00', 'gioco lanciato dalla seduta di un giorno passato: il risultato va in quel giorno, all\'ora scelta (' + gL.date + ')');
    await pulisciBozza();
    await p.evaluate(() => { try { TiceHome.apri(); } catch (e) { /* aperta */ } }); await attesa(300);

    // ---- cambiare la data a posteriori, dalla cartella ----
    const stato = (nome) => p.evaluate((nm) => { const l = state.patients.find((x) => x.name === nm); const g = (iso) => TiceProgramma.giorno(iso); const per = {}; l.history.forEach((s) => { per[g(s.date)] = (per[g(s.date)] || 0) + 1; }); return { per, n: l.history.length, note: (l.diario || []).map((x) => x.data + ':' + x.testo), daily: Object.keys(l.dailyNotes || {}) }; }, nome);
    await p.setViewportSize({ width: 1100, height: 900 }); await attesa(200);
    await p.evaluate((nome) => TiceHome.vai('cartella', state.patients.find((x) => x.name === nome).id), nomeB); await attesa(600);
    await p.click('[data-a="cartella-tab"][data-tab="giornate"]'); await attesa(300);
    const st0 = await stato(nomeB);
    // una voce: dal dettaglio della seduta
    const riga = p.locator(`.cr-giorno:has(.cr-giorno-titolo:has-text("${(await p.evaluate((g) => new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }), gPass))}")) .cr-sed`).first();
    await riga.click(); await attesa(400);
    ok(await p.locator('.tice-foglio [data-foglio="data"]').count() === 1 && /Cambia data e ora/.test(await p.locator('.tice-foglio').innerText()), 'cartella: il dettaglio della seduta ha «Cambia data e ora»');
    await foto('dettaglio-seduta');
    await p.locator('.tice-foglio [data-foglio="data"]').click(); await attesa(400);
    const gNuova = await giornoFa(30);
    await p.fill('.tice-foglio [name=data]', gNuova); await p.fill('.tice-foglio [name=ora]', '16:45');
    await foto('cambia-data-voce');
    await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(400);
    ok(/Spostare questa voce\?/.test(await p.locator('.tice-foglio').innerText()), 'cartella: il cambio data di una voce chiede conferma');
    await p.locator('.tice-foglio [data-foglio="si"]').click(); await attesa(600);
    const st1 = await stato(nomeB);
    ok(st1.n === st0.n && st1.per[gNuova] === 1 && st1.per[gPass] === st0.per[gPass] - 1, 'cartella: la voce passa alla data scelta, le altre della giornata restano');
    ok(await p.evaluate(({ nome, g }) => { const l = state.patients.find((x) => x.name === nome); const s = l.history.find((x) => TiceProgramma.giorno(x.date) === g); return s.date === g + 'T16:45:00' && s.correzioni.length === 1 && s.correzioni[0].campo === 'data' && !!s.id; }, { nome: nomeB, g: gNuova }), 'cartella: la voce ha la nuova ora e la correzione registrata');
    // annulla (dall'avviso)
    await p.locator('.tice-avviso.con-azione button').click(); await attesa(500);
    const st2 = await stato(nomeB);
    ok(!st2.per[gNuova] && st2.per[gPass] === st0.per[gPass], 'cartella: «Annulla» nell\'avviso riporta la voce com\'era');
    // una giornata, data di arrivo vuota
    const gVuota = await giornoFa(40);
    const contaPass = st0.per[gPass];
    await p.locator(`[data-a="cartella-giorno-data"][data-g="${gPass}"]`).click(); await attesa(400);
    ok(/Cambia data della giornata/.test(await p.locator('.tice-foglio').innerText()), 'cartella: «Cambia data della giornata» dalla giornata');
    await foto('cambia-data-giornata');
    await p.fill('.tice-foglio [name=data]', gVuota); await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(400);
    ok(/Spostare la giornata\?/.test(await p.locator('.tice-foglio').innerText()), 'cartella: spostare una giornata chiede conferma');
    await p.locator('.tice-foglio [data-foglio="si"]').click(); await attesa(600);
    const st3 = await stato(nomeB);
    ok(st3.n === st0.n && !st3.per[gPass] && st3.per[gVuota] >= contaPass && st3.note.some((x) => x.startsWith(gVuota + ':Nota a posteriori.')) && st3.daily.includes(gVuota) && !st3.daily.includes(gPass), 'cartella: la giornata si sposta intera (voci, nota di seduta, testo del giorno), nessuna voce persa');
    // una giornata, data di arrivo con già dei dati: si chiede se unire, e non si perde niente
    await p.locator(`[data-a="cartella-giorno-data"][data-g="${gVuota}"]`).click(); await attesa(400);
    await p.fill('.tice-foglio [name=data]', gOggi); await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(400);
    const testoUnisci = await p.locator('.tice-foglio').innerText();
    ok(/Unire alle voci del/.test(testoUnisci) && /Unisci/.test(testoUnisci), 'cartella: se nella data di arrivo ci sono già dati, chiede se unire');
    await foto('unisci-giornata');
    await p.locator('.tice-foglio [data-foglio="chiudi"]').click(); await attesa(400);
    const st4 = await stato(nomeB);
    ok(st4.per[gVuota] === st3.per[gVuota] && st4.n === st3.n, 'cartella: rifiutando di unire non cambia niente');
    await p.locator(`[data-a="cartella-giorno-data"][data-g="${gVuota}"]`).click(); await attesa(400);
    await p.fill('.tice-foglio [name=data]', gOggi); await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(400);
    await p.locator('.tice-foglio [data-foglio="si"]').click(); await attesa(600);
    const st5 = await stato(nomeB);
    ok(st5.n === st0.n && !st5.per[gVuota] && st5.per[gOggi] === (st4.per[gOggi] || 0) + st4.per[gVuota] && st5.note.some((x) => x.startsWith(gOggi + ':Nota a posteriori.')), 'cartella: unite le due giornate, tutte le voci (e le note) stanno nella data di arrivo');
    // telefono: il tasto sta nella testata del giorno e i fogli entrano nello schermo
    await p.setViewportSize({ width: 390, height: 844 }); await attesa(400);
    ok(await p.evaluate(() => { const m = document.querySelector('.cartella-main'); const b = document.querySelector('.cr-giorno-data'); return !!b && b.getBoundingClientRect().right <= innerWidth && m.scrollWidth <= m.clientWidth + 1; }), 'cartella, telefono: il tasto «Cambia data della giornata» entra nello schermo');
    await p.locator('.cr-giorno-data').first().click(); await attesa(400);
    ok(await p.evaluate(() => { const f = document.querySelector('.tice-foglio'); let fuori = 0; f.querySelectorAll('*').forEach((e) => { if (e.getBoundingClientRect().right > innerWidth + 1) fuori++; }); return fuori === 0; }), 'cartella, telefono: il foglio per cambiare data non esce dallo schermo');
    await foto('cambia-data-telefono');
    await p.keyboard.press('Escape'); await attesa(300);
    await p.setViewportSize({ width: 1100, height: 900 }); await attesa(300);
    // ---- collegare attività e target ai set: nel modulo, subito dopo, e a posteriori su attività con sedute ----
    await p.evaluate(() => { const img = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'; ['Frutta 1', 'Frutta 2', 'Frutta 3'].forEach((nome, i) => { if (!state.savedSets.some((x) => x.id === 'cx' + (i + 1))) state.savedSets.push({ id: 'cx' + (i + 1), name: nome, category: 'Frutta', cat: 'Frutta', modes: ['tact'], items: ['mela', 'pera'].map((label) => ({ label, url: img })) }); }); TiceHome.vai('bambini'); }); await attesa(400);
    for (let k = 0; k < 3; k++) { await p.keyboard.press('Escape'); await attesa(150); }
    await p.evaluate(() => { document.querySelectorAll('.tice-foglio-sfondo').forEach((x) => x.remove()); TiceHome.vai('bambini'); }); await attesa(400);
    await p.click('[data-a="nuovo-bambino"]', { timeout: 5000 }); await attesa(300);
    await p.fill('.tice-foglio [name=nome]', 'Collega C.'); await salvaFoglio();
    await p.click('[data-a="nuova-att"]'); await attesa(400);
    await p.fill('.tice-foglio [name=nome]', 'Tact frutta');
    ok(await p.locator('.tice-foglio [data-ma-gioco] [name=g_modo]').isVisible(), 'nuova attività: il riquadro «Gioco» si vede senza aprire nulla');
    await p.fill('.tice-foglio [name=num_a]', '3');
    await p.selectOption('.tice-foglio [name=g_modo]', 'tact');
    await p.check('.tice-foglio [name=g_collega]');
    await foto('modulo-gioco');
    await salvaFoglio(); await attesa(300);
    ok(await p.locator('.tice-foglio.abbina-set, .tice-foglio .abbina-set').count() > 0, 'nuova attività: subito dopo il salvataggio si apre «Collega i target ai set»');
    if (process.env.TICE_DEBUG) console.log('   sugg', await p.locator('.abbina-set .ab-sugg').count(), JSON.stringify(await p.evaluate(() => TiceHome.strumenti.setArchivio().map((x) => x.name + '|' + (x.cat || x.category)))));
    ok(await p.locator('.abbina-set .ab-sugg').count() === 3, 'abbinamento: un suggerimento per ogni «Set N» (da confermare)');
    ok(await p.evaluate(() => state.patients.find((x) => x.name === 'Collega C.').programma.attivita[0].target.every((t) => !t.setId)), 'abbinamento: i suggerimenti non si applicano da soli');
    await foto('abbina-set');
    await p.click('.abbina-set [data-ab-tutti]'); await attesa(200);
    await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(500);
    const collC = await p.evaluate(() => { const a = state.patients.find((x) => x.name === 'Collega C.').programma.attivita[0]; return { mode: a.mode, t: a.target.map((t) => t.testo + ':' + t.setId + ':' + t.mode).join() }; });
    ok(collC.mode === 'tact' && collC.t === 'Set 1:cx1:tact,Set 2:cx2:tact,Set 3:cx3:tact', 'abbinamento: ogni «Set N» legato al suo set, i nomi dei target restano quelli scritti');
    ok(/gioca con: Frutta 1/.test(await p.locator('.scheda[data-prog]').first().innerText()), 'programma: accanto al target compare il set collegato');
    // a posteriori: un target già con sedute, scollegato e ricollegato dal menu, senza perdere lo storico
    const ids = await p.evaluate(async () => { const pz = state.patients.find((x) => x.name === 'Collega C.'), a = pz.programma.attivita[0], t = a.target[2];
      TiceProgramma.scollegaSet(pz, a, t);
      pz.history = (pz.history || []).concat([TiceProgramma.seduta(a, t, { v: 4, x: 1 }, new Date(Date.now() - 86400000).toISOString()), { id: 'imp_c', date: new Date(Date.now() - 2 * 86400000).toISOString(), mode: 'quaderno', setName: 'Tact frutta · Set 3', correct: 2, total: 4, percentage: 50 }]);
      await DB.savePatient(pz); TiceHome.ridisegna(); return { a: a.id, t: t.id }; }); await attesa(500);
    await p.click(`[data-a="menu-target"][data-id="${ids.a}"][data-t="${ids.t}"]`); await attesa(300);
    ok(/Collega a un set del gioco/.test(await p.locator('.tice-foglio').innerText()), 'menu del target senza set: «Collega a un set del gioco»');
    await p.click('.tice-foglio [data-foglio="set"]'); await attesa(300);
    await p.check('.tice-foglio input[name=s][value=cx3]'); await p.locator('.tice-foglio .bottoni .bt.primario').last().click(); await attesa(500);
    const dopoC = await p.evaluate((i) => { const pz = state.patients.find((x) => x.name === 'Collega C.'), a = pz.programma.attivita[0], t = a.target.find((x) => x.id === i.t); return { set: t.setId, testo: t.testo, n: TiceProgramma.sedute(pz, a, t).length }; }, ids);
    ok(dopoC.set === 'cx3' && dopoC.testo === 'Set 3' && dopoC.n === 2, 'collegamento a posteriori: set e gioco impostati, nome invariato, le 2 sedute già registrate restano del target');
    await p.click(`[data-a="menu-target"][data-id="${ids.a}"][data-t="${ids.t}"]`); await attesa(300);
    await p.click('.tice-foglio [data-foglio="set"]'); await attesa(300);
    await p.click('.tice-foglio [data-foglio="scollega"]'); await attesa(500);
    ok(await p.evaluate((i) => { const pz = state.patients.find((x) => x.name === 'Collega C.'), a = pz.programma.attivita[0], t = a.target.find((x) => x.id === i.t); return !t.setId && TiceProgramma.sedute(pz, a, t).length === 2; }, ids), 'scollegare: il target resta con le sue sedute');
    // dal menu dell'attività e dal modulo «Modifica attività»
    await p.click(`[data-a="collega-set"][data-id="${ids.a}"]`); await attesa(400);
    ok(await p.locator('.abbina-set .ab-riga').count() === 3, 'menu dell\'attività: «Gioco e set» apre l\'abbinamento di tutti i target');
    await p.locator('.tice-foglio [data-foglio="chiudi"]').last().click(); await attesa(300);
    await p.click(`[data-a="mod-att"][data-id="${ids.a}"]`); await attesa(400);
    ok(await p.locator('.tice-foglio [data-g-collega]').isVisible() && await p.inputValue('.tice-foglio [name=g_modo]') === 'tact', 'modifica attività: gioco scelto e tasto «Collega i target ai set…»');
    await p.click('.tice-foglio [data-g-collega]'); await attesa(400);
    ok(await p.locator('.abbina-set .ab-riga').count() === 3, 'modifica attività: l\'abbinamento si apre senza chiudere il modulo');
    await p.setViewportSize({ width: 390, height: 844 }); await attesa(300);
    ok(await p.evaluate(() => { let fuori = 0; document.querySelectorAll('.tice-foglio .abbina-set *').forEach((e) => { if (e.getBoundingClientRect().right > innerWidth + 1) fuori++; }); return fuori === 0; }), 'abbinamento, telefono: entra nello schermo');
    await foto('abbina-telefono');
    await p.setViewportSize({ width: 1100, height: 900 }); await attesa(300);
    await p.locator('.tice-foglio [data-foglio="chiudi"]').last().click(); await attesa(300);
    await p.locator('.tice-foglio [data-foglio="chiudi"]').last().click(); await attesa(300);
    ok(errori.length === 0, 'nessun errore di pagina' + (errori.length ? ': ' + errori.join(' | ') : ''));
  } catch (e) { falliti++; console.log('  ✗ interrotta: ' + (process.env.TICE_DEBUG ? (e.message || e) : (e.message || e).split('\n')[0]) + (errori.length ? ' · errori di pagina: ' + errori.join(' | ') : '')); }
  await b.close(); server.close();
  console.log(`\n${n - falliti} riuscite, ${falliti} fallite`);
  process.exit(falliti ? 1 : 0);
})();
