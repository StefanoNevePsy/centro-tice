#!/usr/bin/env node
/**
 * Schermate della guida del Centro TICE, prese dall'app vera con dati inventati.
 *
 *   python3 -m http.server 4192 --bind 127.0.0.1   (dalla cartella del progetto)
 *   node tools/guida/schermate.js <cartella di uscita>
 *
 * Nessun dato reale: i bambini, le persone e le sedute sono creati qui.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(process.argv[2] || 'guida-img');
const URL = process.env.TICE_URL || 'http://127.0.0.1:4192/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(OUT, { recursive: true });

async function semina(p) {
  await p.evaluate(async () => {
    const P = TiceProgramma, T = TiceTurni;
    const giorno = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(15, 20, 0, 0); return d.toISOString(); };
    const nuovo = (id, name, extra) => Object.assign({ id, name, history: [], nascita: '2020-03-02' }, extra || {});
    const luca = nuovo('pz_luca', 'Luca R.'), sara = nuovo('pz_sara', 'Sara B.'), omar = nuovo('pz_omar', 'Omar K.'), eric = nuovo('pz_eric', 'Eric M.'), vale = nuovo('pz_vale', 'Valentina P.');

    // Luca: un programma completo
    const ves = P.nuovaAttivita(luca, { nome: 'Vestiti', prove: 20, sessionType: 'timedelay', tdSeconds: 1, modalita: 'velocita', variante: 'intensiva' });
    ['Set 1', 'Set 2', 'Set 3'].forEach((x, i) => P.aggiungiTarget(ves, x, i === 0));
    ves.condizioni = { V: 'nomina entro 1″ senza aiuto', P: 'nomina dopo il modello' };
    const seq = P.nuovaAttivita(luca, { nome: 'Sequenze temporali', prove: 10, modalita: 'sequenze' });
    P.aggiungiTarget(seq, 'Lavarsi i denti', true); P.aggiungiTarget(seq, 'Fare merenda', false);
    seq.field = 3; seq.promptVisivo = 'prima | poi | dopo';
    seq.misure = [{ id: 'ms1', nome: 'Riordina' }, { id: 'ms2', nome: 'Racconta', field: 1 }];
    seq.condizioni = { V: 'ordina le 3 carte giuste', X: 'ha bisogno di prompt [X] | [X] | [X] (campanella)' };
    seq.suggerimenti = 'Presenta le tre carte in ordine casuale.\nSe sbaglia, rimetti le carte e riprova una volta sola.';
    const mand = P.nuovaAttivita(luca, { nome: 'Richieste', modalita: 'mand' });
    P.aggiungiTarget(mand, 'Acqua', true);
    const tav = P.nuovaAttivita(luca, { nome: 'Condizionamento tavolo' });
    P.aggiungiTarget(tav, 'Puzzle', true); P.aggiungiTarget(tav, 'Tombola', false);
    tav.condizioni = { V: 'un pezzo messo restando seduto', X: 'si alza o lascia il gioco' };
    const mani = P.nuovaAttivita(luca, { nome: 'Autonomie', prove: 0, modalita: 'task-analysis' });
    P.aggiungiTarget(mani, 'Lavarsi le mani', true);
    mani.target[0].passi = P.nuoviPassi(['Apre il rubinetto', 'Bagna le mani', 'Prende il sapone', 'Strofina', 'Risciacqua', 'Si asciuga'], []);
    // storia: sedute degli ultimi due mesi, i set arrivano a criterio uno dopo l'altro
    let d = 60;
    ves.target.forEach((t, i) => {
      t.inizio = getDateKey(giorno(d));
      const n = [14, 10][i];
      for (let j = 0; j < (n || 8); j++) {
        if (d < 1) break;
        const pct = Math.min(100, 35 + Math.round(60 * j / (n || 12)) + (j % 3) * 4);
        const v = Math.round(pct / 5);
        luca.history.push(P.seduta(ves, t, { v, p: 20 - v, x: 0, sessionType: 'timedelay' }, giorno(d)));
        d -= 2;
      }
      if (n) { t.stato = 'criterio'; t.fine = getDateKey(giorno(d + 2)); if (ves.target[i + 1]) ves.target[i + 1].stato = 'attivo'; }
    });
    for (let k = 30; k > 0; k -= 3) luca.history.push(P.seduta(seq, seq.target[0], { v: 6 + (k % 4), p: 0, x: 4 - (k % 4) }, giorno(k)));
    luca.dailyNotes = { [getDateKey(giorno(2))]: 'Seduta tranquilla, buona attenzione al tavolo. Rinforzo: bolle di sapone.' };

    // un gruppo
    const g = nuovo('g_soc', 'Abilità sociali', { gruppo: true, membri: ['pz_sara', 'pz_omar', 'pz_eric'] });
    const ga = P.nuovaAttivita(g, { nome: 'Rispetto del turno', prove: 5, modalita: 'gioco' });
    P.aggiungiTarget(ga, 'Gioco da tavolo', true);
    ga.misure = g.membri.map((id) => ({ id, nome: { pz_sara: 'Sara B.', pz_omar: 'Omar K.', pz_eric: 'Eric M.' }[id], bambino: true }));
    for (const x of [luca, sara, omar, eric, vale, g]) { state.patients.push(x); await DB.savePatient(x); }

    // turni: persone e settimana tipo
    const dow = ((new Date().getDay() + 6) % 7) + 1;
    let m = T.modelloVuoto();
    for (const dd of [1, 2, 3, 4, 5, 6, 7]) {
      m = T.impostaModello(m, 'pz_luca', dd, { da: '14:10', a: '16:00', persone: ['p1'] });
      m = T.impostaModello(m, 'g_soc', dd, { da: '14:10', a: '15:00', persone: ['p2', 'p3'] });
      m = T.impostaModello(m, 'pz_sara', dd, { da: '15:10', a: '16:00', persone: ['p2'] });
      if (dd % 2) m = T.impostaModello(m, 'pz_eric', dd, { da: '16:20', a: '18:00', persone: ['p1', 'p3'] });
      m = T.impostaModello(m, 'pz_vale', dd, { da: '17:10', a: '18:00', persone: ['p4'] });
    }
    localStorage.setItem('tice_turni', JSON.stringify({ modello: m, persone: { persone: [
      { id: 'p1', nome: 'Monica R.', ruolo: 'terapeuta' }, { id: 'p2', nome: 'Alice T.', ruolo: 'terapeuta' },
      { id: 'p3', nome: 'Greta (tirocinio)', ruolo: 'tirocinante' }, { id: 'p4', nome: 'Elisa M.', ruolo: 'terapeuta' }] } }));
    localStorage.setItem('tice_operatore', 'Monica R.');
    void dow;
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'light', hasTouch: true });
  await ctx.route('**/tice-config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.TICE_CONFIG={custodeUrl:'',googleClientId:''};" }));
  const p = await ctx.newPage();
  const err = []; p.on('pageerror', (e) => err.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(URL); await p.waitForTimeout(1800);
  await semina(p);
  await p.reload(); await p.waitForTimeout(2000);

  const chiudiFogli = async () => { while (await p.locator('.tice-foglio').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); if (await p.locator('.tice-foglio [data-foglio="si"]').count()) await p.click('.tice-foglio [data-foglio="si"]'); } };
  const alto = async (h) => { await p.setViewportSize({ width: 390, height: h }); await p.waitForTimeout(250); };
  const foto = async (nome, fn, opz = {}) => {
    try {
      await alto(opz.alto || 844);
      if (fn) await fn();
      await p.waitForTimeout(opz.attesa || 700);
      if (opz.elemento) await p.locator(opz.elemento).first().screenshot({ path: path.join(OUT, nome + '.png') });
      else await p.screenshot({ path: path.join(OUT, nome + '.png') });
      console.log('✓', nome);
    } catch (e) { console.log('✗', nome, e.message.split('\n')[0]); }
    if (!opz.tieni) await chiudiFogli();
  };
  const vai = (v, pid) => p.evaluate(([v, pid]) => { TiceHome.strumenti.T.aperte = {}; TiceHome.vai(v, pid); }, [v, pid]);
  const apri = (id) => p.evaluate((id) => { const T = TiceHome.strumenti.T; T.aperte = {}; T.aperte[id] = true; TiceHome.ridisegna(); }, id);
  const attId = (nome) => p.evaluate(([pid, nome]) => state.patients.find((x) => x.id === pid).programma.attivita.find((a) => a.nome === nome).id, ['pz_luca', nome]);

  await foto('01-calendario', () => vai('turni'), { alto: 900 });
  await foto('02-calendario-modifica', async () => { await vai('turni'); await p.waitForTimeout(400); await p.click('[data-a="tt-modifica"]'); await p.waitForTimeout(300); await p.click('[data-a="tt-pennello"] >> nth=0'); }, { alto: 1100 });
  await p.evaluate(() => { const T = TiceHome; T.ridisegna(); });
  await foto('03-settimana-tipo', () => vai('turni-modello'), { alto: 760 });
  await foto('04-orario-bambino', async () => { await vai('turni-modello'); await p.waitForTimeout(400); await p.click('[data-a="tt-mcella"] >> nth=0'); }, { alto: 900, tieni: false });
  await foto('05-elenco', () => vai('bambini'), { alto: 760 });
  await foto('06-menu', async () => { await vai('bambini'); await p.waitForTimeout(300); await p.click('[data-a="menu"]'); }, { alto: 900 });

  // seduta
  await foto('10-seduta', () => vai('seduta', 'pz_luca'), { alto: 1300 });
  const idVes = await attId('Vestiti'), idSeq = await attId('Sequenze temporali'), idTA = await attId('Autonomie');
  await foto('11-seduta-tasti', async () => {
    await vai('seduta', 'pz_luca'); await p.waitForTimeout(300); await apri(idVes); await p.waitForTimeout(300);
    for (const r of ['V', 'V', 'P', 'V']) await p.click(`.att[data-att="${idVes}"] .tasto[data-r=${r}]`);
  }, { alto: 900, elemento: `.att[data-att="${idVes}"]` });
  await foto('12-sottoattivita', async () => { await apri(idSeq); await p.waitForTimeout(300); await p.click(`.att[data-att="${idSeq}"] [data-a="suggerimenti"]`); }, { alto: 1300, elemento: `.att[data-att="${idSeq}"]` });
  await foto('13-task-analysis', async () => { await apri(idTA); await p.waitForTimeout(300); await p.click(`.att[data-att="${idTA}"] .tasto[data-r=V]`); }, { alto: 900, elemento: `.att[data-att="${idTA}"]` });
  await foto('14-nota', async () => { await apri(idVes); await p.waitForTimeout(300); await p.click(`.att[data-att="${idVes}"] [data-a="nota-voce"]`); await p.waitForTimeout(300); await p.click('.tice-foglio details summary'); }, { alto: 1000 });
  await foto('15-fine-seduta', async () => { await p.click('[data-a="termina"]'); }, { alto: 900, tieni: true });
  await foto('16-timbro', async () => { await p.click('.tice-foglio .bottoni button.primario'); }, { alto: 844, attesa: 450 });
  await foto('17-gruppo', async () => { await vai('seduta', 'g_soc'); await p.waitForTimeout(400); const c = p.locator('.att').first(); if (!await c.locator('.tasto').count()) await c.locator('.att-testa').click(); }, { alto: 844 });

  // programma
  await foto('20-programma', () => vai('programma', 'pz_luca'), { alto: 1500 });
  await foto('21-nuova-attivita', async () => { await vai('programma', 'pz_luca'); await p.waitForTimeout(300); await p.click('[data-a="nuova-att"]'); }, { alto: 2300, elemento: '.tice-foglio' });
  await foto('22-scelta-modalita', async () => { await vai('programma', 'pz_luca'); await p.waitForTimeout(300); await p.click('[data-a="nuova-att"]'); await p.waitForTimeout(300); await p.click('.tice-foglio .scegli-mod'); await p.waitForTimeout(300); await p.fill('[data-mod-cerca]', 'ta'); }, { alto: 900 });
  await foto('23-menu-target', async () => { await vai('programma', 'pz_luca'); await p.waitForTimeout(300); await p.locator('li', { hasText: 'Tombola' }).locator('[data-a="menu-target"]').click(); }, { alto: 1000 });
  await foto('24-condizioni-target', async () => { await vai('programma', 'pz_luca'); await p.waitForTimeout(300); await p.locator('li', { hasText: 'Tombola' }).locator('[data-a="menu-target"]').click(); await p.waitForTimeout(300); await p.click('.tice-foglio [data-foglio="condizioni"]'); await p.waitForTimeout(200); await p.fill('.tice-foglio [name=cV]', 'una casella segnata restando seduto'); }, { alto: 760 });
  await foto('25-modalita', async () => { await vai('bambini'); await p.waitForTimeout(300); await p.click('[data-a="menu"]'); await p.waitForTimeout(300); await p.click('.tice-foglio [data-foglio="modalita"]'); }, { alto: 1100 });

  // stampa
  await foto('26-stampa', async () => {
    await p.setViewportSize({ width: 1100, height: 800 });
    await p.evaluate(() => {
      const pz = state.patients.find((x) => x.id === 'pz_luca');
      let box = document.getElementById('tice-stampa'); if (!box) { box = document.createElement('div'); box.id = 'tice-stampa'; document.body.appendChild(box); }
      box.innerHTML = TiceStampa.html(pz, { sedute: 4, prossimi: true }, { P: TiceProgramma, M: TiceModalita });
      document.documentElement.classList.add('tice-stampa-in-corso');
    });
    await p.emulateMedia({ media: 'print' });
  }, { alto: 800, elemento: '#tice-stampa', tieni: true });
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => { document.documentElement.classList.remove('tice-stampa-in-corso'); document.getElementById('tice-stampa').innerHTML = ''; });

  // cartella clinica
  const cartella = async (tab) => {
    await p.evaluate(() => { try { closePatients(); } catch (e) { /* niente */ } }); await p.waitForTimeout(400);
    await vai('seduta', 'pz_luca'); await p.waitForTimeout(300);
    await p.click('[data-a="apri-cartella"]'); await p.waitForTimeout(1200);
    if (tab) { await p.click(`.report-tab[data-tab="${tab}"]`); await p.waitForTimeout(900); }
  };
  await foto('30-cartella', () => cartella(null), { alto: 1500 });
  await foto('31-giornate', () => cartella('dates'), { alto: 1100 });
  await foto('32-visual', async () => { await cartella('viz'); await p.evaluate(() => selectVizView('tice-tempo', 'pz_luca')); }, { alto: 1300 });
  await foto('33-visual-criterio', async () => { await cartella('viz'); await p.evaluate(() => selectVizView('tice-acquisiti', 'pz_luca')); }, { alto: 1300 });
  await p.evaluate(() => { try { closePatients(); } catch (e) { /* niente */ } });

  console.log(err.length ? 'errori: ' + err.join(' | ') : 'nessun errore');
  await b.close();
})();
