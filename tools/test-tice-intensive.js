#!/usr/bin/env node
// «Intensive tact»: coda con riproposizione, quattro dati, annulla, riepilogo per stimolo e per set, seduta di gioco → bozza (node tools/test-tice-intensive.js)
'use strict';
const assert = require('assert');
const I = require('../js/tice-intensive.js');
const G = require('../js/tice-gioco.js');
const P = require('../js/tice-programma.js');
const M = require('../js/tice-modalita.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };
const seme = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const V = true, EP = 'prompt', EM = 'echo_no', X = false;
const stimoli = (n, set) => Array.from({ length: n }, (_, i) => Object.assign({ label: 's' + i }, set ? { _setId: set.id, _setName: set.nome, _setCat: 'Cat' } : {}));

prova('i risultati e i codici: ✓ V, E+ P, E- E, ✗ X', () => {
  assert.deepStrictEqual([V, EP, EM, X].map(I.codice), ['V', 'P', 'E', 'X']);
  assert.ok([V, EP, EM, X].every(I.valido)); assert.ok(!I.valido('x')); assert.ok(!I.valido(undefined));
  assert.deepStrictEqual([V, EP, EM, X].map(I.semplice), [true, 'prompt', false, false]);
});
prova('una partita parte dal primo stimolo, in ordine; ripresenta è attiva di partenza', () => {
  const S = I.crea(3);
  assert.strictEqual(S.ripresenta, true); assert.strictEqual(I.corrente(S), 0); assert.strictEqual(I.finito(S), false);
  assert.deepStrictEqual(S.coda, [0, 1, 2]);
  assert.strictEqual(I.crea(3, { ripresenta: false }).ripresenta, false);
});
prova('✓ toglie lo stimolo dal giro; E+, E- e ✗ lo rimettono in fondo', () => {
  const S = I.crea(4);
  I.segna(S, V); assert.deepStrictEqual(S.coda, [1, 2, 3]);
  I.segna(S, EP); assert.deepStrictEqual(S.coda, [2, 3, 1]);
  I.segna(S, EM); assert.deepStrictEqual(S.coda, [3, 1, 2]);
  I.segna(S, X); assert.deepStrictEqual(S.coda, [1, 2, 3]);
  assert.deepStrictEqual(I.conta(S), { v: 1, p: 1, e: 1, x: 1, tot: 4 });
});
prova('si arriva a fine giro solo quando tutti sono autonomi (ripresenta attivo)', () => {
  const S = I.crea(2);
  I.segna(S, X); I.segna(S, V); assert.strictEqual(I.finito(S), false); assert.strictEqual(I.corrente(S), 0);
  I.segna(S, EM); I.segna(S, EP); I.segna(S, V);
  assert.strictEqual(I.finito(S), true); assert.strictEqual(I.corrente(S), null);
  assert.deepStrictEqual(I.conta(S), { v: 2, p: 1, e: 1, x: 1, tot: 5 });
  assert.strictEqual(I.segna(S, V), null);
});
prova('senza ripresenta il giro finisce dopo una passata, qualunque sia la risposta', () => {
  const S = I.crea(3, { ripresenta: false });
  I.segna(S, X); I.segna(S, EM); I.segna(S, V);
  assert.strictEqual(I.finito(S), true); assert.strictEqual(I.conta(S).tot, 3);
});
prova('cambiare l\'opzione a metà vale dalla prova dopo', () => {
  const S = I.crea(2);
  I.segna(S, X); I.setRipresenta(S, false); I.segna(S, X);
  assert.deepStrictEqual(S.coda, [0]);   // il primo è tornato in fondo, il secondo no
});
prova('annulla: lo stimolo torna a schermo e la riproposizione sparisce', () => {
  const S = I.crea(3);
  const k1 = I.segna(S, EM), k2 = I.segna(S, V);
  assert.deepStrictEqual(S.coda, [2, 0]);
  assert.strictEqual(I.annulla(S), k2); assert.deepStrictEqual(S.coda, [1, 2, 0]); assert.strictEqual(I.conta(S).tot, 1);
  assert.strictEqual(I.annulla(S), k1); assert.deepStrictEqual(S.coda, [0, 1, 2]); assert.strictEqual(I.conta(S).tot, 0);
  assert.strictEqual(I.annulla(S), null);
});
prova('annulla ripetuto fino all\'inizio riporta la coda com\'era, con qualunque sequenza', () => {
  const rnd = seme(7);
  for (let t = 0; t < 40; t++) {
    const n = 1 + Math.floor(rnd() * 6), S = I.crea(n, { ripresenta: rnd() > 0.3 });
    const passi = Math.floor(rnd() * 14);
    for (let i = 0; i < passi; i++) I.segna(S, [V, EP, EM, X][Math.floor(rnd() * 4)]);
    while (I.annulla(S)) { /* tutto indietro */ }
    assert.deepStrictEqual(S.coda, Array.from({ length: n }, (_, i) => i)); assert.strictEqual(S.giro, 1);
  }
});
prova('altro giro: solo a giro finito, tutti gli stimoli rimescolati; annullare riporta al giro prima', () => {
  const S = I.crea(3, { ripresenta: false });
  assert.strictEqual(I.nuovoGiro(S), false);
  I.segna(S, V); I.segna(S, V); const ultima = I.segna(S, V);
  assert.strictEqual(I.nuovoGiro(S, seme(3)), true);
  assert.strictEqual(S.giro, 2); assert.deepStrictEqual([...S.coda].sort(), [0, 1, 2]);
  I.segna(S, EM);
  assert.strictEqual(I.stato(S).giro, 2);
  I.annulla(S); assert.strictEqual(S.giro, 2);
  assert.strictEqual(I.annulla(S), ultima); assert.strictEqual(S.giro, 1); assert.deepStrictEqual(S.coda, [2]);
});
prova('i risultati per chiave sono nel formato di itemResults e si contano da soli', () => {
  const S = I.crea(3);
  I.segna(S, V); I.segna(S, EP); I.segna(S, EM); I.segna(S, X);
  const r = I.risultati(S);
  assert.deepStrictEqual(Object.keys(r), ['it_1', 'it_2', 'it_3', 'it_4']);
  assert.deepStrictEqual(I.contaRisultati(r), { v: 1, p: 1, e: 1, x: 1, tot: 4 });
  assert.strictEqual(I.percentuale(I.contaRisultati(r)), 25);
  assert.strictEqual(I.percentuale({ v: 0, tot: 0 }), 0);
});
prova('riepilogo: conteggi, percentuale = ✓/prove, sequenza e dettaglio per stimolo (anche E-)', () => {
  const g = stimoli(3), S = I.crea(3);
  // s0: ✗ E- ✓ · s1: ✓ · s2: E+ ✓
  I.segna(S, X); I.segna(S, V); I.segna(S, EP); I.segna(S, EM); I.segna(S, V); I.segna(S, V);
  const r = I.riepilogo(S, g);
  assert.deepStrictEqual([r.v, r.p, r.e, r.x, r.tot, r.percentuale], [3, 1, 1, 1, 6, 50]);
  assert.strictEqual(r.sequenza, 'XVPEVV');
  assert.deepStrictEqual(r.itemDetails.map((d) => [d.label, d.result, d.risposte, d.prove]), [['s0', false, 'XEV', 3], ['s1', true, 'V', 1], ['s2', 'prompt', 'PV', 2]]);
  assert.deepStrictEqual(r.setBreakdown, []);
});
prova('E- non confluisce in E+ né in ✗, e la percentuale lo conta come prova non corretta', () => {
  const S = I.crea(2, { ripresenta: false });
  I.segna(S, EM); I.segna(S, V);
  const r = I.riepilogo(S, stimoli(2));
  assert.deepStrictEqual([r.v, r.p, r.e, r.x], [1, 0, 1, 0]); assert.strictEqual(r.percentuale, 50);
});
prova('più set insieme: totale unico, dettaglio per set (con E+ ed E-) e per stimolo con il set', () => {
  const a = { id: 'sa', nome: 'A' }, b = { id: 'sb', nome: 'B' };
  const g = stimoli(2, a).concat(stimoli(2, b).map((x, i) => Object.assign(x, { label: 'b' + i })));
  const S = I.crea(4, { ripresenta: false });
  I.segna(S, V); I.segna(S, EM); I.segna(S, EP); I.segna(S, X);
  const r = I.riepilogo(S, g, ['sa', 'sb']);
  assert.deepStrictEqual(r.setBreakdown.map((s) => [s.setId, s.correct, s.prompts, s.echoNo, s.incorrect, s.total, s.percentage]), [['sa', 1, 0, 1, 0, 2, 50], ['sb', 0, 1, 0, 1, 2, 0]]);
  assert.ok(r.itemDetails.every((d) => d.setId && d.setName));
  assert.deepStrictEqual(I.riepilogo(S, g, ['sb', 'sa']).setBreakdown.map((s) => s.setId), ['sb', 'sa']);
});
prova('la riproposizione non cambia il numero di stimoli nel dettaglio: uno per stimolo, con le sue prove', () => {
  const S = I.crea(2); I.segna(S, X); I.segna(S, X); I.segna(S, X); I.segna(S, V); I.segna(S, V);
  const r = I.riepilogo(S, stimoli(2));
  assert.strictEqual(r.itemDetails.length, 2); assert.strictEqual(r.tot, 5);
  assert.strictEqual(I.testoSequenza('XEV'), '✗ → E- → ✓');
});

// ---------- dalla seduta salvata dal gioco alla seduta di oggi ----------
const sedutaGioco = (extra) => Object.assign({ date: new Date().toISOString(), setId: 'sa', setName: 'Animali', mode: 'intensive_tact', correct: 3, prompts: 1, total: 6, percentage: 50,
  sessionType: 'independent', rawV: 3, rawP: 1, rawE: 1, rawX: 1, risposte: 'ecoico', sequenza: 'XVPEVV' }, extra || {});
prova('la seduta di gioco intensive tact è riconosciuta come ecoica e entra nella bozza con E- e i quattro tasti', () => {
  const s = sedutaGioco();
  assert.strictEqual(G.eSedutaGioco(s), true); assert.strictEqual(G.eEcoico(s), true);
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], s, (p) => p + '_1', (m) => (m === 'intensive_tact' ? 'Intensive tact' : m));
  assert.strictEqual(r.doppione, false);
  assert.strictEqual(b.temp[0].risposte, 'ecoico'); assert.strictEqual(b.temp[0].nome, 'Intensive tact – Animali');
  const v = b.voci[r.id];
  assert.deepStrictEqual([v.v, v.p, v.e, v.x, v.sequenza], [3, 1, 1, 1, 'XVPEVV']);
});
prova('una seduta senza E- (nessuna E- data) è comunque ecoica per il marcatore: E+ e non P', () => {
  const s = sedutaGioco({ rawE: undefined, rawX: 2, prompts: 1, total: 6, correct: 3 }); delete s.rawE;
  assert.strictEqual(G.eEcoico(s), true);
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], s, (p) => p + '_1');
  assert.strictEqual(b.temp[0].risposte, 'ecoico'); assert.strictEqual(b.voci[r.id].e, undefined);
});
prova('un gioco normale resta com\'è: niente marcatore, niente E-', () => {
  const s = { date: new Date().toISOString(), setId: 'sa', setName: 'A', mode: 'tact', correct: 3, prompts: 1, total: 5, rawV: 3, rawP: 1, rawX: 1, percentage: 60 };
  assert.strictEqual(G.eEcoico(s), false);
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], s, (p) => p + '_1');
  assert.strictEqual(b.temp[0].risposte, undefined); assert.strictEqual(b.voci[r.id].e, undefined); assert.strictEqual(b.voci[r.id].sequenza, '');
});
prova('E- cambia l\'impronta della seduta (niente doppioni tra due giochi diversi) ma non quella delle altre', () => {
  const a = sedutaGioco(), b2 = sedutaGioco({ rawE: 2 });
  assert.notStrictEqual(G.firma(a), G.firma(b2));
  const n1 = { date: 'd', mode: 'tact', setId: 's', setName: 'n', rawV: 1, rawP: 0, rawX: 1, total: 2 };
  assert.strictEqual(G.firma(n1), 'd|tact|s|n|1|0|1|2');
});
prova('il dettaglio vale finché ✓, E+, E- e ✗ non cambiano; se si corregge E- decade', () => {
  const s = sedutaGioco({ itemDetails: [{ label: 'a', result: false, risposte: 'XV', prove: 2 }] });
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], s, (p) => p + '_1'), v = b.voci[r.id];
  assert.strictEqual(G.dettaglioValido(v), true);
  v.e = 0; assert.strictEqual(G.dettaglioValido(v), false);
});
prova('alla chiusura della seduta il programma crea la voce con rawE, total con E-, e il marcatore dal gioco', () => {
  const s = sedutaGioco({ itemDetails: [{ label: 'a', result: false, risposte: 'XEV', prove: 3 }], setBreakdown: [] });
  const b = { voci: {}, temp: [], extra: [] };
  const r = G.aggiungiInBozza(b, [], s, (p) => p + '_1'), v = b.voci[r.id];
  const att = b.temp[0];
  const sc = P.seduta({ id: null, nome: att.nome, area: '', sessionType: att.sessionType }, null, Object.assign({}, v, { operatore: 'Anna' }), new Date().toISOString());
  G.applicaGioco(sc, v, false);
  assert.strictEqual(sc.rawE, 1); assert.strictEqual(sc.rawP, 1); assert.strictEqual(sc.rawX, 1); assert.strictEqual(sc.total, 6); assert.strictEqual(sc.correct, 3); assert.strictEqual(sc.percentage, 50);
  assert.strictEqual(sc.risposte, 'ecoico'); assert.strictEqual(sc.mode, 'intensive_tact'); assert.strictEqual(sc.sequenza, 'XVPEVV');
  assert.strictEqual(sc.itemDetails[0].risposte, 'XEV'); assert.strictEqual(sc.fonte, 'app-gioco');
});
prova('collegato a un target con il set: i conteggi vanno nel target come per gli altri giochi', () => {
  const att = { id: 'at1', nome: 'Tact', area: '', sessionType: 'independent', target: [{ id: 't1', testo: 'Animali', setId: 'sa', mode: 'intensive_tact' }] };
  const v = G.voceDaSeduta(sedutaGioco());
  const sc = P.seduta(att, att.target[0], v, new Date().toISOString());
  G.applicaGioco(sc, { gioco: sedutaGioco(), v: v.v, p: v.p, x: v.x, e: v.e }, true);
  assert.strictEqual(sc.attivitaId, 'at1'); assert.strictEqual(sc.targetId, 't1'); assert.strictEqual(sc.mode, 'intensive_tact'); assert.strictEqual(sc.rawE, 1); assert.strictEqual(sc.risposte, 'ecoico');
});

