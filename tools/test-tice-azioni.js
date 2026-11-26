#!/usr/bin/env node
// «Chi lo fa?» e «Cosa fa?»: estrazione per azione e per soggetto, field, esclusioni, punteggi, dettaglio (node tools/test-tice-azioni.js)
'use strict';
const assert = require('assert');
const Z = require('../js/tice-azioni.js');
const G = require('../js/tice-gioco.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };

// un generatore pseudo-casuale con seme, così le prove sono ripetibili
const seme = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const img = (label, soggetto, extra) => Object.assign({ label, url: 'data:x/' + label + soggetto, soggetto }, extra || {});
const azioni = ['bere', 'mangiare', 'dormire'], persone = ['nonno', 'mamma', 'bambino'];
const set = []; azioni.forEach((a) => persone.forEach((p) => set.push(img(a, p))));   // 3 azioni × 3 soggetti

prova('le due modalità sono riconosciute, le altre no', () => {
  assert.strictEqual(Z.modoDi('chi_lo_fa'), 'chi'); assert.strictEqual(Z.modoDi('cosa_fa'), 'cosa');
  assert.strictEqual(Z.modoDi('tact'), null); assert.strictEqual(Z.eAzioneSoggetto('cosa_fa'), true); assert.strictEqual(Z.eAzioneSoggetto('ran'), false);
});
prova('«Chi lo fa?»: un gruppo per azione (stessa parola), con i soggetti diversi come opzioni', () => {
  const r = Z.preparaGruppi(set, 'chi');
  assert.deepStrictEqual(r.gruppi.map((g) => g.nome), ['bere', 'mangiare', 'dormire']);
  r.gruppi.forEach((g) => assert.deepStrictEqual(g.opzioni.map((o) => o.soggetto), persone));
  assert.strictEqual(r.senzaSoggetto, 0); assert.strictEqual(r.soloUna.length, 0);
});
prova('«Cosa fa?»: un gruppo per soggetto, con le azioni diverse come opzioni', () => {
  const r = Z.preparaGruppi(set, 'cosa');
  assert.deepStrictEqual(r.gruppi.map((g) => g.nome), persone);
  r.gruppi.forEach((g) => assert.deepStrictEqual(g.opzioni.map((o) => o.label), azioni));
});
prova('maiuscole e spazi non separano i gruppi; i nascosti e quelli senza immagine non si giocano', () => {
  const v = [img('Bere', 'Nonno'), img(' bere ', 'nonna'), img('bere', 'mamma', { hidden: true }), { label: 'bere', soggetto: 'zio', url: null }];
  const r = Z.preparaGruppi(v, 'chi');
  assert.strictEqual(r.gruppi.length, 1); assert.strictEqual(r.gruppi[0].opzioni.length, 2); assert.strictEqual(r.immagini, 2);
});
prova('due immagini dello stesso soggetto nella stessa azione contano una volta sola (niente risposte doppie)', () => {
  const r = Z.preparaGruppi([img('bere', 'nonno'), img('bere', 'Nonno'), img('bere', 'mamma')], 'chi');
  assert.strictEqual(r.gruppi[0].opzioni.length, 2);
  // e lo stesso soggetto con la stessa azione ripetuta in «Cosa fa?»
  const c = Z.preparaGruppi([img('bere', 'nonno'), img('bere', 'nonno'), img('mangiare', 'nonno')], 'cosa');
  assert.deepStrictEqual(c.gruppi[0].opzioni.map((o) => o.label), ['bere', 'mangiare']);
});
prova('senza soggetto: in «Cosa fa?» sono escluse (e contate), in «Chi lo fa?» si gioca con la sola parola', () => {
  const v = set.concat([img('bere', ''), img('bere', undefined), img('correre', '')]);
  const c = Z.preparaGruppi(v, 'cosa');
  assert.strictEqual(c.senzaSoggetto, 3); assert.strictEqual(c.gruppi.length, 3);
  assert.ok(c.gruppi.every((g) => g.opzioni.every((o) => o.soggetto)));
  const a = Z.preparaGruppi(v, 'chi');
  assert.strictEqual(a.gruppi.find((g) => g.nome === 'bere').opzioni.length, 5, '3 con soggetto + 2 senza (ognuna vale per sé)');
  assert.strictEqual(a.gruppi.find((g) => g.nome === 'correre'), undefined, 'una sola immagine: niente distrattori');
  assert.deepStrictEqual(a.soloUna.map((x) => [x.nome, x.motivo]), [['correre', 'una sola immagine']]);
  assert.ok(Z.avvisi(c, 'cosa').some((t) => /3 immagini senza soggetto escluse/.test(t)));
  assert.ok(Z.avvisi(a, 'chi').some((t) => /3 immagini senza soggetto/.test(t) && /sola parola/.test(t)));
  assert.ok(Z.avvisi(a, 'chi').some((t) => /1 gruppo escluso/.test(t) && /correre/.test(t)));
  assert.deepStrictEqual(Z.avvisi(Z.preparaGruppi(set, 'chi'), 'chi'), [], 'nessun avviso se tutto è a posto');
});
prova('un gruppo con una sola immagine, o sempre la stessa azione, si esclude con il motivo', () => {
  const r = Z.preparaGruppi([img('bere', 'nonno'), img('bere', 'nonno'), img('mangiare', 'mamma'), img('mangiare', 'bimbo')], 'chi');
  assert.deepStrictEqual(r.gruppi.map((g) => g.nome), ['mangiare']);
  assert.deepStrictEqual(r.soloUna, [{ nome: 'bere', motivo: 'sempre lo stesso soggetto' }]);
  const c = Z.preparaGruppi([img('bere', 'nonno'), img('bere', 'mamma'), img('bere', 'mamma')], 'cosa');
  assert.deepStrictEqual(c.soloUna.map((x) => [x.nome, x.motivo]), [['nonno', 'una sola immagine'], ['mamma', 'sempre la stessa azione']]);
  assert.strictEqual(c.gruppi.length, 0);
});
prova('nessun gruppo giocabile: elenco vuoto, non un errore', () => {
  assert.strictEqual(Z.preparaGruppi([], 'chi').gruppi.length, 0);
  assert.strictEqual(Z.preparaGruppi(null, 'cosa').gruppi.length, 0);
  assert.strictEqual(Z.preparaGruppi([img('bere', 'nonno')], 'chi').gruppi.length, 0);
});
prova('i bersagli sono tutte le opzioni di tutti i gruppi', () => {
  const b = Z.bersagli(Z.preparaGruppi(set, 'chi').gruppi);
  assert.strictEqual(b.length, 9);
});
prova('il mazzo: ogni giro ha tutti i bersagli, e lo stesso bersaglio non esce due volte di fila (nemmeno fra un giro e l\'altro)', () => {
  const gr = Z.preparaGruppi(set, 'chi').gruppi, tutti = Z.bersagli(gr);
  for (let prova_ = 1; prova_ <= 30; prova_++) {
    const rnd = seme(prova_), m = Z.nuovoMazzo(), uscite = [];
    for (let i = 0; i < 9 * 4; i++) uscite.push(Z.estrai(m, tutti, rnd));
    for (let g = 0; g < 4; g++) assert.strictEqual(new Set(uscite.slice(g * 9, g * 9 + 9).map(Z.chiaveBersaglio)).size, 9, 'un giro li contiene tutti');
    for (let i = 1; i < uscite.length; i++) assert.notStrictEqual(Z.chiaveBersaglio(uscite[i]), Z.chiaveBersaglio(uscite[i - 1]), 'di fila');
  }
});
prova('il mazzo con due soli bersagli alterna senza ripetere', () => {
  const gr = Z.preparaGruppi([img('bere', 'a'), img('bere', 'b')], 'chi').gruppi, tutti = Z.bersagli(gr), m = Z.nuovoMazzo(), rnd = seme(5);
  let prec = null;
  for (let i = 0; i < 20; i++) { const b = Z.estrai(m, tutti, rnd), k = Z.chiaveBersaglio(b); assert.notStrictEqual(k, prec); prec = k; }
  assert.strictEqual(Z.estrai(Z.nuovoMazzo(), [], rnd), null);
});
prova('il field: il bersaglio c\'è sempre, dello stesso gruppo; la misura segue il field (0 = tutte)', () => {
  const gr = Z.preparaGruppi(set, 'chi').gruppi, g = gr[0], b = g.opzioni[1];
  assert.strictEqual(Z.campo(g, b, 0, seme(1)).length, 3);
  assert.strictEqual(Z.campo(g, b, 2, seme(1)).length, 2);
  for (let s = 1; s < 40; s++) { const c = Z.campo(g, b, 2, seme(s)); assert.ok(c.includes(b)); assert.strictEqual(new Set(c).size, c.length); assert.ok(c.every((x) => g.opzioni.includes(x))); }
});
prova('field maggiore delle immagini disponibili: si mostrano quelle disponibili', () => {
  const g = Z.preparaGruppi(set, 'chi').gruppi[0];
  assert.strictEqual(Z.campo(g, g.opzioni[0], 12, seme(3)).length, 3);
  const grande = []; for (let i = 0; i < 8; i++) grande.push(img('bere', 'p' + i));
  const G8 = Z.preparaGruppi(grande, 'chi').gruppi[0];
  assert.strictEqual(Z.campo(G8, G8.opzioni[3], 6, seme(3)).length, 6);
  assert.strictEqual(Z.campo(G8, G8.opzioni[3], 3, seme(3)).length, 3);
  assert.strictEqual(Z.campo(G8, G8.opzioni[3], 20, seme(3)).length, 8);
  assert.strictEqual(Z.campo(G8, G8.opzioni[3], 1, seme(3)).length, 2, 'almeno un distrattore');
});
prova('la domanda e la risposta attesa per chi somministra', () => {
  const d1 = Z.domanda('chi', img('bere', 'nonno'));
  assert.strictEqual(d1.titolo, 'Chi lo fa?'); assert.ok(/bere/.test(d1.domanda)); assert.strictEqual(d1.risposta, 'nonno');
  const d2 = Z.domanda('cosa', img('bere', 'nonno'));
  assert.strictEqual(d2.titolo, 'Cosa fa?'); assert.ok(/nonno/.test(d2.domanda)); assert.strictEqual(d2.risposta, 'bere');
  assert.ok(/soggetto non assegnato/.test(Z.domanda('chi', img('bere', '')).risposta));
});
prova('lo stimolo è la coppia azione · soggetto', () => {
  assert.strictEqual(Z.etichetta(img('bere', 'nonno')), 'bere · nonno');
  assert.strictEqual(Z.etichetta(img('bere', '')), 'bere');
  assert.strictEqual(Z.etichetta({ l: 'correre', soggetto: ' zio ' }), 'correre · zio');
});

// ---------- punteggi e dettaglio ----------
const turno = (k, a, s, extra) => Object.assign({ chiave: 'cf_' + k, label: s ? a + ' · ' + s : a, azione: a, soggetto: s }, extra || {});
prova('punteggio e dettaglio per stimolo (un solo set: niente per set)', () => {
  const t = [turno(1, 'bere', 'nonno'), turno(2, 'mangiare', 'mamma'), turno(3, 'bere', 'bambino'), turno(4, 'dormire', 'nonno')];
  const r = Z.riepilogo(t, { cf_1: true, cf_2: false, cf_3: 'prompt' }, []);
  assert.deepStrictEqual([r.v, r.p, r.x, r.tot], [1, 1, 1, 3], 'il turno 4 non è stato segnato');
  assert.deepStrictEqual(r.itemDetails.map((d) => [d.label, d.result]), [['bere · nonno', true], ['mangiare · mamma', false], ['bere · bambino', 'prompt']]);
  assert.deepStrictEqual(r.setBreakdown, []);
  assert.strictEqual(r.itemDetails[0].azione, 'bere'); assert.strictEqual(r.itemDetails[0].soggetto, 'nonno');
  assert.ok(r.itemDetails.every((d) => d.setId === undefined));
});
prova('un turno annullato (risultato tolto) non conta', () => {
  const t = [turno(1, 'bere', 'nonno'), turno(2, 'mangiare', 'mamma')];
  const r = Z.riepilogo(t, { cf_2: true }, []);
  assert.deepStrictEqual([r.v, r.tot, r.itemDetails.length], [1, 1, 1]);
});
prova('più set insieme: totale unico, dettaglio per set e per stimolo con il set di ciascuno', () => {
  const A = { setId: 'sa', setName: 'Azioni A', setCat: 'Verbi' }, B = { setId: 'sb', setName: 'Azioni B', setCat: 'Verbi' };
  const t = [turno(1, 'bere', 'nonno', A), turno(2, 'bere', 'mamma', B), turno(3, 'mangiare', 'nonno', A), turno(4, 'mangiare', 'bimbo', B), turno(5, 'dormire', 'nonno', A)];
  const r = Z.riepilogo(t, { cf_1: true, cf_2: false, cf_3: 'prompt', cf_4: true, cf_5: true }, ['sa', 'sb']);
  assert.deepStrictEqual([r.v, r.p, r.x, r.tot], [3, 1, 1, 5]);
  assert.deepStrictEqual(r.setBreakdown.map((s) => [s.setId, s.correct, s.prompts, s.incorrect, s.total, s.percentage]), [['sa', 2, 1, 0, 3, 67], ['sb', 1, 0, 1, 2, 50]]);
  assert.strictEqual(r.setBreakdown.reduce((n, s) => n + s.correct, 0), r.v, 'la somma dei set è il totale');
  assert.ok(r.itemDetails.every((d) => d.setId && d.setName && d.label));
  assert.deepStrictEqual(G.stimoliDelSet({ itemDetails: r.itemDetails }, 'sb').map((d) => d.label), ['bere · mamma', 'mangiare · bimbo']);
  // l'ordine dei set è quello scelto; un set mai toccato non compare
  assert.deepStrictEqual(Z.riepilogo(t, { cf_1: true, cf_2: true }, ['sb', 'sa']).setBreakdown.map((s) => s.setId), ['sb', 'sa']);
  assert.deepStrictEqual(Z.riepilogo(t, { cf_2: true }, ['sa', 'sb']).setBreakdown.map((s) => s.setId), ['sb']);
  assert.ok(G.haDettaglioPerSet({ setBreakdown: r.setBreakdown }));
});
prova('più set insieme: le immagini della stessa azione di set diversi stanno nello stesso gruppo', () => {
  const sa = [img('bere', 'nonno', { _setId: 'sa', _setName: 'A' }), img('bere', 'mamma', { _setId: 'sa', _setName: 'A' })];
  const sb = [img('bere', 'bimbo', { _setId: 'sb', _setName: 'B' }), img('mangiare', 'bimbo', { _setId: 'sb', _setName: 'B' })];
  const r = Z.preparaGruppi(sa.concat(sb), 'chi');
  assert.strictEqual(r.gruppi.length, 1); assert.deepStrictEqual(r.gruppi[0].opzioni.map((o) => o._setId), ['sa', 'sa', 'sb']);
  assert.strictEqual(r.soloUna[0].nome, 'mangiare');
});
prova('il contatore dei soggetti usati (suggerimenti dell\'editor): dal più usato', () => {
  assert.deepStrictEqual(Z.soggettiUsati(set), ['bambino', 'mamma', 'nonno']);
  assert.deepStrictEqual(Z.soggettiUsati([img('a', 'Nonno'), img('b', 'nonno'), img('c', 'zia'), img('d', '')]), ['Nonno', 'zia']);
});
prova('una seduta di «Chi lo fa?» è una seduta di gioco normale (si registra in giornata come le altre)', () => {
  const s = { date: new Date().toISOString(), mode: 'chi_lo_fa', total: 4, correct: 3, setId: 'sa', setName: 'A' };
  assert.strictEqual(G.eSedutaGioco(s), true);
});
console.log(`\n${ok} riuscite, ${ko} fallite`);
process.exit(ko ? 1 : 0);
