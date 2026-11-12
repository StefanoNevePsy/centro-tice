// Test delle note del diario (js/tice-note.js) e della loro unione fra dispositivi
const N = require('../js/tice-note.js');
const U = require('../js/tice-unisci.js');
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'ok  ' : 'NO  ') + m); };
const copia = (x) => JSON.parse(JSON.stringify(x));

// note di prima: un testo per giorno, anche con più paragrafi
const p = { id: 'pz', history: [], dailyNotes: { '2026-11-02': 'Seduta tranquilla.\n\nLa mamma riferisce notti agitate.', '2026-11-03': 'Rinforzo: bolle.' } };
ok(N.allinea(p) && p.diario.length === 3, 'le note di prima diventano voci, un paragrafo ciascuna');
const q = { id: 'pz', history: [], dailyNotes: copia({ '2026-11-02': 'Seduta tranquilla.\n\nLa mamma riferisce notti agitate.', '2026-11-03': 'Rinforzo: bolle.' }) };
N.allinea(q);
ok(p.diario.map((x) => x.id).sort().join() === q.diario.map((x) => x.id).sort().join(), 'due dispositivi che allineano insieme ottengono le stesse voci');
ok(!N.allinea(p), 'allineare di nuovo non cambia niente');

const a = N.aggiungi(p, { testo: 'Due episodi di lancio.', data: '2026-11-03', tag: 'comportamento', autore: 'Marta', email: 'M@x.it' });
ok(a && a.email === 'm@x.it' && p.dailyNotes['2026-11-03'] === 'Rinforzo: bolle.\n\nDue episodi di lancio.', 'una nota nuova entra anche nel testo del giorno');
N.modifica(p, a.id, { testo: 'Tre episodi di lancio.' });
ok(p.dailyNotes['2026-11-03'].endsWith('Tre episodi di lancio.') && !N.allinea(p) && p.diario.length === 4, 'modificata: il testo vecchio non rientra come nota nuova');
N.togli(p, a.id);
ok(p.diario.length === 3 && p.dailyNotes['2026-11-03'] === 'Rinforzo: bolle.', 'tolta: sparisce anche dal testo del giorno');
N.togli(p, p.diario.find((x) => x.data === '2026-11-03').id);
ok(!('2026-11-03' in p.dailyNotes), 'tolta l\'ultima del giorno: il giorno resta senza testo');

// quaderno importato che aggiunge una riga al giorno: diventa una voce sola
p.dailyNotes['2026-11-02'] += '\n\nDal quaderno: stanco.';
N.allinea(p);
ok(p.diario.filter((x) => x.data === '2026-11-02').length === 3, 'una riga aggiunta da fuori diventa nota');

// due colleghe scrivono lo stesso giorno su due dispositivi: restano entrambe
const base = copia(p), A = copia(p), B = copia(p);
N.aggiungi(A, { testo: 'Nota di Anna.', data: '2026-11-05', autore: 'Anna' });
N.aggiungi(B, { testo: 'Nota di Bea.', data: '2026-11-05', autore: 'Bea' });
const unito = U.unisci(base, A, B);
N.allinea(unito);
const g5 = unito.diario.filter((x) => x.data === '2026-11-05');
ok(g5.length === 2 && /Anna/.test(unito.dailyNotes['2026-11-05']) && /Bea/.test(unito.dailyNotes['2026-11-05']), 'due note dello stesso giorno da due dispositivi: restano tutte e due');
// una toglie una nota, l'altra ne aggiunge una lo stesso giorno: quella tolta non torna
const base2 = copia(unito), C = copia(unito), D = copia(unito);
N.togli(C, C.diario.find((x) => x.testo === 'Nota di Anna.').id);
N.aggiungi(D, { testo: 'Terza nota.', data: '2026-11-05' });
const u2 = U.unisci(base2, D, C);
N.allinea(u2);
ok(u2.diario.filter((x) => x.data === '2026-11-05').map((x) => x.testo).sort().join('|') === 'Nota di Bea.|Terza nota.', 'tolta da una parte, aggiunta dall\'altra: la nota tolta non rientra');

const e = N.etichette([{ id: 'scuola', nome: 'Scuola e insegnanti', nascosta: true }, { id: 'c-logopedia', nome: 'Logopedia' }]);
ok(e.length === 7 && e.find((x) => x.id === 'scuola').nascosta && e[6].colore, 'etichette: di serie più quelle del centro, rinominate o nascoste');
ok(N.fissate(p).length === 0 && N.aggiungi(p, { testo: 'Allergia alle arachidi', fissata: true }) && N.fissate(p).length === 1, 'da tenere a mente');
const w = { id: 'pw', history: [] };
const a2 = N.aggiungi(w, { testo: 'Con due.', data: '2026-11-03', autore: 'Marta + Luca', operatoriEmail: ['M@x.it', ''] });
ok(a2 && a2.operatoriEmail.join('|') === 'm@x.it|' && !N.aggiungi(w, { testo: 'x', operatoriEmail: ['', ''] }).operatoriEmail, 'gli operatori con email si ricordano in parallelo ai nomi');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
