#!/usr/bin/env node
/**
 * Prova della corsia veloce con l'emulatore di Firebase (Firestore + Auth): regole, custode e client veri.
 * Non gira dentro tools/test-tutti.sh perché richiede Java e le librerie di Firebase: si lancia con
 *
 *   sh tools/test-firebase.sh
 *
 * che avvia gli emulatori e passa di qui (vedi docs/firebase.md, «Provare tutto in locale»).
 *
 * Cosa dimostra, con il custode VERO (core.js) che scrive la copia degli accessi nell'emulatore:
 *  - per ogni persona (ruolo, aula, bambini assegnati, riservati, attiva/scaduta) le richieste di
 *    tice-veloce.js ricevono ESATTAMENTE i bambini che il custode farebbe vedere con `pazienti.elenco`;
 *  - nessuno legge i bambini che il custode non farebbe vedere, né scrive per loro;
 *  - nessun client scrive la copia degli accessi; il custode la aggiorna a ogni cambio;
 *  - la richiesta della chiave è solo a proprio nome e la consegna la legge solo il richiedente.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QT = require('../custode/core.js');
const { archivioSuDisco, cacheInMemoria, sha256Hex, firestoreEmulatore } = require('./custode-mock.js');
const V = require('../js/tice-veloce.js');

const HOST = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const PROGETTO = process.env.GCLOUD_PROJECT || 'demo-tice';
const PROP = 'boss@centro.test';

function carica(nome) { return require(nome); }
const { initializeTestEnvironment } = carica('@firebase/rules-unit-testing');
const sdk = { app: carica('firebase/app'), auth: carica('firebase/auth'), firestore: carica('firebase/firestore') };

let passati = 0; const fallimenti = [];
async function prova(nome, fn) {
  try { await fn(); passati++; console.log('  ✓ ' + nome); }
  catch (e) { fallimenti.push(nome); console.log('  ✗ ' + nome + '\n      ' + (e && e.stack || e)); }
}
const nega = async (p, nome) => {
  try { await p; } catch (e) { if (/permission-denied|PERMISSION_DENIED|insufficient/i.test(String(e && (e.code || e.message)))) return; throw e; }
  throw new Error('atteso permission-denied: ' + nome);
};

// ---------------------------------------------------------------- custode con copia su emulatore
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tice-fb-'));
const emu = firestoreEmulatore(HOST, PROGETTO);
const custode = QT.creaCustode({
  archivio: archivioSuDisco(dir), cache: cacheInMemoria(),
  verificaToken: (t) => { const [email, nome] = t.slice(4).split('|'); return { email, nome: nome || email }; },
  proprietario: () => PROP, ora: () => new Date().toISOString(), sha256Hex, specchio: emu,
  ricordo: { leggi: () => null, scrivi: () => {} },
});
const chiama = (email, azione, dati) => custode.gestisci({ v: 1, token: 'dev:' + email, azione, dati });
const ok = (r) => { assert.ok(r.ok, `atteso ok, ricevuto ${r.errore}: ${r.messaggio}`); return r.dati; };
const CHIAVE = crypto.randomBytes(32);
function busta(o, aad) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', CHIAVE, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const d = Buffer.concat([c.update(JSON.stringify(o)), c.final(), c.getAuthTag()]);
  return { v: 1, alg: 'A256GCM', kid: 'k1', iv: iv.toString('base64'), comp: 'no', dati: d.toString('base64') };
}
const CIFR = { kid: 'k1', kdf: { nome: 'PBKDF2-SHA256', iterazioni: 600000, sale: crypto.randomBytes(16).toString('base64') }, verifica: busta({ tice: 'ok' }) };
const crea = (email, pid, extra) => ok(chiama(email, 'paziente.crea', Object.assign({ id: pid, busta: busta({ id: pid }, 'tice:paziente:' + pid), etichetta: busta({ nome: pid }, 'tice:etichetta:' + pid) }, extra || {})));
const ieri = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10), domani = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);

const U = {
  admin1: 'admin1@centro.test', prof1: 'prof1@centro.test', prof2: 'prof2@centro.test', tiro1: 'tiro1@centro.test',
  adminb: 'adminb@centro.test', inatt: 'inattivo@centro.test', scad: 'scaduto@centro.test', fut: 'futuro@centro.test', estr: 'estraneo@centro.test',
};
const P = { a1: 'pz_aula_a1', a2: 'pz_aula_a2', a3: 'pz_aula_a3', b1: 'pz_aula_b1', r1: 'pz_riserv1', r2: 'pz_riserv2', s1: 'pz_sposta1' };

async function main() {
  console.log('\nPreparazione: regole, custode, accessi, bambini');
  const env = await initializeTestEnvironment({ projectId: PROGETTO, firestore: { host: HOST.split(':')[0], port: Number(HOST.split(':')[1]), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
  await env.clearFirestore();
  ok(chiama(PROP, 'cifratura.imposta', { cifratura: CIFR }));
  ok(chiama(PROP, 'accessi.salva', { versioneBase: 0, accessi: {
    aule: { principale: { nome: 'Centro' }, b: { nome: 'Aula B' } },
    utenti: {
      [U.admin1]: { nome: 'Admin 1', aule: { principale: 'admin' }, pazienti: '*' },
      [U.prof1]: { nome: 'Prof 1', aule: { principale: 'professionista' }, pazienti: [] },
      [U.prof2]: { nome: 'Prof 2', aule: { principale: 'professionista', b: 'professionista' }, pazienti: '*' },
      [U.tiro1]: { nome: 'Tiro 1', aule: { principale: 'tirocinante' }, pazienti: [] },
      [U.adminb]: { nome: 'Admin B', aule: { b: 'admin' }, pazienti: '*' },
      [U.inatt]: { nome: 'Inattivo', aule: { principale: 'admin' }, pazienti: '*', attivo: false },
      [U.scad]: { nome: 'Scaduto', aule: { principale: 'professionista' }, pazienti: '*', scadenza: ieri },
      [U.fut]: { nome: 'Futuro', aule: { principale: 'professionista' }, pazienti: '*', scadenza: domani },
    } } }));
  crea(U.admin1, P.a1); crea(U.admin1, P.a2); crea(U.admin1, P.a3);
  crea(PROP, P.b1, { aula: 'b' });
  crea(U.prof2, P.r1, { riservato: true });          // riservato di prof2, non condiviso
  crea(U.admin1, P.r2, { riservato: true });         // riservato di admin1…
  ok(chiama(U.admin1, 'paziente.condivisione', { id: P.r2, riservato: true, condivisi: [U.prof1] }));   // …condiviso con prof1
  crea(U.admin1, P.s1);
  // prof1 vede solo a1 e r2 (condiviso); tiro1 solo a2
  const acc = ok(chiama(PROP, 'accessi.leggi'));
  acc.utenti[U.prof1].pazienti = [P.a1]; acc.utenti[U.tiro1].pazienti = [P.a2];
  ok(chiama(PROP, 'accessi.salva', { versioneBase: acc.version, accessi: acc }));
  const tutti = Object.values(P);

  // modifiche già presenti per ogni bambino (come se qualcuno avesse salvato), scritte senza regole
  const elencoCompleto = () => QT.PERCORSI && JSON.parse(fs.readFileSync(path.join(dir, 'Pazienti', '_elenco.json'), 'utf8')).pazienti;
  async function semina() {
    const el = elencoCompleto();
    await env.withSecurityRulesDisabled(async (c) => {
      for (const pid of Object.keys(el)) {
        const base = { pid, aula: el[pid].aula || 'principale', riservato: !!el[pid].riservato, v: 5, da: 'altro@centro.test', ts: new Date(), scade: new Date(Date.now() + 86400000) };
        await c.firestore().doc('modifiche/' + pid).set(Object.assign({ disp: 'altro' }, base));
        await c.firestore().doc('buste/' + pid).set(Object.assign({ busta: { v: 1, dati: 'x' } }, base));
      }
    });
  }
  await semina();

  // ---------------------------------------------------------------- client veri
  const cfg = { apiKey: 'demo', authDomain: 'localhost', projectId: PROGETTO, appId: 'demo', emulatore: { firestore: HOST, auth: 'http://' + AUTH } };
  let n = 0;
  async function cliente(email) {
    const b = V.creaBackendFirebase(sdk, cfg, { nome: 'c' + (++n), persistenza: 'memoria' });
    await b.inizializza();
    await b.accedi(JSON.stringify({ sub: 'u-' + email, email, email_verified: true }));
    return b;
  }
  const raccogli = (b, spec) => new Promise((ok2, ko) => {
    const visti = new Set(); let annulla;
    annulla = b.ascolta(spec, (cambi) => { cambi.forEach((x) => visti.add(x.id)); setTimeout(() => { annulla && annulla(); ok2(visti); }, 50); }, (e) => ko(e));
  });
  function contestoDi(email) {
    const io = ok(chiama(email, 'io'));
    const el = ok(chiama(email, 'pazienti.elenco'));
    const aulaDi = {}, info = {};
    el.forEach((v) => { aulaDi[v.id] = v.aula || 'principale'; if (v.riservato) info[v.id] = { riservato: true }; });
    return { io, el, ctx: { io, aulaDi, info, condivisi: new Set(el.map((v) => v.id)) } };
  }

  console.log('\nChi vede cosa: le richieste del client contro il custode');
  for (const [nome, email] of Object.entries({ admin1: U.admin1, prof1: U.prof1, prof2: U.prof2, tiro1: U.tiro1, adminb: U.adminb, fut: U.fut, proprietario: PROP })) {
    await prova(`${nome}: riceve esattamente i bambini che il custode gli fa vedere`, async () => {
      const { el, ctx } = contestoDi(email);
      const atteso = new Set(el.map((v) => v.id));
      const b = await cliente(email);
      const piano = V.pianoAscolto(ctx);
      assert.ok(piano.length > 0, 'nessun ascolto previsto');
      const visti = new Set();
      for (const spec of piano) (await raccogli(b, spec)).forEach((x) => visti.add(x));
      assert.deepStrictEqual([...visti].sort(), [...atteso].sort());
      // e i bambini non visibili sono negati anche uno per uno
      for (const pid of tutti.filter((x) => !atteso.has(x))) {
        await nega(b.leggi('buste', pid), nome + ' legge ' + pid);
        await nega(b.leggi('modifiche', pid), nome + ' legge modifiche ' + pid);
      }
      for (const pid of atteso) assert.ok(await b.leggi('buste', pid), 'busta di ' + pid);
    });
  }
  await prova('prof1 (solo a1 + riservato condiviso r2): non vede a2, a3, r1, b1', async () => {
    const { el } = contestoDi(U.prof1);
    assert.deepStrictEqual(el.map((v) => v.id).sort(), [P.a1, P.r2].sort());
  });
  for (const [nome, email] of [['disattivato', U.inatt], ['scaduto', U.scad], ['estraneo', U.estr]]) {
    await prova(`${nome}: non legge niente (nemmeno una query per aula)`, async () => {
      const b = await cliente(email);
      await nega(raccogli(b, { coll: 'modifiche', filtri: [['aula', '==', 'principale'], ['riservato', '==', false]] }), nome + ' query');
      await nega(b.leggi('buste', P.a1), nome + ' busta');
      await nega(b.pubblicaModifica(...Object.values(V.costruisciModifica({ pid: P.a1, aula: 'principale', version: 9, email, disp: 'x', busta: { v: 1 }, adesso: Date.now() })).slice(0, 2)), nome + ' scrive');
    });
  }
  await prova('una query più larga di quanto le regole garantiscono è negata (le regole non sono filtri)', async () => {
    const b = await cliente(U.prof1);
    await nega(raccogli(b, { coll: 'modifiche', filtri: [['aula', '==', 'principale'], ['riservato', '==', false]] }), 'prof1 aula intera');
    await nega(raccogli(b, { coll: 'modifiche', filtri: [['aula', '==', 'principale'], ['riservato', '==', false], ['pid', 'in', [P.a1, P.a2]]] }), 'prof1 con a2');
    await nega(raccogli(b, { coll: 'modifiche', filtri: [['aula', '==', 'principale'], ['riservato', '==', true], ['pid', '==', P.r1]] }), 'prof1 riservato altrui');
  });
  await prova('admin dell\'aula NON vede i riservati altrui (come il custode)', async () => {
    const b = await cliente(U.admin1);
    await nega(b.leggi('buste', P.r1), 'admin1 legge r1');
    assert.ok(await b.leggi('buste', P.r2));
  });
  await prova('il proprietario non vede i riservati altrui', async () => {
    const { el } = contestoDi(PROP);
    assert.ok(!el.some((v) => v.id === P.r1 || v.id === P.r2));
    const b = await cliente(PROP);
    await nega(b.leggi('buste', P.r1), 'proprietario legge r1');
  });

  console.log('\nScrittura delle modifiche');
  const pub = (b, email, pid, extra) => {
    const m = V.costruisciModifica(Object.assign({ pid, aula: 'principale', riservato: false, version: 6, email, disp: 'd1', busta: { v: 1, kid: 'k1', dati: 'AAAA' }, adesso: Date.now() }, extra || {}));
    return b.pubblicaModifica(m.meta, m.busta);
  };
  await prova('chi vede il bambino e registra sedute pubblica (anche tirocinante); poi lo legge chi deve', async () => {
    await pub(await cliente(U.tiro1), U.tiro1, P.a2);
    await pub(await cliente(U.prof1), U.prof1, P.a1);
    const b = await cliente(U.admin1);
    const x = await b.leggi('modifiche', P.a2);
    assert.strictEqual(x.da, U.tiro1);
    assert.ok(x.ts > 0 && x.scade > Date.now());
  });
  await prova('non si pubblica per bambini che non si vedono, né con aula o riservato falsi, né a nome di altri', async () => {
    const t = await cliente(U.tiro1), p1 = await cliente(U.prof1), p2 = await cliente(U.prof2);
    await nega(pub(t, U.tiro1, P.a1), 'tiro1 su a1');
    await nega(pub(p1, U.prof1, P.r1), 'prof1 su riservato altrui');
    await nega(pub(p1, U.prof1, P.a1, { aula: 'b' }), 'aula falsa');
    await nega(pub(p2, U.prof2, P.r1, { riservato: false }), 'riservato dichiarato falso');
    await nega(pub(p1, U.prof1, P.a1, { email: U.admin1 }), 'a nome di altri');
    await pub(p2, U.prof2, P.r1, { riservato: true });
  });
  await prova('il riservato condiviso lo ricevono solo i condivisi', async () => {
    await pub(await cliente(U.admin1), U.admin1, P.r2, { riservato: true });
    const { ctx } = contestoDi(U.prof1);
    const v = await raccogli(await cliente(U.prof1), V.pianoAscolto(ctx).find((s) => s.filtri.some((f) => f[2] === P.r2)));
    assert.ok(v.has(P.r2));
  });
  await prova('scadenza di cleanup obbligatoria e limitata; niente campi extra; ts è l\'ora del server', async () => {
    const b = await cliente(U.admin1);
    const m = V.costruisciModifica({ pid: P.a1, aula: 'principale', version: 7, email: U.admin1, disp: 'd', busta: { v: 1 }, adesso: Date.now() });
    await nega(b.pubblicaModifica(Object.assign({}, m.meta, { scade: { $ms: Date.now() + 30 * 86400000 } }), m.busta), 'scadenza lontana');
    await nega(b.pubblicaModifica(Object.assign({}, m.meta, { extra: 1 }), m.busta), 'campo extra');
    await nega(b.pubblicaModifica(Object.assign({}, m.meta, { ts: { $ms: 5 } }), m.busta), 'ts del client');
  });

  console.log('\nLa copia degli accessi');
  await prova('nessun client scrive o legge la copia (solo la propria persona legge il proprio documento)', async () => {
    const b = await cliente(U.admin1);
    const { firestore: F } = sdk, db = b._db();
    await nega(F.setDoc(F.doc(db, 'accessi', U.admin1), { email: U.admin1, attivo: true }), 'scrive accessi');
    await nega(F.setDoc(F.doc(db, 'accessi', U.estr), { email: U.estr, attivo: true }), 'crea accessi');
    await nega(F.setDoc(F.doc(db, 'pazienti', 'x'), { aula: 'principale' }), 'scrive pazienti');
    await nega(F.deleteDoc(F.doc(db, 'accessi', U.admin1)), 'cancella accessi');
    await nega(b.leggi('accessi', U.prof1), 'legge accessi altrui');
    await nega(b.leggi('pazienti', P.a1), 'legge pazienti');
    const mio = await b.leggi('accessi', U.admin1);
    assert.deepStrictEqual(mio.aule, { principale: 'admin' });
    assert.strictEqual(mio.tutti, true);
  });
  await prova('la copia segue il custode: chi viene disattivato perde subito la lettura', async () => {
    const b = await cliente(U.fut);
    assert.ok(await b.leggi('buste', P.a1));
    const acc2 = ok(chiama(PROP, 'accessi.leggi'));
    acc2.utenti[U.fut].attivo = false;
    ok(chiama(PROP, 'accessi.salva', { versioneBase: acc2.version, accessi: acc2 }));
    await nega(b.leggi('buste', P.a1), 'disattivato');
    acc2.utenti[U.fut].attivo = true;
    const v2 = ok(chiama(PROP, 'accessi.leggi'));
    v2.utenti[U.fut].attivo = true;
    ok(chiama(PROP, 'accessi.salva', { versioneBase: v2.version, accessi: v2 }));
    assert.ok(await b.leggi('buste', P.a1), 'riabilitato');
  });
  await prova('la scadenza è controllata con l\'ora del server anche senza che il custode intervenga', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('accessi/' + U.fut).update({ scadeIl: new Date(Date.now() - 1000) });
    });
    await nega((await cliente(U.fut)).leggi('buste', P.a1), 'scadeIl passato');
    ok(chiama(PROP, 'manutenzione.specchio', { tutto: true }));
    assert.ok(await (await cliente(U.fut)).leggi('buste', P.a1), 'ripristinata dal custode');
  });
  await prova('spostare un bambino di aula o renderlo riservato cancella le modifiche in volo', async () => {
    await pub(await cliente(U.admin1), U.admin1, P.s1);
    const b = await cliente(U.admin1);
    assert.ok(await b.leggi('buste', P.s1));
    ok(chiama(PROP, 'paziente.aula', { id: P.s1, aula: 'b' }));
    await env.withSecurityRulesDisabled(async (c) => { assert.ok(!(await c.firestore().doc('modifiche/' + P.s1).get()).exists); assert.ok(!(await c.firestore().doc('buste/' + P.s1).get()).exists); });
    await nega(b.leggi('buste', P.s1), 'admin1 non è nell\'aula b');
    const ab = await cliente(U.adminb);
    await pub(ab, U.adminb, P.s1, { aula: 'b' });
    assert.ok(await ab.leggi('buste', P.s1));
  });
  await prova('pulizia: il custode cancella le modifiche scadute', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await c.firestore().doc('modifiche/vecchia').set({ pid: 'vecchia', scade: new Date(Date.now() - 1000) }); });
    const r = custode.riallinea(false);
    assert.ok(r.pulite >= 1, JSON.stringify(r));
    await env.withSecurityRulesDisabled(async (c) => { assert.ok(!(await c.firestore().doc('modifiche/vecchia').get()).exists); });
  });

  console.log('\nLa chiave del centro');
  const richiesta = (email, extra) => ({ email, aula: 'principale', nome: 'Telefono', pubblica: 'QUJD', ts: V.ORA, scade: { $ms: Date.now() + 86400000 }, ...(extra || {}) });
  await prova('la richiesta si scrive solo a proprio nome e solo per le proprie aule', async () => {
    const b = await cliente(U.prof1);
    await b.scrivi('richieste', 'disp11111111', richiesta(U.prof1));
    await nega(b.scrivi('richieste', 'disp22222222', richiesta(U.admin1)), 'a nome di altri');
    await nega(b.scrivi('richieste', 'disp33333333', richiesta(U.prof1, { aula: 'b' })), 'aula non sua');
    await nega((await cliente(U.estr)).scrivi('richieste', 'disp44444444', richiesta(U.estr)), 'estraneo');
    await nega((await cliente(U.admin1)).scrivi('richieste', 'disp11111111', richiesta(U.admin1)), 'sovrascrive la richiesta di un altro');
  });
  await prova('le richieste le vedono solo gli admin dell\'aula (e chi le ha fatte)', async () => {
    const q = { coll: 'richieste', filtri: [['aula', '==', 'principale']] };
    assert.ok((await raccogli(await cliente(U.admin1), q)).has('disp11111111'));
    await nega(raccogli(await cliente(U.prof2), q), 'professionista');
    await nega(raccogli(await cliente(U.adminb), q), 'admin di un\'altra aula');
    assert.ok((await raccogli(await cliente(PROP), q)).has('disp11111111'));
  });
  await prova('la consegna la scrive solo un admin dell\'aula per una richiesta esistente; la legge solo il richiedente', async () => {
    const cons = (da, email) => ({ email, kid: 'k1', busta: 'QUJD', da, ts: V.ORA, scade: { $ms: Date.now() + 86400000 } });
    await nega((await cliente(U.prof2)).scrivi('consegne', 'disp11111111', cons(U.prof2, U.prof1)), 'non admin');
    await nega((await cliente(U.adminb)).scrivi('consegne', 'disp11111111', cons(U.adminb, U.prof1)), 'admin di un\'altra aula');
    await nega((await cliente(U.admin1)).scrivi('consegne', 'disp99999999', cons(U.admin1, U.prof1)), 'senza richiesta');
    await nega((await cliente(U.admin1)).scrivi('consegne', 'disp11111111', cons(U.admin1, U.prof2)), 'a un\'altra persona');
    await (await cliente(U.admin1)).scrivi('consegne', 'disp11111111', cons(U.admin1, U.prof1));
    const mia = { coll: 'consegne', filtri: [['email', '==', U.prof1]] };
    assert.ok((await raccogli(await cliente(U.prof1), mia)).has('disp11111111'));
    await nega(raccogli(await cliente(U.admin1), mia), 'l\'admin che l\'ha scritta non può rileggere quella degli altri');
    await nega((await cliente(U.prof2)).leggi('consegne', 'disp11111111'), 'altri leggono');
    await nega((await cliente(U.admin1)).leggi('consegne', 'disp11111111'), 'nemmeno l\'admin');
    const b = await cliente(U.prof1);
    await b.elimina('consegne', 'disp11111111'); await b.elimina('richieste', 'disp11111111');
  });

  await env.cleanup();
  console.log(`\n${passati} prove superate, ${fallimenti.length} fallite`);
  if (fallimenti.length) { console.log('Fallite:\n - ' + fallimenti.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
