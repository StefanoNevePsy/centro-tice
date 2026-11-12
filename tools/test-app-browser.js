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
    ok(errori.length === 0, 'nessun errore di pagina' + (errori.length ? ': ' + errori.join(' | ') : ''));
  } catch (e) { falliti++; console.log('  ✗ interrotta: ' + (e.message || e).split('\n')[0] + (errori.length ? ' · errori di pagina: ' + errori.join(' | ') : '')); }
  await b.close(); server.close();
  console.log(`\n${n - falliti} riuscite, ${falliti} fallite`);
  process.exit(falliti ? 1 : 0);
})();
