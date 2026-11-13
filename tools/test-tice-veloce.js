#!/usr/bin/env node
/**
 * Test della corsia veloce senza rete: la logica di js/tice-veloce.js con un backend e una
 * sincronizzazione finti, e la copia degli accessi del custode (custode/core.js).
 * Le regole vere si provano con l'emulatore: sh tools/test-firebase.sh
 */
'use strict';
const assert = require('assert');
const V = require('../js/tice-veloce.js');
const QT = require('../custode/core.js');

let passati = 0; const falliti = [];
async function prova(nome, fn) {
  try { await fn(); passati++; console.log('  ✓ ' + nome); } catch (e) { falliti.push(nome); console.log('  ✗ ' + nome + '\n      ' + (e && e.stack || e)); }
}
const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms || 5));

// ---------------------------------------------------------------- finti
function backendFinto() {
  const b = { docs: {}, ascolti: [], scritture: [], errore: null, _u: null, inizializzato: 0 };
  const guasto = () => { if (b.errore) { const e = b.errore; throw e; } };
  return Object.assign(b, {
    inizializza: async () => { b.inizializzato++; },
    utente: () => b._u,
    accedi: async (t) => { guasto(); b._u = { email: JSON.parse(t).email }; return b._u; },
    esci: async () => { b._u = null; },
    scrivi: async (c, id, d) => { guasto(); b.docs[c + '/' + id] = d; b.scritture.push([c, id]); },
    elimina: async (c, id) => { delete b.docs[c + '/' + id]; },
    leggi: async (c, id) => { guasto(); return b.docs[c + '/' + id] || null; },
    pubblicaModifica: async (meta, busta) => { guasto(); b.docs['modifiche/' + meta.pid] = meta; b.docs['buste/' + meta.pid] = busta; b.scritture.push(['modifica', meta.pid]); },
    ascolta: (spec, cb, ko) => { const a = { spec, cb, ko, chiuso: false }; b.ascolti.push(a); return () => { a.chiuso = true; }; },
    attivi: () => b.ascolti.filter((a) => !a.chiuso),
  });
}
function syncFinto(opz) {
  const x = Object.assign({
    email: 'ann@c.test', fase: 'pronto', pronto: true, eAdmin: false, persone: [], chiaveEsportabile: false,
    io: { email: 'ann@c.test', funzioni: ['veloce'], veloce: { progetto: 'p1' }, cifratura: true, pazienti: '*',
      aule: { principale: { ruolo: 'professionista', permessi: { vediTutti: false } } } },
    aulaDi: {}, info: {}, condivisi: new Set(), versioni: {}, applicati: [], token: JSON.stringify({ email: 'ann@c.test' }), manuale: false,
    chiaviRicevute: [], cifrate: [], abilitate: [], notifiche: 0,
  }, opz || {});
  return Object.assign(x, {
    contesto: () => ({ email: x.email, io: x.io, pronto: x.pronto, fase: x.fase, aulaDi: x.aulaDi, info: x.info, condivisi: x.condivisi, eAdmin: x.eAdmin,
      persone: x.persone, chiaveEsportabile: x.chiaveEsportabile, kid: 'k1', cfgChiave: true }),
    idToken: () => x.token, dispositivo: async () => ({ id: x.idDisp || 'dispaaaa1111', pubblica: 'QUJDREVG' }), nomeDispositivo: () => 'Prova',
    versioneLocale: async (pid) => x.versioni[pid] || 0,
    applica: async (pid, v, busta) => { x.applicati.push({ pid, v, busta }); x.versioni[pid] = v; return true; },
    chiaveRicevuta: async (busta, kid) => { x.chiaviRicevute.push({ busta, kid }); return kid === 'k1'; },
    cifraChiaveA: async (p) => { x.cifrate.push(p); return 'BUSTA-PER-' + p; },
    abilitaSuCustode: async (o) => { x.abilitate.push(o); }, aggiornaPersone: async () => {}, consegnaManuale: () => x.manuale, cambiato: () => { x.notifiche++; },
  });
}
const nuovo = (opzSync, opzMot) => {
  const backend = backendFinto(), sync = syncFinto(opzSync), mem = {};
  const motore = V.creaMotore(Object.assign({ cfg: { projectId: 'p1', apiKey: 'k', appId: 'a' }, backend, sync, ora: () => 1700000000000,
    memoria: { leggi: (k) => mem[k] || null, scrivi: (k, v) => { mem[k] = v; } } }, opzMot || {}));
  backend.docs['accessi/ann@c.test'] = { attivo: true };
  return { backend, sync, motore, mem };
};

