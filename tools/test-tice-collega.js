#!/usr/bin/env node
// Collegare i target del programma ai set dell'archivio: le sedute restano, abbinamento multiplo,
// scollegamento, suggerimenti per nome (node tools/test-tice-collega.js)
'use strict';
const assert = require('assert');
const P = require('../js/tice-programma.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };
const archivio = [
  { id: 'a1', name: 'Animali 1', cat: 'Animali', modes: ['tact'] },
  { id: 'a2', name: 'Animali 2', cat: 'Animali', modes: ['tact'] },
  { id: 'f1', name: 'Frutta 1', cat: 'Frutta', modes: ['tact'] },
  { id: 'f2', name: 'Frutta 2', cat: 'Frutta', modes: ['tact', 'ran'] },
  { id: 'f10', name: 'Frutta 10', cat: 'Frutta', modes: ['tact'] }
];
// un bambino con «Set 1», «Set 2» scritti a mano e qualche seduta già registrata
function bambino() {
  const p = { history: [] };
  const att = P.nuovaAttivita(p, { nome: 'Tact', area: 'Frutta', target: 'Set 1' });
  P.aggiungiTarget(att, 'Set 2', true);
  const [t1, t2] = att.target;
  p.history.push(P.seduta(att, t1, { v: 4, x: 1 }, '2026-10-01T10:00:00Z'));
  p.history.push(P.seduta(att, t1, { v: 5 }, '2026-10-02T10:00:00Z'));
  // una seduta importata: senza targetId, riconosciuta dal nome
  p.history.push({ id: 'imp1', date: '2026-09-20T10:00:00Z', mode: 'quaderno', setName: 'Tact · Set 1', correct: 3, total: 4, percentage: 75 });
  p.history.push(P.seduta(att, t2, { v: 2, x: 2 }, '2026-10-03T10:00:00Z'));
  return { p, att, t1, t2 };
}

prova('collegare un target tiene stato, testo e tutte le sue sedute', () => {
  const { p, att, t1 } = bambino();
  const prima = P.sedute(p, att, t1).map((s) => s.id).sort();
  assert.strictEqual(prima.length, 3);
  const stato = t1.stato, testo = t1.testo, id = t1.id;
  P.collegaSet(p, att, t1, ['f1'], 'tact');
  assert.strictEqual(t1.setId, 'f1'); assert.strictEqual(t1.mode, 'tact'); assert.ok(!t1.setIds);
  assert.strictEqual(t1.stato, stato); assert.strictEqual(t1.testo, testo); assert.strictEqual(t1.id, id);
  assert.deepStrictEqual(P.sedute(p, att, t1).map((s) => s.id).sort(), prima);
  assert.ok(P.sedute(p, att, t1).every((s) => s.targetId === id), 'anche la seduta importata prende il targetId');
});
prova('le sedute di un target non finiscono in un altro dopo il collegamento', () => {
  const { p, att, t1, t2 } = bambino();
  P.collegaSet(p, att, t1, ['f1'], 'tact'); P.collegaSet(p, att, t2, ['f2'], 'tact');
  assert.strictEqual(P.sedute(p, att, t1).length, 3);
  assert.strictEqual(P.sedute(p, att, t2).length, 1);
  assert.strictEqual(P.sedute(p, att).length, 4, 'l\'attività le ha tutte');
});
prova('le sedute nuove dopo il collegamento hanno set e gioco e restano nel target', () => {
  const { p, att, t1 } = bambino();
  P.collegaSet(p, att, t1, ['f1'], 'tact');
  const s = P.seduta(att, t1, { v: 6 }, '2026-10-05T10:00:00Z');
  assert.strictEqual(s.setId, 'f1'); assert.strictEqual(s.mode, 'tact'); assert.strictEqual(s.targetId, t1.id);
  p.history.push(s);
  assert.strictEqual(P.sedute(p, att, t1).length, 4);
});
prova('le partite giocate prima dal set (senza targetId) entrano nel target collegato', () => {
  const { p, att, t1 } = bambino();
  p.history.push({ id: 'g1', date: '2026-09-01T10:00:00Z', mode: 'tact', setId: 'f1', setName: 'Frutta 1', correct: 5, total: 6, percentage: 83 });
  assert.strictEqual(P.sedute(p, att, t1).length, 3);
  P.collegaSet(p, att, t1, ['f1'], 'tact');
  assert.strictEqual(P.sedute(p, att, t1).length, 4);
});
prova('più set insieme: setIds con il primo in setId, id «multi_»', () => {
  const { p, att, t2 } = bambino();
  P.collegaSet(p, att, t2, ['f1', 'f2', 'f1'], 'tact');
  assert.deepStrictEqual(P.setIdsDi(t2), ['f1', 'f2']);
  assert.strictEqual(t2.setId, 'f1'); assert.strictEqual(P.setIdDi(t2), 'multi_f1_f2');
  assert.strictEqual(P.sedute(p, att, t2).length, 1);
  P.collegaSet(p, att, t2, ['f2'], 'ran');
  assert.ok(!t2.setIds); assert.strictEqual(t2.setId, 'f2'); assert.strictEqual(t2.mode, 'ran');
});
prova('abbinamento di tutti i target in un passaggio', () => {
  const { p, att } = bambino();
  const scelte = { 0: ['f1'], 1: ['f2'] };
  att.target.forEach((t, i) => P.collegaSet(p, att, t, scelte[i], 'tact'));
  assert.deepStrictEqual(att.target.map((t) => t.setId), ['f1', 'f2']);
  assert.deepStrictEqual(att.target.map((t) => P.sedute(p, att, t).length), [3, 1]);
});
prova('scollegare toglie set e gioco, il target tiene le sedute', () => {
  const { p, att, t1 } = bambino();
  P.collegaSet(p, att, t1, ['f1'], 'tact');
  p.history.push({ id: 'g1', date: '2026-09-01T10:00:00Z', mode: 'tact', setId: 'f1', setName: 'Frutta 1', correct: 5, total: 6, percentage: 83 });
  const n = P.sedute(p, att, t1).length;
  P.scollegaSet(p, att, t1);
  assert.ok(!t1.setId && !t1.setIds && !t1.mode);
  assert.strictEqual(t1.testo, 'Set 1');
  assert.strictEqual(P.sedute(p, att, t1).length, n, 'nessuna seduta si perde');
  assert.strictEqual(P.nomeSet(att, t1), 'Tact · Set 1');
});
prova('collegare un target senza sedute e scollegare un target non collegato non rompe nulla', () => {
  const p = { history: [] }, att = P.nuovaAttivita(p, { nome: 'Tact', target: 'Set 1' });
  P.scollegaSet(p, att, att.target[0]);
  P.collegaSet(p, att, att.target[0], [], 'tact');
  assert.ok(!att.target[0].setId);
  P.collegaSet(p, att, att.target[0], ['a1'], 'tact');
  assert.strictEqual(P.sedute(p, att, att.target[0]).length, 0);
});
prova('suggerimento: «Set 1» ↔ set con 1 nella categoria dell\'attività, senza confondere 10 con 1', () => {
  const s = P.suggerisciSet('Set 1', archivio, { categorie: ['Frutta'] });
  assert.strictEqual(s.id, 'f1');
  assert.strictEqual(P.suggerisciSet('Set 2', archivio, { categorie: ['Frutta'] }).id, 'f2');
  assert.strictEqual(P.suggerisciSet('Set 10', archivio, { categorie: ['Frutta'] }).id, 'f10');
});
prova('suggerimento: due candidati alla pari o nessuno → nessuna proposta', () => {
  assert.strictEqual(P.suggerisciSet('Set 1', archivio, {}), null, '«Animali 1» e «Frutta 1» alla pari');
  assert.strictEqual(P.suggerisciSet('Set 7', archivio, { categorie: ['Frutta'] }), null);
});
prova('suggerimento: il nome dell\'attività fa da spareggio fra «Frutta 1» e «Animali 1»', () => {
  assert.strictEqual(P.suggerisciSet('Set 1', archivio, { categorieDeboli: ['Tact frutta'] }).id, 'f1');
  assert.strictEqual(P.suggerisciSet('Set 1', archivio, { categorieDeboli: ['Speaker'] }), null);
});
prova('suggerimento: stesso nome, già usati esclusi', () => {
  assert.strictEqual(P.suggerisciSet('animali 2', archivio, {}).id, 'a2');
  assert.strictEqual(P.suggerisciSet('Set 1', archivio, { categorie: ['Frutta'], esclusi: ['f1'] }), null);
});
console.log(`\n${ok} superate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
