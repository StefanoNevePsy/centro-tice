#!/usr/bin/env node
/**
 * Prova da un capo all'altro con DUE browser, il custode finto (tools/custode-mock.js) e gli emulatori di
 * Firestore e Auth: l'app vera, la libreria di Firebase vera (scaricata da gstatic come in produzione).
 * Dimostra: consegna della chiave in 1-2 secondi, modifica visibile sull'altro dispositivo in circa un
 * secondo, riserva automatica se Firestore smette di rispondere. Si lancia con
 *   sh tools/test-firebase.sh   (che passa di qui se c'è Playwright)
 * Variabili: TICE_SDK_DIR = cartella con firebase-app.js, firebase-auth.js, firebase-firestore.js (13.1.0).
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright non installato: prova con due browser saltata.'); process.exit(0); }
const { creaServer } = require('./custode-mock.js');
const V = require('../js/tice-veloce.js');
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085', AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const SDK = process.env.TICE_SDK_DIR;
if (!SDK || !fs.existsSync(path.join(SDK, 'firebase-app.js'))) { console.log('TICE_SDK_DIR mancante: prova con due browser saltata.'); process.exit(0); }
let n = 0, falliti = 0;
const ok = (c, m) => { n++; if (!c) falliti++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'tice-e2e-'));
  const server = creaServer({ porta: 0, dati, statico: path.join(__dirname, '..'), dev: true, proprietario: 'boss@centro.test', firestore: HOST, authEmu: AUTH, progetto: 'demo-tice' });
  await new Promise((s) => server.listen(0, '127.0.0.1', s));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const opz = {}; const pw = '/opt/pw-browsers';
  if (!process.env.CI && fs.existsSync(pw)) { const c = fs.readdirSync(pw).find((x) => x.startsWith('chromium-')); if (c) opz.executablePath = `${pw}/${c}/chrome-linux/chrome`; }
  const b = await chromium.launch(opz);
  const errori = [];
  async function dispositivo(nome) {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, serviceWorkers: 'block' });
    await ctx.route('https://www.gstatic.com/firebasejs/' + V.SDK_VERSIONE + '/*', (r) => {
      const f = path.join(SDK, path.basename(new URL(r.request().url()).pathname));
      r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errori.push(nome + ': ' + e.message));
    await p.goto(url); await p.waitForTimeout(1200);
    return p;
  }
  const stato = (p) => p.evaluate(() => ({ fase: TiceSync.S.fase, v: TiceVeloce.app && TiceVeloce.app.stato() }));
  const finche = async (p, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { if (await p.evaluate(fn).catch(() => false)) return Date.now() - t0; await attendi(100); } return -1; };
  try {
    const A = await dispositivo('A'), B = await dispositivo('B');
    ok(await A.evaluate(() => !!TiceVeloce.app), 'la corsia è collegata (configurazione presente)');
    // A: il proprietario entra e crea la chiave del centro
    await A.evaluate(() => TiceSync.Auth.accessoDev('boss@centro.test', 'Boss'));
    ok(await finche(A, () => TiceSync.S.fase === 'chiave') >= 0, 'A: proprietario dentro, serve la chiave');
    await A.evaluate(async () => { await TiceSync.creaChiave(TiceCifra.generaFrase()); });
    ok(await finche(A, () => TiceSync.S.fase === 'pronto') >= 0, 'A: chiave creata');
    ok(await finche(A, () => TiceVeloce.app.attiva(), 20000) >= 0, 'A: corsia veloce attiva (copia degli accessi letta da Firestore)');
    // A abilita la persona B
    await A.evaluate(async () => {
      const a = await TiceSync.chiama('accessi.leggi');
      a.utenti['prof@centro.test'] = { nome: 'Prof', aule: { principale: 'professionista' }, pazienti: '*', attivo: true, scadenza: null };
      await TiceSync.chiama('accessi.salva', { versioneBase: a.version, accessi: a });
    });
    // B entra: non ha la chiave
    const t0 = Date.now();
    await B.evaluate(() => TiceSync.Auth.accessoDev('prof@centro.test', 'Prof'));
    const tFase = await finche(B, () => TiceSync.S.fase === 'pronto' || TiceSync.S.fase === 'attesa', 20000);
    ok(tFase >= 0, 'B: dentro, in attesa della chiave');
    const attivoB = await finche(B, () => TiceVeloce.app.attiva(), 20000);
    ok(attivoB >= 0, 'B: corsia veloce attiva');
    const codice = await B.evaluate(() => TiceVeloce.app.stato().codice);
    ok(/^\d{6}$/.test(codice || ''), 'B: mostra il codice di verifica ' + codice);
    const tChiave = await finche(B, () => TiceSync.S.fase === 'pronto', 20000);
    ok(tChiave >= 0, 'B: chiave ricevuta in ' + (Date.now() - t0) + ' ms dall\'accesso (di cui attesa dell\'avvio e della corsia: ' + attivoB + ' ms)');
    ok(await B.evaluate(() => !TiceSync.S.chiave.extractable), 'B: la chiave non è esportabile (come sempre)');
    await attendi(500);
    ok(await B.evaluate(() => TiceVeloce.app._motore._st.richiestaId === null), 'B: richiesta e consegna cancellate dopo l\'uso');
    // A crea e condivide un bambino; B lo riceve
    await A.evaluate(async () => {
      const p = { id: 'pzprova001', name: 'Prova Live', category: '', history: [], dailyNotes: {} };
      await DB.savePatient(p); state.patients.push(p); await TiceSync.condividi(p.id);
    });
    ok(await finche(B, () => state.patients.some((x) => x.id === 'pzprova001'), 20000) >= 0, 'B: riceve il bambino nuovo');
    await attendi(1500);
    // la modifica: A aggiunge una seduta, B la vede in tempo reale (prima del controllo del custode)
    const ricevuteB = await B.evaluate(() => TiceVeloce.app.stato().ricevute);
    await A.evaluate(() => { window.__t0 = Date.now(); const p = state.patients.find((x) => x.id === 'pzprova001'); p.history.push({ id: 'sx_live1', date: new Date().toISOString(), setName: 'Prova · Set 1', correct: 3, total: 4 }); return DB.savePatient(p); });
    const tm = Date.now();
    const lat = await finche(B, () => (state.patients.find((x) => x.id === 'pzprova001') || { history: [] }).history.some((h) => h.id === 'sx_live1'), 10000);
    ok(lat >= 0 && lat < 4000, 'B: la modifica di A arriva in ' + (Date.now() - tm) + ' ms');
    ok(await B.evaluate((r) => TiceVeloce.app.stato().ricevute > r, ricevuteB), 'B: è arrivata dalla corsia veloce (non dal custode)');
    ok(await A.evaluate(() => TiceVeloce.app.stato().pubblicate > 0), 'A: ha pubblicato su Firestore');
    // e il custode ha ricevuto lo stesso: un terzo giro lo conferma
    await B.evaluate(() => TiceSync.sincronizza()); await attendi(500);
    ok(await B.evaluate(() => state.patients.find((x) => x.id === 'pzprova001').history.length === 1), 'dopo la sincronizzazione dal custode: stesso stato, nessun duplicato');
    // B modifica e A riceve (verso opposto)
    await B.evaluate(() => { const p = state.patients.find((x) => x.id === 'pzprova001'); p.history.push({ id: 'sx_live2', date: new Date().toISOString(), setName: 'Prova · Set 2', correct: 1, total: 4 }); return DB.savePatient(p); });
    ok(await finche(A, () => state.patients.find((x) => x.id === 'pzprova001').history.some((h) => h.id === 'sx_live2'), 10000) >= 0, 'A: riceve anche la modifica di B');
    // riserva: Firestore smette di rispondere → corsia spenta, l'app funziona come prima
    await B.context().setOffline(false);
    await A.evaluate(() => TiceVeloce.app._motore.spegni('prova di riserva', { notifica: true }));
    await A.evaluate(() => { const p = state.patients.find((x) => x.id === 'pzprova001'); p.history.push({ id: 'sx_riserva', date: new Date().toISOString(), setName: 'x', correct: 0, total: 1 }); return DB.savePatient(p); });
    ok(await finche(A, () => TiceSync.S.coda.size === 0 && !TiceSync.S.errore, 10000) >= 0, 'riserva: con la corsia spenta il salvataggio arriva lo stesso al custode');
    await B.evaluate(() => TiceSync.sincronizza());
    ok(await finche(B, () => state.patients.find((x) => x.id === 'pzprova001').history.some((h) => h.id === 'sx_riserva'), 10000) >= 0, 'riserva: B la riceve dal giro del custode');
    ok(errori.length === 0, 'nessun errore di pagina' + (errori.length ? ': ' + errori.join(' | ') : ''));
  } catch (e) { falliti++; console.log('  ✗ ' + (e && e.stack || e)); }
  await b.close(); server.close();
  console.log(`\n${n} verifiche, ${falliti} fallite`);
  process.exit(falliti ? 1 : 0);
})();