(async function () {
  console.log('\nFunzioni pure');
  await prova('configurata solo con apiKey, projectId e appId', () => {
    assert.ok(!V.configurata(undefined) && !V.configurata({}) && !V.configurata({ apiKey: '', projectId: '', appId: '' }));
    assert.ok(V.configurata({ apiKey: 'a', projectId: 'p', appId: 'x' }));
  });
  await prova('il codice di verifica è di 6 cifre, stabile e dipende dalla chiave pubblica', async () => {
    const a = await V.codiceVerifica('QUJDREVG'), b = await V.codiceVerifica('QUJDREVG'), c = await V.codiceVerifica('QUJDREVH');
    assert.ok(/^\d{6}$/.test(a)); assert.strictEqual(a, b); assert.notStrictEqual(a, c);
    assert.strictEqual(V.formatoCodice('012345'), '012 345');
  });
  const ctx = (o) => Object.assign({ io: { pazienti: '*', aule: { principale: { permessi: { vediTutti: true } } } }, aulaDi: {}, info: {}, condivisi: new Set() }, o);
  await prova('chi vede tutta l\'aula: una richiesta per aula, solo i non riservati', () => {
    const p = V.pianoAscolto(ctx({ io: { pazienti: [], aule: { principale: { permessi: { vediTutti: true } }, b: { permessi: { vediTutti: true } } } } }));
    assert.deepStrictEqual(p.map((s) => s.filtri), [[['aula', '==', 'b'], ['riservato', '==', false]], [['aula', '==', 'principale'], ['riservato', '==', false]]]);
  });
  await prova('chi vede solo alcuni bambini: pid in [...] a gruppi di 30, per aula', () => {
    const pids = Array.from({ length: 65 }, (_, i) => 'pz' + String(i).padStart(3, '0'));
    const aulaDi = {}; pids.forEach((x, i) => { aulaDi[x] = i < 40 ? 'principale' : 'b'; });
    const p = V.pianoAscolto({ io: { pazienti: pids, aule: { principale: { permessi: {} }, b: { permessi: {} } } }, aulaDi, info: {}, condivisi: new Set(pids) });
    const dim = p.map((s) => s.filtri[2][2].length);
    assert.deepStrictEqual(dim.sort((a, b) => a - b), [10, 25, 30]);
    assert.ok(p.every((s) => s.filtri[0][0] === 'aula' && s.filtri[1][2] === false && s.filtri[2][1] === 'in'));
    assert.strictEqual(new Set(p.map((s) => s.k)).size, p.length);
  });
  await prova('i riservati: un ascolto per bambino, mai dentro «pid in»; un bambino di un\'aula non mia non c\'è', () => {
    const p = V.pianoAscolto({ io: { pazienti: ['x1'], aule: { principale: { permessi: {} } } }, aulaDi: { x1: 'principale', r1: 'principale', z: 'altra' },
      info: { r1: { riservato: true }, z: { riservato: true } }, condivisi: new Set(['x1', 'r1']) });
    assert.deepStrictEqual(p.map((s) => s.filtri.map((f) => f.join(' ')).join('|')), [
      'aula == principale|riservato == false|pid in x1', 'aula == principale|riservato == true|pid == r1']);
  });
  await prova('la modifica ha avviso e busta con gli stessi campi; il tempo lo mette il server; scade fra 3 giorni', () => {
    const m = V.costruisciModifica({ pid: 'p', aula: 'b', riservato: true, version: 3, email: 'a@b.it', disp: 'd', busta: { v: 1 }, adesso: 1000 });
    assert.strictEqual(m.meta.ts, V.ORA); assert.strictEqual(m.busta.ts, V.ORA);
    assert.strictEqual(m.meta.scade.$ms, 1000 + V.RITENZIONE_MS);
    assert.deepStrictEqual(m.busta.busta, { v: 1 }); assert.strictEqual(m.meta.riservato, true); assert.ok(!m.troppoGrande);
    assert.ok(V.costruisciModifica({ pid: 'p', version: 1, email: 'a', busta: { d: 'x'.repeat(V.MAX_BUSTA) }, adesso: 1 }).troppoGrande);
  });
  await prova('classificaErrore: quota fino a domani, permessi, rete, libreria', () => {
    assert.ok(V.classificaErrore({ code: 'resource-exhausted' }).finoADomani);
    assert.ok(/permessi/.test(V.classificaErrore({ code: 'permission-denied' }).motivo));
    assert.ok(V.classificaErrore({ code: 'unavailable' }).rete);
    assert.ok(V.classificaErrore({ code: 'sdk' }).rete);
    assert.ok(V.classificaErrore({ code: 'auth/invalid-credential' }).serveAccesso);
  });

  console.log('\nAvvio e spegnimento');
  await prova('senza configurazione non fa niente', async () => {
    const t = nuovo(); const m = V.creaMotore({ cfg: {}, backend: t.backend, sync: t.sync });
    assert.strictEqual(await m.avvia(), false); assert.strictEqual(t.backend.inizializzato, 0);
  });
  await prova('custode non aggiornato o di un altro progetto: spenta, con il motivo', async () => {
    let t = nuovo({ io: { email: 'ann@c.test', funzioni: ['aule'], aule: {} } });
    assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /custode.*aggiornato/);
    t = nuovo({ io: { email: 'ann@c.test', funzioni: ['veloce'], veloce: { progetto: 'altro' }, aule: {} } });
    assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /altro progetto/);
    assert.strictEqual(t.backend.inizializzato, 0);
  });
  await prova('si collega con l\'ID token di Google, poi ascolta ciò che il piano prevede', async () => {
    const t = nuovo({ io: { email: 'ann@c.test', funzioni: ['veloce'], veloce: { progetto: 'p1' }, pazienti: '*', aule: { principale: { permessi: { vediTutti: true } } } } });
    assert.strictEqual(await t.motore.avvia(), true);
    assert.strictEqual(t.backend._u.email, 'ann@c.test'); assert.ok(t.motore.attiva());
    assert.strictEqual(t.backend.attivi().length, 1);
  });
  await prova('senza ID token fresco: spenta con «serve un nuovo accesso», e riparte dopo', async () => {
    const t = nuovo({ token: null });
    assert.strictEqual(await t.motore.avvia(), false);
    assert.ok(t.motore.stato().serveAccesso); assert.match(t.motore.stato().motivo, /accesso con Google/);
    t.sync.token = JSON.stringify({ email: 'ann@c.test' });
    assert.strictEqual(await t.motore.avvia({ forza: true }), true);
  });
  await prova('Firebase già collegato (sessione conservata): niente token richiesto', async () => {
    const t = nuovo({ token: null }); t.backend._u = { email: 'ann@c.test' };
    assert.strictEqual(await t.motore.avvia(), true);
  });
  await prova('un altro account Google su Firebase: spenta', async () => {
    const t = nuovo({ token: JSON.stringify({ email: 'altro@c.test' }) });
    assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /non coincide/);
  });
  await prova('copia degli accessi mancante: spenta con il motivo', async () => {
    const t = nuovo(); delete t.backend.docs['accessi/ann@c.test'];
    assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /copiato gli accessi/);
  });
  await prova('SDK non caricato (errore all\'inizializzazione): spenta, nessuna eccezione', async () => {
    const t = nuovo(); t.backend.inizializza = async () => { const e = new Error('x'); e.code = 'sdk'; throw e; };
    assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /libreria/);
  });
  await prova('quota esaurita: spenta fino a domani, anche dopo un nuovo avvio; poi «Riprova» la riaccende', async () => {
    const t = nuovo(); await t.motore.avvia();
    await t.motore.pubblica({ pid: 'p', version: 1, busta: { v: 1 } });
    t.backend.errore = { code: 'resource-exhausted' };
    assert.strictEqual(await t.motore.pubblica({ pid: 'p', version: 2, busta: { v: 1 } }), false);
    assert.ok(!t.motore.attiva()); assert.match(t.motore.stato().motivo, /domani/);
    t.backend.errore = null;
    assert.strictEqual(await t.motore.avvia(), false);
    assert.strictEqual(await t.motore.avvia({ forza: true }), true);
  });
  await prova('un errore nell\'ascolto (permessi) spegne e chiude tutti gli ascolti', async () => {
    const t = nuovo({ io: { email: 'ann@c.test', funzioni: ['veloce'], veloce: { progetto: 'p1' }, pazienti: '*', aule: { principale: { permessi: { vediTutti: true } }, b: { permessi: { vediTutti: true } } } } });
    await t.motore.avvia(); const a = t.backend.attivi(); assert.strictEqual(a.length, 2);
    a[0].ko({ code: 'permission-denied' });
    assert.ok(!t.motore.attiva()); assert.strictEqual(t.backend.attivi().length, 0);
  });

  console.log('\nModifiche');
  const attiva = async (o) => { const t = nuovo(Object.assign({ io: { email: 'ann@c.test', funzioni: ['veloce'], veloce: { progetto: 'p1' }, pazienti: '*', aule: { principale: { permessi: { vediTutti: true } } } } }, o || {})); await t.motore.avvia(); await attendi(20); return t; };
  await prova('pubblica busta e avviso con aula e riservato del bambino', async () => {
    const t = await attiva({ aulaDi: { p1: 'b' }, info: { p1: { riservato: true } } });
    assert.strictEqual(await t.motore.pubblica({ pid: 'p1', version: 4, busta: { v: 1, dati: 'x' } }), true);
    const m = t.backend.docs['modifiche/p1'];
    assert.strictEqual(m.aula, 'b'); assert.strictEqual(m.riservato, true); assert.strictEqual(m.v, 4); assert.strictEqual(m.da, 'ann@c.test'); assert.strictEqual(m.disp, 'dispaaaa1111');
    assert.deepStrictEqual(t.backend.docs['buste/p1'].busta, { v: 1, dati: 'x' });
  });
  await prova('spenta non pubblica; busta troppo grande resta solo sul custode senza spegnere', async () => {
    const t = await attiva();
    assert.strictEqual(await t.motore.pubblica({ pid: 'p1', version: 1, busta: { d: 'x'.repeat(V.MAX_BUSTA) } }), false);
    assert.ok(t.motore.attiva()); assert.strictEqual(t.backend.scritture.length, 0);
    t.motore.spegni('prova'); assert.strictEqual(await t.motore.pubblica({ pid: 'p1', version: 1, busta: {} }), false);
  });
  await prova('una modifica degli altri si applica una volta sola, e solo se è più nuova di ciò che ho', async () => {
    const t = await attiva();
    t.backend.docs['buste/p1'] = { pid: 'p1', v: 5, busta: { v: 1, dati: 'n' } };
    const cambi = (v, disp) => t.backend.attivi()[0].cb([{ tipo: 'added', id: 'p1', dati: { pid: 'p1', v, disp: disp || 'altro' } }]);
    cambi(5); await attendi(); cambi(5); cambi(4); await attendi();
    assert.strictEqual(t.sync.applicati.length, 1); assert.strictEqual(t.sync.applicati[0].v, 5);
    t.sync.versioni.p2 = 9; t.backend.attivi()[0].cb([{ tipo: 'added', id: 'p2', dati: { pid: 'p2', v: 7, disp: 'altro' } }]); await attendi();
    assert.strictEqual(t.sync.applicati.length, 1, 'già aggiornato localmente');
  });
  await prova('le proprie modifiche (stesso dispositivo) non si riapplicano', async () => {
    const t = await attiva();
    t.backend.attivi()[0].cb([{ tipo: 'added', id: 'p1', dati: { pid: 'p1', v: 3, disp: 'dispaaaa1111' } }]); await attendi();
    assert.strictEqual(t.sync.applicati.length, 0);
  });
  await prova('gli ascolti seguono l\'elenco dei bambini (si aggiungono e si tolgono)', async () => {
    const t = nuovo({ io: { email: 'ann@c.test', funzioni: ['veloce'], veloce: { progetto: 'p1' }, pazienti: ['p1'], aule: { principale: { permessi: {} } } }, aulaDi: { p1: 'principale' }, condivisi: new Set(['p1']) });
    await t.motore.avvia(); assert.strictEqual(t.backend.attivi().length, 1);
    t.sync.aulaDi.p2 = 'principale'; t.sync.condivisi.add('p2'); t.motore.ricalcola();
    assert.strictEqual(t.backend.attivi().length, 1); assert.deepStrictEqual(t.backend.attivi()[0].spec.filtri[2][2], ['p1', 'p2']);
    t.sync.condivisi.clear(); t.motore.ricalcola(); assert.strictEqual(t.backend.attivi().length, 0);
  });

  console.log('\nChiave');
  await prova('dispositivo senza chiave: scrive la richiesta con il proprio codice e ascolta la consegna', async () => {
    const t = await attiva({ fase: 'attesa', pronto: false });
    const r = t.backend.docs['richieste/dispaaaa1111'];
    assert.strictEqual(r.email, 'ann@c.test'); assert.strictEqual(r.pubblica, 'QUJDREVG'); assert.strictEqual(r.aula, 'principale');
    assert.strictEqual(t.motore.stato().codice, await V.codiceVerifica('QUJDREVG'));
    const asc = t.backend.attivi().find((a) => a.spec.coll === 'consegne'); assert.deepStrictEqual(asc.spec.filtri, [['email', '==', 'ann@c.test']]);
    asc.cb([{ tipo: 'added', id: 'dispaaaa1111', dati: { busta: 'B64', kid: 'k1' } }]); await attendi(20);
    assert.deepStrictEqual(t.sync.chiaviRicevute, [{ busta: 'B64', kid: 'k1' }]);
    assert.ok(!t.backend.docs['richieste/dispaaaa1111'] && !t.backend.docs['consegne/dispaaaa1111'], 'ripulite dopo l\'uso');
    assert.strictEqual(t.motore.stato().codice, null);
  });
  await prova('una consegna per un altro dispositivo o con un\'altra chiave non conta', async () => {
    const t = await attiva({ fase: 'attesa', pronto: false });
    const asc = t.backend.attivi().find((a) => a.spec.coll === 'consegne');
    asc.cb([{ tipo: 'added', id: 'altrodisp1234', dati: { busta: 'B', kid: 'k1' } }]); await attendi(20);
    assert.strictEqual(t.sync.chiaviRicevute.length, 0);
    asc.cb([{ tipo: 'added', id: 'dispaaaa1111', dati: { busta: 'B', kid: 'k9' } }]); await attendi(20);
    assert.ok(t.backend.docs['richieste/dispaaaa1111'], 'resta in attesa della chiave giusta');
  });
  const admin = (o) => attiva(Object.assign({ email: 'ann@c.test', eAdmin: true, chiaveEsportabile: true, persone: [{ email: 'lia@c.test' }],
    io: { email: 'ann@c.test', funzioni: ['veloce'], veloce: { progetto: 'p1' }, pazienti: '*', aule: { principale: { permessi: { vediTutti: true, gestisciAccessi: true } }, b: { permessi: {} } } } }, o));
  const arriva = (t, id, dati) => t.backend.attivi().find((a) => a.spec.coll === 'richieste').cb([{ tipo: 'added', id, dati }]);
  await prova('admin con la chiave: ascolta le richieste delle proprie aule e consegna in automatico a chi è abilitato', async () => {
    const t = await admin();
    assert.deepStrictEqual(t.backend.attivi().filter((a) => a.spec.coll === 'richieste').map((a) => a.spec.filtri[0][2]), ['principale']);
    t.backend.docs['richieste/dispbbbb2222'] = { email: 'lia@c.test' };
    arriva(t, 'dispbbbb2222', { email: 'lia@c.test', aula: 'principale', pubblica: 'PUBB', nome: 'Tel' }); await attendi(30);
    const c = t.backend.docs['consegne/dispbbbb2222'];
    assert.strictEqual(c.busta, 'BUSTA-PER-PUBB'); assert.strictEqual(c.email, 'lia@c.test'); assert.strictEqual(c.da, 'ann@c.test'); assert.strictEqual(c.kid, 'k1');
    assert.ok(!t.backend.docs['richieste/dispbbbb2222']);
    assert.strictEqual(t.sync.abilitate[0].id, 'dispbbbb2222');
  });
  await prova('chi non è nell\'elenco degli accessi conosciuto non riceve la chiave', async () => {
    const t = await admin();
    arriva(t, 'dispcccc3333', { email: 'sconosciuto@x.it', aula: 'principale', pubblica: 'PUBC', nome: 'Tel' }); await attendi(30);
    assert.ok(!t.backend.docs['consegne/dispcccc3333']); assert.strictEqual(t.sync.cifrate.length, 0);
  });
  await prova('con la consegna manuale la richiesta aspetta il tasto, con il codice di verifica', async () => {
    const t = await admin({ manuale: true });
    arriva(t, 'dispdddd4444', { email: 'lia@c.test', aula: 'principale', pubblica: 'PUBD', nome: 'Tel' }); await attendi(30);
    assert.ok(!t.backend.docs['consegne/dispdddd4444']);
    const l = t.motore.richieste(); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].codice, await V.codiceVerifica('PUBD'));
    assert.strictEqual(await t.motore.consegna('dispdddd4444'), true);
    assert.strictEqual(t.backend.docs['consegne/dispdddd4444'].busta, 'BUSTA-PER-PUBD'); assert.strictEqual(t.motore.richieste().length, 0);
  });
  await prova('un dispositivo la cui chiave non è esportabile non ascolta le richieste', async () => {
    const t = await admin({ chiaveEsportabile: false });
    assert.strictEqual(t.backend.attivi().filter((a) => a.spec.coll === 'richieste').length, 0);
  });
  await prova('la chiave arrivata dal custode toglie la richiesta su Firestore', async () => {
    const t = await attiva({ fase: 'attesa', pronto: false });
    assert.ok(t.backend.docs['richieste/dispaaaa1111']);
    t.motore.chiaveArrivata(); await attendi(20);
    assert.ok(!t.backend.docs['richieste/dispaaaa1111']);
  });

  console.log('\nCopia degli accessi (custode)');
  const accessi = { aule: { principale: { nome: 'Centro' }, b: { nome: 'B' } }, utenti: {
    'adm@c.t': { nome: 'A', aule: { principale: 'admin' }, pazienti: '*' },
    'pro@c.t': { nome: 'P', aule: { principale: 'professionista', b: 'tirocinante', fantasma: 'admin' }, pazienti: ['x2', 'x1'], scadenza: '2026-12-31' },
    'off@c.t': { nome: 'O', aule: { principale: 'admin' }, pazienti: '*', attivo: false },
    'old@c.t': { nome: 'V', aule: { principale: 'admin' }, pazienti: '*', scadenza: '2026-01-01' },
    'boss@c.t': { nome: 'Boss', aule: { b: 'tirocinante' }, pazienti: [] } } };
  const elenco = { pazienti: { x1: { id: 'x1', aula: 'principale' }, r1: { id: 'r1', riservato: true, creatoDa: 'adm@c.t', condivisi: ['pro@c.t', 'a@c.t'] }, y1: { id: 'y1', aula: 'b', eliminato: true } } };
  await prova('la copia segue utenteDa e vede: ruoli per aula, attivo, scadenza, proprietario, riservati', () => {
    const d = QT.copiaFirestore(accessi, elenco, 'boss@c.t', '2026-11-13');
    assert.deepStrictEqual(Object.keys(d).filter((k) => k.startsWith('accessi/')).sort(), ['accessi/adm@c.t', 'accessi/boss@c.t', 'accessi/pro@c.t']);
    const adm = d['accessi/adm@c.t']; assert.deepStrictEqual([adm.vedeTutte, adm.gestisce, adm.scrivono, adm.tutti], [['principale'], ['principale'], ['principale'], true]);
    const pro = d['accessi/pro@c.t'];
    assert.deepStrictEqual(pro.aule, { principale: 'professionista', b: 'tirocinante' }); assert.deepStrictEqual(pro.vedeTutte, []); assert.deepStrictEqual(pro.gestisce, []);
    assert.deepStrictEqual(pro.pazienti, ['x1', 'x2']); assert.strictEqual(pro.tutti, false); assert.strictEqual(pro.scadeIl.$ts, '2027-01-01T00:00:00.000Z');
    const boss = d['accessi/boss@c.t']; assert.strictEqual(boss.proprietario, true); assert.deepStrictEqual(boss.aule, { principale: 'admin', b: 'admin' }); assert.ok(boss.tutti && boss.scadeIl.$ts.startsWith('2100'));
    assert.deepStrictEqual(d['pazienti/r1'], { aula: 'principale', riservato: true, creatoDa: 'adm@c.t', condivisi: ['a@c.t', 'pro@c.t'], eliminato: false });
    assert.deepStrictEqual(d['pazienti/x1'], { aula: 'principale', riservato: false, creatoDa: '', condivisi: [], eliminato: false });
    assert.strictEqual(d['pazienti/y1'].aula, 'b');
  });
  await prova('la codifica per l\'API REST di Firestore (tipi, timestamp, liste e mappe vuote)', () => {
    const c = QT.fsCampi({ s: 'a', b: true, n: 3, l: [], m: {}, t: { $ts: '2026-01-01T00:00:00.000Z' }, x: ['u'] });
    assert.deepStrictEqual(c, { s: { stringValue: 'a' }, b: { booleanValue: true }, n: { integerValue: '3' }, l: { arrayValue: {} }, m: { mapValue: {} },
      t: { timestampValue: '2026-01-01T00:00:00.000Z' }, x: { arrayValue: { values: [{ stringValue: 'u' }] } } });
    const w = QT.fsCommit('p', { 'a/b': { k: 1 } }, ['c/d']).writes;
    assert.strictEqual(w[0].update.name, 'projects/p/databases/(default)/documents/a/b'); assert.strictEqual(w[1]['delete'], 'projects/p/databases/(default)/documents/c/d');
  });

  // ---------------------------------------------------------------- accesso silenzioso (One Tap / FedCM)
  const DAY = 86400000, T0 = 1700000000000;
  const base = { configurata: true, stato: { attiva: false, serveAccesso: true, fisso: false }, email: 'ann@c.test', online: true, disponibile: true, giaProvato: false, ultimoFallimento: 0, ora: T0 };
  await prova('silenzioso: decide di tentare solo se manca soltanto l\'accesso Firebase', () => {
    assert.strictEqual(V.decidiSilenzioso(base).tenta, true);
    const no = (m, perche) => assert.deepStrictEqual([V.decidiSilenzioso(Object.assign({}, base, m)).tenta, V.decidiSilenzioso(Object.assign({}, base, m)).perche], [false, perche]);
    no({ configurata: false }, 'non-configurata');
    no({ email: '' }, 'senza-email');
    no({ stato: { attiva: true, serveAccesso: false } }, 'gia-attiva');
    no({ stato: { attiva: false, serveAccesso: false } }, 'non-serve');      // quota, rete, permessi...
    no({ stato: { attiva: false, serveAccesso: true, fisso: true } }, 'non-serve');
    no({ disponibile: false }, 'ambiente');                                   // desktop, APK, sviluppo
    no({ online: false }, 'offline');
    no({ giaProvato: true }, 'gia-provato');
  });
  await prova('silenzioso: raffreddamento di un giorno dopo un tentativo fallito', () => {
    assert.strictEqual(V.decidiSilenzioso(Object.assign({}, base, { ultimoFallimento: T0 - 3600000 })).perche, 'raffreddamento');
    assert.strictEqual(V.decidiSilenzioso(Object.assign({}, base, { ultimoFallimento: T0 - DAY + 1 })).tenta, false);
    assert.strictEqual(V.decidiSilenzioso(Object.assign({}, base, { ultimoFallimento: T0 - DAY })).tenta, true);
    assert.strictEqual(V.decidiSilenzioso(Object.assign({}, base, { ultimoFallimento: String(T0 - 2 * DAY) })).tenta, true);   // da localStorage è una stringa
    assert.strictEqual(V.decidiSilenzioso(Object.assign({}, base, { ultimoFallimento: T0 + 5 * DAY })).tenta, true);          // orologio spostato: non resta bloccato
  });
  await prova('silenzioso: stessa email (maiuscole e spazi ininfluenti), vuota mai', () => {
    assert.ok(V.stessaEmail(' Ann@C.test', 'ann@c.test'));
    assert.ok(!V.stessaEmail('bea@c.test', 'ann@c.test'));
    assert.ok(!V.stessaEmail('', ''));
  });
  const silenzioso = (opz) => {
    const mem = {}; let t = T0, chiamate = 0, avvisi = [], avviate = 0;
    const o = Object.assign({
      stato: { attiva: false, serveAccesso: true }, esito: { esito: 'ok', email: 'ann@c.test' }, avviaOk: true, mem,
    }, opz || {});
    const s = V.creaSilenzioso({
      configurata: true, stato: () => o.stato, email: () => 'ann@c.test', online: () => true, disponibile: () => o.disponibile !== false, ora: () => t,
      memoria: { leggi: (k) => mem[k] || null, scrivi: (k, v) => { mem[k] = v; } },
      tenta: async () => { chiamate++; if (o.lancia) throw new Error('x'); return o.esito; },
      avvia: async () => { avviate++; return o.avviaOk; }, avviso: (m) => avvisi.push(m),
    });
    return { s, mem, avvisi, avanza: (ms) => { t += ms; }, chiamate: () => chiamate, avviate: () => avviate };
  };
  await prova('silenzioso: riesce -> avvia la corsia, avviso discreto, nessun raffreddamento', async () => {
    const x = silenzioso();
    assert.strictEqual(await x.s.prova(), 'attivata');
    assert.deepStrictEqual(x.avvisi, ['Corsia veloce attivata']);
    assert.ok(!x.mem.silenzioso);
    assert.strictEqual(x.avviate(), 1);
  });
  await prova('silenzioso: token di un\'altra email scartato, la corsia non parte, si ricorda il fallimento', async () => {
    const x = silenzioso({ esito: { esito: 'ok', email: 'bea@c.test' } });
    assert.strictEqual(await x.s.prova(), 'diversa');
    assert.strictEqual(x.avviate(), 0); assert.deepStrictEqual(x.avvisi, []);
    assert.strictEqual(x.mem.silenzioso, String(T0));
  });
  await prova('silenzioso: non mostrato / annullato / scaduto / errore: nessun avviso, ricorda il fallimento, una volta per sessione', async () => {
    for (const e of ['non-mostrato', 'annullato', 'scaduto', 'errore']) {
      const x = silenzioso({ esito: { esito: e } });
      assert.strictEqual(await x.s.prova(), e);
      assert.strictEqual(x.mem.silenzioso, String(T0)); assert.deepStrictEqual(x.avvisi, []); assert.strictEqual(x.avviate(), 0);
      assert.strictEqual(await x.s.prova(), 'gia-provato'); assert.strictEqual(x.chiamate(), 1);
    }
    const y = silenzioso({ lancia: true });
    assert.strictEqual(await y.s.prova(), 'errore');
  });
  await prova('silenzioso: ambiente senza Google (desktop, APK) non tenta e non scrive nulla', async () => {
    const x = silenzioso({ disponibile: false });
    assert.strictEqual(await x.s.prova(), 'ambiente'); assert.strictEqual(x.chiamate(), 0); assert.ok(!x.mem.silenzioso);
    const y = silenzioso({ esito: { esito: 'non-disponibile' } });
    assert.strictEqual(await y.s.prova(), 'non-disponibile'); assert.ok(!y.mem.silenzioso);
  });
  await prova('silenzioso: token ottenuto ma corsia ancora spenta -> nessun avviso; già attiva o non serve -> niente', async () => {
    const x = silenzioso({ avviaOk: false });
    assert.strictEqual(await x.s.prova(), 'ok-ma-spenta'); assert.deepStrictEqual(x.avvisi, []);
    const y = silenzioso({ stato: { attiva: true } });
    assert.strictEqual(await y.s.prova(), 'gia-attiva'); assert.strictEqual(y.chiamate(), 0);
    const z = silenzioso({ stato: { attiva: false, serveAccesso: false } });
    assert.strictEqual(await z.s.prova(), 'non-serve'); assert.strictEqual(z.chiamate(), 0);
  });
  await prova('silenzioso: dopo un fallimento in una sessione nuova si riprova solo dopo un giorno', async () => {
    const x = silenzioso({ esito: { esito: 'annullato' } });
    await x.s.prova();
    const mem = x.mem;
    const nuova = (ms) => V.creaSilenzioso({ configurata: true, stato: () => ({ serveAccesso: true }), email: () => 'ann@c.test', online: () => true, disponibile: () => true, ora: () => T0 + ms,
      memoria: { leggi: (k) => mem[k] || null, scrivi: (k, v) => { mem[k] = v; } }, tenta: async () => ({ esito: 'ok', email: 'ann@c.test' }), avvia: async () => true, avviso: () => {} });
    assert.strictEqual(await nuova(3600000).prova(), 'raffreddamento');
    assert.strictEqual(await nuova(DAY + 1).prova(), 'attivata');
  });

  // ---------------------------------------------------------------- Auth.accessoSilenzioso con un GIS finto
  {
    const vm = require('vm'), fs = require('fs'), path = require('path');
    const jwt = (email, exp) => 'e30.' + Buffer.from(JSON.stringify({ email, exp: exp || Math.floor(Date.now() / 1000) + 3600, given_name: 'X' })).toString('base64url') + '.f';
    const ambiente = (extra) => {
      const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; };
      const gis = { init: null, prompt: null, chiamate: 0 };
      const w = Object.assign({ console, setTimeout, clearTimeout, atob, decodeURIComponent, localStorage: mem(), sessionStorage: mem(), navigator: { onLine: true }, isSecureContext: true,
        document: { head: { appendChild() {} }, createElement: () => ({}), addEventListener() {} }, addEventListener() {}, matchMedia: () => ({ matches: false }),
        location: { hash: '', origin: 'http://x', pathname: '/' }, history: {}, crypto: require('crypto').webcrypto,
        TICE_CONFIG: { googleClientId: 'cid', custodeUrl: 'https://x/exec' }, TiceCifra: {}, TiceUnisci: {},
        google: { accounts: { id: { initialize: (c) => { gis.init = c; }, prompt: (cb) => { gis.chiamate++; gis.prompt = cb; }, renderButton() {}, disableAutoSelect() {} } } } }, extra || {});
      w.window = w; vm.createContext(w);
      w.localStorage.setItem('tice:utente', JSON.stringify({ email: 'ann@c.test', nome: 'Ann' }));
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'tice-sync.js'), 'utf8'), w);
      w.TiceSync.Auth.inizia();
      return { w, gis, Auth: w.TiceSync.Auth };
    };
    const momento = (o) => Object.assign({ isNotDisplayed: () => false, isSkippedMoment: () => false, isDismissedMoment: () => false }, o);
    await prova('GIS: initialize con auto_select, FedCM, itp, login_hint e cancel_on_tap_outside', async () => {
      const { gis } = ambiente(); await attendi(20);
      assert.deepStrictEqual([gis.init.auto_select, gis.init.use_fedcm_for_prompt, gis.init.itp_support, gis.init.cancel_on_tap_outside, gis.init.login_hint, gis.init.client_id],
        [true, true, true, true, 'ann@c.test', 'cid']);
    });
    await prova('GIS: stessa email -> ok, il token vale ma la sessione lunga del custode resta', async () => {
      const { w, gis, Auth } = ambiente();
      w.localStorage.setItem('tice:sessione', JSON.stringify({ token: 'S', scade: 9999999999 }));
      assert.ok(Auth.silenziosoDisponibile());
      const p = Auth.accessoSilenzioso('Ann@C.test'); await attendi(20);
      assert.strictEqual(gis.chiamate, 1);
      gis.init.callback({ credential: jwt('ann@c.test') });
      const r = await p; assert.deepStrictEqual([r.esito, r.email], ['ok', 'ann@c.test']);
      assert.ok(Auth.idToken()); assert.ok(w.localStorage.getItem('tice:sessione'));
    });
    await prova('GIS: email diversa -> scartata, identità e token invariati', async () => {
      const { gis, Auth } = ambiente();
      const p = Auth.accessoSilenzioso('ann@c.test'); await attendi(20);
      gis.init.callback({ credential: jwt('bea@c.test') });
      assert.strictEqual((await p).esito, 'diversa');
      assert.strictEqual(Auth.idToken(), null); assert.strictEqual(Auth.utente().email, 'ann@c.test');
    });
    await prova('GIS: non mostrato / saltato / chiuso senza credenziale -> esito senza errori; credential_returned aspetta la callback', async () => {
      for (const [n, atteso] of [[momento({ isNotDisplayed: () => true, getNotDisplayedReason: () => 'browser_not_supported' }), 'non-mostrato'], [momento({ isSkippedMoment: () => true }), 'annullato'],
        [momento({ isDismissedMoment: () => true, getDismissedReason: () => 'cancel_called' }), 'annullato']]) {
        const { gis, Auth } = ambiente();
        const p = Auth.accessoSilenzioso('ann@c.test'); await attendi(20);
        gis.prompt(n);
        assert.strictEqual((await p).esito, atteso);
      }
      const { gis, Auth } = ambiente();
      const p = Auth.accessoSilenzioso('ann@c.test'); await attendi(20);
      gis.prompt(momento({ isDismissedMoment: () => true, getDismissedReason: () => 'credential_returned' }));
      gis.init.callback({ credential: jwt('ann@c.test') });
      assert.strictEqual((await p).esito, 'ok');
    });
    await prova('GIS: non disponibile in sviluppo, nell\'app desktop e nell\'APK (Capacitor)', async () => {
      for (const extra of [{ TICE_CONFIG: { googleClientId: 'cid', dev: true } }, { ticeNativo: {}, TICE_CONFIG: { googleClientId: 'cid', googleDesktopClientId: 'd' } },
        { Capacitor: { isNativePlatform: () => true } }, { TICE_CONFIG: { googleClientId: '' } }, { isSecureContext: false }]) {
        const { gis, Auth } = ambiente(extra);
        assert.ok(!Auth.silenziosoDisponibile());
        assert.strictEqual((await Auth.accessoSilenzioso('ann@c.test')).esito, 'non-disponibile'); assert.strictEqual(gis.chiamate, 0);
      }
    });
  }

  console.log(`\n${passati} prove superate, ${falliti.length} fallite`);
  if (falliti.length) { console.log('Fallite:\n - ' + falliti.join('\n - ')); process.exit(1); }
})();