// ---------- modalità: set con il tact, nomi, costrutti ----------
prova('l\'intensive tact vale per i set con il tact senza risalvarli (e non per gli altri)', () => {
  assert.deepStrictEqual(G.modiDelSet(['tact', 'ran']), ['tact', 'ran', 'intensive_tact']);
  assert.deepStrictEqual(G.modiDelSet(['ran']), ['ran']);
  assert.deepStrictEqual(G.modiDelSet([]), []);
  assert.deepStrictEqual(G.modiDelSet(['tact', 'intensive_tact']), ['tact', 'intensive_tact']);
  assert.strictEqual(G.modiDelSet(undefined), undefined);
  const orig = ['tact']; G.modiDelSet(orig); assert.deepStrictEqual(orig, ['tact']);
  assert.strictEqual(G.modoDiPartenza('intensive_tact'), 'tact'); assert.strictEqual(G.modoDiPartenza('ran'), 'ran');
});
prova('nel dizionario del centro l\'intensive tact è un gioco della modalità Tact', () => {
  assert.strictEqual(M.modalitaDiModo('intensive_tact'), 'tact'); assert.strictEqual(M.modalitaDiModo('tact'), 'tact');
});
console.log(`\n${ok} riuscite, ${ko} fallite`);
process.exit(ko ? 1 : 0);
