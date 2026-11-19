#!/usr/bin/env node
// Giochi con più set insieme e risultati del gioco nella seduta di oggi (node tools/test-tice-gioco.js)
'use strict';
const assert = require('assert');
const G = require('../js/tice-gioco.js');
const P = require('../js/tice-programma.js');
const U = require('../js/tice-unisci.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };

const setA = { id: 'sa', name: 'Set A', category: 'Scenari', items: [{ label: 'cane' }, { label: 'gatto' }, { l: 'topo' }] };
const setB = { id: 'sb', name: 'Set B', cat: 'Scenari', items: [{ label: 'mela' }, { label: 'pera' }] };
const ADESSO = Date.parse('2026-11-19T10:00:00Z');
const quando = (ms) => new Date(ADESSO - ms).toISOString();

// ---------- più set in un'attività ----------
prova('i set di un target: uno solo, o più insieme (il primo è sempre setId)', () => {
  assert.deepStrictEqual(G.idsSet({ setId: 'sa' }), ['sa']);
  assert.deepStrictEqual(G.idsSet({ setId: 'sa', setIds: ['sa', 'sb'] }), ['sa', 'sb']);
  assert.deepStrictEqual(G.idsSet({ testo: 'a mano' }), []);
  assert.strictEqual(G.insieme({ setId: 'sa', setIds: ['sa', 'sb'] }), true);
  assert.strictEqual(G.insieme({ setId: 'sa' }), false);
  assert.strictEqual(G.idSetDi({ setId: 'sa', setIds: ['sa', 'sb'] }), 'multi_sa_sb');
  assert.strictEqual(G.idSetDi({ setId: 'sa' }), 'sa');
});
prova('il programma e il modulo del gioco calcolano lo stesso id', () => {
  [{ setId: 'sa' }, { setId: 'sa', setIds: ['sa', 'sb', 'sc'] }, { setIds: ['x', 'y'] }, {}].forEach((t) => assert.strictEqual(P.setIdDi(t), G.idSetDi(t)));
});
prova('aggiungiTarget: «set separati» = un target per set, «insieme» = un target con setIds', () => {
  const att = P.nuovaAttivita({}, { nome: 'Intraverbal' });
  P.aggiungiTarget(att, { testo: 'Set A', setId: 'sa', mode: 'tact' }, true);
  P.aggiungiTarget(att, { testo: 'Set B', setId: 'sb', mode: 'tact' }, true);
  assert.deepStrictEqual(att.target.map((t) => [t.testo, t.setId, t.setIds]), [['Set A', 'sa', undefined], ['Set B', 'sb', undefined]]);
  const ins = P.aggiungiTarget(att, { testo: 'Set A + Set B', setId: 'sa', setIds: ['sa', 'sb'], mode: 'tact' }, false);
  assert.deepStrictEqual(ins.setIds, ['sa', 'sb']);
  assert.strictEqual(ins.setId, 'sa');
  assert.strictEqual(ins.mode, 'tact');
  // un solo id in setIds non è «insieme»
  assert.strictEqual(P.aggiungiTarget(att, { testo: 'x', setId: 'sa', setIds: ['sa'] }, false).setIds, undefined);
});
prova('gli stimoli dei set scelti vanno in un unico elenco, ognuno con il suo set', () => {
  const u = G.unisciSet([setA, setB]);
  assert.strictEqual(u.id, 'multi_sa_sb');
  assert.strictEqual(u.nome, 'Set A + Set B');
  assert.strictEqual(u.items.length, 5);
  assert.deepStrictEqual(u.items.map((i) => i._setName), ['Set A', 'Set A', 'Set A', 'Set B', 'Set B']);
  assert.strictEqual(u.items[3]._setCat, 'Scenari');
  assert.strictEqual(setA.items[0]._setId, undefined, 'i set originali non si toccano');
});
prova('totale unito, dettaglio per set e per stimolo', () => {
  const u = G.unisciSet([setA, setB]);
  // indici nell'elenco unito: cane, gatto, topo | mela, pera
  const d = G.dettaglio(u.items, { 0: true, 1: false, 2: 'prompt', 3: true, 4: true }, ['sa', 'sb']);
  assert.deepStrictEqual([d.v, d.p, d.x, d.tot], [3, 1, 1, 5]);
  assert.deepStrictEqual(d.setBreakdown.map((s) => [s.setId, s.correct, s.prompts, s.incorrect, s.total, s.percentage]),
    [['sa', 1, 1, 1, 3, 33], ['sb', 2, 0, 0, 2, 100]]);
  assert.deepStrictEqual(d.itemDetails.map((x) => [x.label, x.result, x.setId]),
    [['cane', true, 'sa'], ['gatto', false, 'sa'], ['topo', 'prompt', 'sa'], ['mela', true, 'sb'], ['pera', true, 'sb']]);
  assert.strictEqual(d.setBreakdown.reduce((n, s) => n + s.correct, 0), d.v, 'la somma dei set è il totale');
});
prova('un set mai toccato non compare nel dettaglio; l\'ordine è quello scelto', () => {
  const u = G.unisciSet([setA, setB]);
  const d = G.dettaglio(u.items, { 3: true, 0: false }, ['sa', 'sb']);
  assert.deepStrictEqual(d.setBreakdown.map((s) => s.setId), ['sa', 'sb']);
  const d2 = G.dettaglio(u.items, { 3: true, 4: false }, ['sa', 'sb']);
  assert.deepStrictEqual(d2.setBreakdown.map((s) => s.setId), ['sb']);
  const d3 = G.dettaglio(u.items, { 0: true, 3: false }, ['sb', 'sa']);
  assert.deepStrictEqual(d3.setBreakdown.map((s) => s.setId), ['sb', 'sa']);
  assert.deepStrictEqual(G.stimoliDelSet({ itemDetails: d.itemDetails }, 'sb').map((x) => x.label), ['mela']);
});
prova('giochi a scenari: il risultato ha la chiave del segnaposto, la scena dice a quale set appartiene', () => {
  const u = G.unisciSet([setA, setB]);
  // scene: 0..2 = Set A, 3..4 = Set B; i risultati sono chiavi di segnaposto con l'indice della scena
  const risultati = { 1795098175883: true, 1795098175888: false, 1795098175901: true, 1795098175906: 'prompt' };
  const origini = { 1795098175883: 0, 1795098175888: 0, 1795098175901: 3, 1795098175906: 4 };
  const d = G.dettaglio(u.items, risultati, ['sa', 'sb'], origini);
  assert.deepStrictEqual([d.v, d.p, d.x], [2, 1, 1]);
  assert.deepStrictEqual(d.setBreakdown.map((s) => [s.setId, s.correct, s.incorrect, s.prompts, s.total]), [['sa', 1, 1, 0, 2], ['sb', 1, 0, 1, 2]]);
  assert.deepStrictEqual(d.itemDetails.map((x) => x.label), ['cane', 'cane', 'mela', 'pera']);
  // senza origini la chiave non è un indice: niente da attribuire
  assert.strictEqual(G.dettaglio(u.items, risultati, ['sa', 'sb']).tot, 0);
});
prova('risultati non validi (indice che non c\'è, valore strano) si ignorano', () => {
  const d = G.dettaglio(G.unisciSet([setA]).items, { 0: true, 9: true, 1: 'boh' });
  assert.strictEqual(d.tot, 1);
});
prova('una seduta per un target con più set: stesso id del gioco, e si ritrova fra le sedute del target', () => {
  const p = { history: [] };
  const att = P.nuovaAttivita(p, { nome: 'Scenari', mode: 'intraverbal_scenari' });
  const t = P.aggiungiTarget(att, { testo: 'Set A + Set B', setId: 'sa', setIds: ['sa', 'sb'], mode: 'intraverbal_scenari' }, true);
  const s = P.seduta(att, t, { v: 4, p: 0, x: 1, sequenza: '', sessionType: 'independent' }, '2026-11-19T10:00:00Z');
  assert.strictEqual(s.setId, 'multi_sa_sb');
  assert.strictEqual(s.mode, 'intraverbal_scenari');
  assert.strictEqual(s.setName, 'Set A + Set B');
  p.history.push(s);
  // una seduta del gioco, senza targetId, con lo stesso id e la stessa modalità, appartiene comunque al target
  p.history.push({ id: 'h1', date: '2026-11-18T10:00:00Z', setId: 'multi_sa_sb', mode: 'intraverbal_scenari', correct: 3, total: 5 });
  assert.strictEqual(P.sedute(p, att, t).length, 2);
});

// ---------- gioco avviato direttamente ----------
const sedutaGioco = (extra) => Object.assign({
  date: quando(2000), setId: 'multi_sa_sb', setName: 'Set A + Set B', setCat: 'Scenari', mode: 'intraverbal_scenari',
  correct: 3, prompts: 1, total: 5, percentage: 60, sessionType: 'independent', rawV: 3, rawP: 1, rawX: 1,
  setBreakdown: [{ setId: 'sa', setName: 'Set A', setCat: 'Scenari', correct: 1, prompts: 1, incorrect: 1, total: 3, percentage: 33 },
    { setId: 'sb', setName: 'Set B', setCat: 'Scenari', correct: 2, prompts: 0, incorrect: 0, total: 2, percentage: 100 }],
  itemDetails: [{ label: 'cane', result: true, setId: 'sa', setName: 'Set A' }, { label: 'mela', result: true, setId: 'sb', setName: 'Set B' }]
}, extra || {});
const etichetta = (m) => ({ intraverbal_scenari: 'Intraverbal scenari', tact: 'Tact' }[m] || m);

prova('si riconosce la seduta appena salvata dal gioco, e solo quella', () => {
  assert.strictEqual(G.eSedutaGioco(sedutaGioco(), ADESSO), true);
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ date: quando(10 * 60000) }), ADESSO), false, 'vecchia');
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ id: 'sx_1' }), ADESSO), false, 'ha già un id (fatta dalla seduta)');
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ attivitaId: 'at_1' }), ADESSO), false, 'già collegata a un\'attività');
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ fonte: 'app' }), ADESSO), false);
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ mode: 'quaderno' }), ADESSO), false, 'il quaderno resta com\'è');
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ mode: 'quaderno_task' }), ADESSO), false);
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ mode: 'comportamento' }), ADESSO), false);
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ total: 0 }), ADESSO), false);
  assert.strictEqual(G.eSedutaGioco(sedutaGioco({ date: 'boh' }), ADESSO), false);
  assert.strictEqual(G.eSedutaGioco(null, ADESSO), false);
});
prova('il titolo proposto: modalità e set; senza ripetere il nome del gioco', () => {
  assert.strictEqual(G.titoloProposto(sedutaGioco(), etichetta), 'Intraverbal scenari – Set A + Set B');
  assert.strictEqual(G.titoloProposto(sedutaGioco({ setName: 'Intraverbal scenari di casa' }), etichetta), 'Intraverbal scenari di casa');
  assert.strictEqual(G.titoloProposto(sedutaGioco({ setName: '' }), etichetta), 'Intraverbal scenari');
  assert.strictEqual(G.titoloProposto(sedutaGioco({ mode: 'xyz' }), etichetta), 'Set A + Set B');
});
prova('entra nella bozza come attività una tantum, con i conteggi del gioco e il dettaglio', () => {
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], sedutaGioco(), P.nuovoId, etichetta);
  assert.strictEqual(r.doppione, false);
  assert.strictEqual(b.temp.length, 1);
  assert.strictEqual(b.temp[0].nome, 'Intraverbal scenari – Set A + Set B');
  assert.strictEqual(b.temp[0].daGioco, true);
  assert.strictEqual(b.temp[0].fuori, true, 'una tantum di partenza');
  const v = b.voci[r.id];
  assert.deepStrictEqual([v.v, v.p, v.x], [3, 1, 1]);
  assert.strictEqual(v.sessionType, 'independent');
  assert.strictEqual(v.gioco.setBreakdown.length, 2);
  assert.strictEqual(G.dettaglioValido(v), true);
});
prova('il time delay del gioco passa alla voce', () => {
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], sedutaGioco({ sessionType: 'timedelay', timeDelaySeconds: 3 }), P.nuovoId, etichetta);
  assert.strictEqual(b.voci[r.id].sessionType, 'timedelay');
  assert.strictEqual(b.voci[r.id].tdSeconds, 3);
});
prova('lo stesso risultato salvato due volte non fa doppioni (bozza e storico)', () => {
  const b = { voci: {}, temp: [], extra: [] };
  const s = sedutaGioco();
  assert.strictEqual(G.aggiungiInBozza(b, [], s, P.nuovoId, etichetta).doppione, false);
  assert.strictEqual(G.aggiungiInBozza(b, [], JSON.parse(JSON.stringify(s)), P.nuovoId, etichetta).doppione, true);
  assert.strictEqual(b.temp.length, 1);
  // già salvata nello storico dalla bozza (chiusa la seduta): non rientra
  const storico = [{ id: 'sx_9', giocoFirma: G.firma(s) }];
  assert.strictEqual(G.aggiungiInBozza({ voci: {}, temp: [], extra: [] }, storico, s, P.nuovoId, etichetta).doppione, true);
  // un altro risultato (altro minuto o altri punti) è un'altra seduta
  assert.strictEqual(G.aggiungiInBozza(b, [], sedutaGioco({ date: quando(1000) }), P.nuovoId, etichetta).doppione, false);
  assert.strictEqual(b.temp.length, 2);
});
prova('alla chiusura della seduta: una tantum con modalità di gioco, set e dettaglio', () => {
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], sedutaGioco(), P.nuovoId, etichetta);
  const v = b.voci[r.id], t = b.temp[0];
  // come fa salvaSeduta per un'attività temporanea (titolo cambiato dall'utente)
  const att = { id: null, nome: 'Scenari di oggi', area: '', sessionType: 'independent' };
  const s = P.seduta(att, null, Object.assign({}, v, { operatore: 'Anna' }), '2026-11-19T10:00:30Z');
  s.attivitaId = null; s.setId = 'quaderno_scenari_di_oggi';
  G.applicaGioco(s, v, false);
  assert.strictEqual(s.setName, 'Scenari di oggi', 'il titolo è quello modificato');
  assert.strictEqual(s.mode, 'intraverbal_scenari');
  assert.strictEqual(s.setId, 'multi_sa_sb');
  assert.strictEqual(s.fonte, 'app-gioco');
  assert.strictEqual(s.operatore, 'Anna');
  assert.strictEqual(s.total, 5);
  assert.strictEqual(s.setBreakdown.length, 2);
  assert.strictEqual(s.itemDetails.length, 2);
  assert.strictEqual(s.giocoFirma, G.firma(v.gioco));
  assert.ok(s.id && /^sx_/.test(s.id), 'ha un id come ogni seduta della seduta');
  assert.strictEqual(t.nome, 'Intraverbal scenari – Set A + Set B');
});
prova('conteggi corretti a mano: il dettaglio del gioco non si conserva (ma modalità e set sì)', () => {
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], sedutaGioco(), P.nuovoId, etichetta);
  const v = b.voci[r.id];
  v.v = 4; v.x = 0;   // corretta una risposta
  assert.strictEqual(G.dettaglioValido(v), false);
  const s = P.seduta({ id: null, nome: 'X', sessionType: 'independent' }, null, v, '2026-11-19T10:00:30Z');
  G.applicaGioco(s, v, false);
  assert.strictEqual(s.setBreakdown, undefined);
  assert.strictEqual(s.itemDetails, undefined);
  assert.strictEqual(s.mode, 'intraverbal_scenari');
  assert.deepStrictEqual([s.correct, s.prompts, s.total], [4, 1, 5], 'i conteggi sono quelli corretti');
});
prova('unita a un\'attività del programma: modalità di gioco e dettaglio restano, il set del target ha la precedenza', () => {
  const p = { history: [] };
  const att = P.nuovaAttivita(p, { nome: 'Scenari', mode: 'intraverbal_scenari' });
  const t = P.aggiungiTarget(att, { testo: 'Set A + Set B', setId: 'sa', setIds: ['sa', 'sb'] }, true);
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], sedutaGioco(), P.nuovoId, etichetta);
  const v = b.voci[r.id];
  const s = P.seduta(att, t, v, '2026-11-19T10:00:30Z');
  G.applicaGioco(s, v, true);
  assert.strictEqual(s.attivitaId, att.id);
  assert.strictEqual(s.targetId, t.id);
  assert.strictEqual(s.setId, 'multi_sa_sb');
  assert.strictEqual(s.setBreakdown.length, 2);
  p.history.push(s);
  assert.strictEqual(P.sedute(p, att, t).length, 1);
  assert.strictEqual(P.criterioRaggiunto(P.sedute(p, att, t), { soglia: 50, sedute: 1 }), P.giorno(s.date), 'il totale unito conta per il criterio');
});
prova('la voce di una seduta salvata da un gioco con un set solo: nessun dettaglio per set, ma gli stimoli sì', () => {
  const s1 = sedutaGioco({ setBreakdown: undefined, setId: 'sa', setName: 'Set A', itemDetails: [{ label: 'cane', result: true }] });
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], s1, P.nuovoId, etichetta);
  const s = P.seduta({ id: null, nome: 'T', sessionType: 'independent' }, null, b.voci[r.id], '2026-11-19T10:00:30Z');
  G.applicaGioco(s, b.voci[r.id], false);
  assert.strictEqual(s.setId, 'sa');
  assert.strictEqual(G.haDettaglioPerSet(s), false);
  assert.strictEqual(s.itemDetails.length, 1);
});

