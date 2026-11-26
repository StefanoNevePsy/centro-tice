#!/usr/bin/env node
// Echo to tact: il quarto dato E- (ecoico richiesto ma non corretto) accanto a ✓, E+ e ✗ (node tools/test-tice-eco.js)
'use strict';
const assert = require('assert');
const P = require('../js/tice-programma.js');
const U = require('../js/tice-unisci.js');
const SCC = require('../js/scc.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };

const att = (extra) => Object.assign(P.nuovaAttivita({}, { nome: 'Echo to tact', prove: 10, target: 'Animali' }), { risposte: 'ecoico', nomeP: 'Ecoica' }, extra || {});

prova('seduta con E-: totale e percentuale (✓ / prove), rawE a parte da rawP e rawX', () => {
  const a = att(), s = P.seduta(a, a.target[0], { v: 6, p: 2, e: 1, x: 1, sequenza: 'VVVVVVPPEX' }, '2026-10-01T10:00:00');
  assert.strictEqual(s.total, 10);
  assert.strictEqual(s.correct, 6);
  assert.strictEqual(s.percentage, 60);
  assert.strictEqual(s.rawV, 6); assert.strictEqual(s.rawP, 2); assert.strictEqual(s.rawE, 1); assert.strictEqual(s.rawX, 1);
  assert.strictEqual(s.prompts, 2, 'prompts resta E+');
});
prova('senza E- la seduta è identica a prima: nessun campo rawE', () => {
  const a = att(), s = P.seduta(a, a.target[0], { v: 6, p: 2, x: 2 }, '2026-10-01T10:00:00');
  assert.ok(!('rawE' in s));
  assert.strictEqual(s.total, 10);
  const s0 = P.seduta(a, a.target[0], { v: 6, p: 2, e: 0, x: 2 }, '2026-10-01T10:00:00');
  assert.ok(!('rawE' in s0));
});
prova('solo E-: la seduta esiste (prima con v+p+x=0 era scartata)', () => {
  const a = att(), s = P.seduta(a, a.target[0], { v: 0, p: 0, e: 3, x: 0 }, '2026-10-01T10:00:00');
  assert.strictEqual(s.total, 3); assert.strictEqual(s.percentage, 0);
});
prova('contaRisposte riconosce E; le sequenze vecchie danno e = 0', () => {
  assert.deepStrictEqual(P.contaRisposte('VPEEX'), { v: 1, p: 1, e: 2, x: 1 });
  assert.strictEqual(P.contaRisposte('VVPX').e, 0);
});
prova('E- conta come prova nelle LU: la LU da 10 si completa con E-', () => {
  const d = P.dividiLU('VPE', 'VVVVEXV', 10);
  assert.strictEqual(d.blocchi.length, 1);
  assert.strictEqual(d.blocchi[0], 'VPEVVVVEXV');
  assert.deepStrictEqual(P.contaRisposte(d.blocchi[0]), { v: 6, p: 1, e: 2, x: 1 });
  assert.strictEqual(d.resto, '');
});
prova('una LU con E- diventa una seduta con rawE e percentuale ✓/n', () => {
  const a = att(), bl = 'VVVVVVEEPX';
  const s = P.seduta(a, a.target[0], Object.assign({}, { v: 99, p: 99, e: 99, x: 99 }, P.contaRisposte(bl), { sequenza: bl }), '2026-10-01T10:00:00');
  assert.strictEqual(s.rawE, 2); assert.strictEqual(s.total, 10); assert.strictEqual(s.percentage, 60);
});
prova('criterio: E- è non corretta come E+ e ✗ (90% su 10 prove)', () => {
  const a = att(), t = a.target[0], crit = { soglia: 90, sedute: 2 };
  const buono = (g) => P.seduta(a, t, { v: 9, e: 1 }, g + 'T10:00:00');
  const meno = (g) => P.seduta(a, t, { v: 8, p: 1, e: 1 }, g + 'T10:00:00');
  assert.strictEqual(P.criterioRaggiunto([buono('2026-10-01'), buono('2026-10-02')], crit), '2026-10-02');
  assert.strictEqual(P.criterioRaggiunto([buono('2026-10-01'), meno('2026-10-02')], crit), null);
});
prova('stesso giorno: due salvataggi si sommano, E- compreso', () => {
  const a = att(), t = a.target[0], crit = { soglia: 60, sedute: 1 };
  const s1 = P.seduta(a, t, { v: 2, e: 2 }, '2026-10-01T10:00:00'), s2 = P.seduta(a, t, { v: 4, e: 0, x: 2 }, '2026-10-01T15:00:00');
  assert.strictEqual(P.criterioRaggiunto([s1, s2], crit), '2026-10-01');   // 6/10
  assert.strictEqual(P.criterioRaggiunto([s1], crit), null);               // 2/4
});
prova('unione tra dispositivi: sedute vecchie (senza rawE) e nuove (con rawE) restano com\'erano', () => {
  const a = att(), t = a.target[0];
  const vecchia = Object.assign(P.seduta(a, t, { v: 5, p: 2, x: 3 }, '2026-09-30T10:00:00'), { id: 'sx_vecchia' });
  const nuova = Object.assign(P.seduta(a, t, { v: 5, p: 2, e: 2, x: 1 }, '2026-10-01T10:00:00'), { id: 'sx_nuova' });
  const base = { id: 'b1', name: 'Mario', history: [vecchia] };
  const l = JSON.parse(JSON.stringify(base)); l.history.push(nuova);
  const r = JSON.parse(JSON.stringify(base)); r.history.push(Object.assign(P.seduta(a, t, { v: 7, x: 3 }, '2026-10-02T10:00:00'), { id: 'sx_altra' }));
  const m = U.unisci(base, l, r);
  assert.deepStrictEqual(m.history.map((x) => x.id).sort(), ['sx_altra', 'sx_nuova', 'sx_vecchia']);
  const n = m.history.find((x) => x.id === 'sx_nuova');
  assert.strictEqual(n.rawE, 2); assert.strictEqual(n.total, 10);
  assert.ok(!('rawE' in m.history.find((x) => x.id === 'sx_vecchia')));
  // la stessa seduta modificata (E- corretto a mano) su un solo dispositivo arriva dall'altro lato
  const l2 = JSON.parse(JSON.stringify(m)), r2 = JSON.parse(JSON.stringify(m));
  l2.history.find((x) => x.id === 'sx_nuova').rawE = 3; l2.history.find((x) => x.id === 'sx_nuova').total = 11;
  const m2 = U.unisci(m, l2, r2);
  assert.strictEqual(m2.history.find((x) => x.id === 'sx_nuova').rawE, 3);
});
prova('celeration chart: E- conta fra gli errori (tre serie), senza E- nulla cambia', () => {
  assert.deepStrictEqual(SCC.conteggi({ rawV: 6, rawP: 2, rawE: 1, rawX: 1 }), { v: 6, p: 2, x: 2, minuti: 0 });
  assert.deepStrictEqual(SCC.conteggi({ rawV: 6, rawP: 2, rawX: 2 }), { v: 6, p: 2, x: 2, minuti: 0 });
});
prova('task analysis con E-: lo step conta E come non corretto', () => {
  const a = att(), pz = {};
  const t = P.aggiungiTarget(a, { testo: 'Mani', passi: ['Apre', 'Chiude'] }, true);
  const [p1, p2] = P.passiDi(t);
  const s = P.seduta(a, t, { v: 1, e: 1, esiti: { [p1.id]: 'V', [p2.id]: 'E' } }, '2026-10-01T10:00:00');
  assert.strictEqual(s.total, 2); assert.strictEqual(s.rawE, 1);
  assert.strictEqual(s.taskSteps[1].x, 1);
});

console.log(`\n${ok} riuscite, ${ko} fallite`);
process.exit(ko ? 1 : 0);
