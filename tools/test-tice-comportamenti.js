// Test dei comportamenti problema (js/tice-comportamenti.js)
const C = require('../js/tice-comportamenti.js');
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'ok  ' : 'NO  ') + m); };

const p = { id: 'pz', history: [] };
const colpi = C.crea(p, { nome: 'Colpire', misura: 'frequenza', intensita: true, antecedenti: 'Richiesta\nAttesa', conseguenze: 'Pausa', max: '1', giorni: '2' });
const crisi = C.crea(p, { nome: 'Crisi', misura: 'durata' });
ok(colpi.antecedenti.length === 2 && colpi.obiettivo.max === 1 && colpi.obiettivo.giorni === 2 && crisi.misura === 'durata', 'creazione dai campi del modulo');

// una seduta di 30 minuti: 3 colpi, una crisi di 90 secondi
const b = {};
const r = C.raccolta(b, colpi.id);
C.aggiungi(r, '2026-11-02T15:00:00'); C.aggiungi(r, '2026-11-02T15:10:00'); const e = C.aggiungi(r, '2026-11-02T15:20:00'); e.a = 'Richiesta'; e.i = 2;
const rc = C.raccolta(b, crisi.id);
C.alterna(rc, Date.parse('2026-11-02T15:05:00')); C.alterna(rc, Date.parse('2026-11-02T15:06:30'));
ok(rc.episodi.length === 1 && rc.episodi[0].s === 90 && C.secondiTotali(rc) === 90, 'durata: avvia e ferma');
let s = C.sedute(p, b, '2026-11-02T15:30:00', 30, 'Anna');
ok(s.length === 2 && s[0].episodi === 3 && s[0].fuoriStatistiche && s[0].dettaglio[2].a === 'Richiesta' && s[1].durataSecondi === 90, 'al salvataggio: una voce per comportamento, fuori dalle statistiche');
p.history.push(...s);

// stesso giorno, un'altra persona: 1 colpo in 30 minuti → 4 in un'ora
const b2 = {}; C.aggiungi(C.raccolta(b2, colpi.id), '2026-11-02T17:00:00'); C.raccolta(b2, crisi.id).nonOsservato = true;
s = C.sedute(p, b2, '2026-11-02T17:30:00', 30);
ok(s.length === 1 && s[0].comportamentoId === colpi.id, 'non osservato: non si salva');
p.history.push(...s);
// due giorni dopo: zero episodi in un'ora (zero è un dato)
p.history.push(...C.sedute(p, {}, '2026-11-04T15:00:00', 60));
p.history.push(...C.sedute(p, {}, '2026-11-05T15:00:00', 60));
const pt = C.andamento(p, colpi);
ok(pt.length === 3 && pt[0].valore === 4 && pt[1].valore === 0, 'episodi all\'ora per giorno, sommando i salvataggi dello stesso giorno');
ok(C.aObiettivo(pt, colpi), 'obiettivo: gli ultimi 2 giorni entro il massimo');
ok(C.andamento(p, crisi)[0].valore === 3, 'durata: minuti all\'ora (90 s in 30 min = 3 min/ora)');
const R = C.riepilogo(pt);
ok(R.episodi === 4 && R.antecedenti[0][0] === 'Richiesta' && R.intensita[2] === 1, 'riepilogo ABC e intensità');
ok(/<svg/.test(C.grafico(pt, colpi)) && /obiettivo/.test(C.grafico(pt, colpi)), 'grafico con la linea dell\'obiettivo');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