// ---------- compatibilità con la fusione fra dispositivi ----------
prova('un target con setIds e una seduta con il dettaglio si uniscono fra due dispositivi', () => {
  const att = P.nuovaAttivita({}, { nome: 'Scenari' });
  const t = P.aggiungiTarget(att, { testo: 'Set A + Set B', setId: 'sa', setIds: ['sa', 'sb'] }, true);
  const base = { id: 'p', programma: { attivita: [att] }, history: [] };
  const clone = () => JSON.parse(JSON.stringify(base));
  const loc = clone(), rem = clone();
  const s = sedutaGioco({ id: 'sx_loc', attivitaId: att.id, targetId: t.id });
  loc.history.push(s);
  rem.programma.attivita[0].target[0].setIds = ['sa', 'sb', 'sc'];   // un altro dispositivo aggiunge un set al target
  const m = U.unisci(base, loc, rem);
  assert.strictEqual(m.history.length, 1);
  assert.deepStrictEqual(m.history[0].setBreakdown.map((x) => x.setId), ['sa', 'sb']);
  assert.deepStrictEqual(m.programma.attivita[0].target[0].setIds, ['sa', 'sb', 'sc']);
});

console.log(`\n${ok} riuscite, ${ko} fallite`);
process.exit(ko ? 1 : 0);
