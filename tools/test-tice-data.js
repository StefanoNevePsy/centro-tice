// Test della data delle voci (js/tice-data.js): il momento di una seduta registrata a posteriori, lo spostamento
// a un'altra data di una voce o di una giornata, e la fusione fra due dispositivi prima e dopo lo spostamento.
const D = require('../js/tice-data.js');
const N = require('../js/tice-note.js');
const U = require('../js/tice-unisci.js');
const C = require('../js/tice-comportamenti.js');
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'ok  ' : 'NO  ') + m); };
const copia = (x) => JSON.parse(JSON.stringify(x));
const giorno = D.giorno;

// ---------- il momento di una voce salvata da una seduta ----------
const adesso = new Date(2026, 10, 19, 15, 42, 7);   // 19 novembre 2026, ore 15:42 (locale)
ok(D.quando('2026-11-19', '', adesso) === adesso.toISOString(), 'oggi: l\'ora reale');
ok(D.quando('2026-11-10', '', adesso) === '2026-11-10T12:00:00', 'un giorno passato: mezzogiorno di quel giorno, non l\'ora di adesso');
ok(giorno(D.quando('2026-11-10', '', adesso)) === '2026-11-10', 'la voce di un giorno passato cade in quel giorno (calendario locale)');
ok(D.quando('2026-11-10', '09:30', adesso) === '2026-11-10T09:30:00' && D.quando('2026-11-19', '9:05', adesso) === '2026-11-19T09:05:00', 'con un\'ora scelta, vale quella (anche oggi)');
ok(D.quando('2026-11-10', 'xx', adesso) === '2026-11-10T12:00:00' && D.oraValida('25:00') === '', 'un\'ora non valida si ignora');

// ---------- i comportamenti di una seduta a posteriori: anche gli episodi sono di quel giorno ----------
const pc = { comportamenti: [{ id: 'cp1', nome: 'Colpire', stato: 'attivo', misura: 'frequenza' }], history: [] };
const ora15 = new Date(2026, 10, 19, 15, 30, 0).toISOString();
const bz = { comp: { cp1: { episodi: [{ id: 'ep1', t: ora15 }, { id: 'ep2', t: ora15 }], inCorso: null } } };
const sc = C.sedute(pc, bz, '2026-11-10T12:00:00', 60, 'Anna');
ok(sc.length === 1 && giorno(sc[0].date) === '2026-11-10' && sc[0].dettaglio.every((e) => giorno(e.t) === '2026-11-10'), 'comportamenti a posteriori: la voce e i suoi episodi sono nel giorno della seduta');
ok(sc[0].dettaglio[0].t.endsWith('T15:30:00'), 'gli episodi tengono l\'orario');
const sOggi = C.sedute(pc, { comp: { cp1: { episodi: [{ id: 'e', t: ora15 }] } } }, adesso.toISOString(), 60, 'Anna');
ok(sOggi[0].dettaglio[0].t === ora15, 'seduta di oggi: gli episodi non cambiano');

// ---------- le note di un giorno passato non portano l'ora di adesso ----------
const pn = { id: 'pn', history: [] };
const nPass = N.aggiungi(pn, { testo: 'Nota a posteriori', data: '2020-01-05' });
ok(nPass.il === '2020-01-05T12:00:00' && giorno(nPass.il) === nPass.data, 'nota di un giorno passato: l\'ora è di quel giorno');
const nOggi = N.aggiungi(pn, { testo: 'Nota di oggi', data: giorno(new Date()) });
ok(giorno(nOggi.il) === giorno(new Date()), 'nota di oggi: l\'ora reale');

// ---------- un bambino con due giornate ----------
function bambino() {
  const p = {
    id: 'pz', name: 'Prova',
    programma: { attivita: [{ id: 'a1', nome: 'Tact', target: [{ id: 't1', testo: 'Set 1', stato: 'attivo', inizio: '2026-11-10' }] }] },
    history: [
      { id: 'sx_1', date: '2026-11-10T09:15:00', setName: 'Tact · Set 1', attivitaId: 'a1', targetId: 't1', correct: 8, total: 10, operatore: 'Anna', operatoriEmail: ['anna@c.it'] },
      { id: 'sx_2', date: '2026-11-10T09:40:00', setName: 'Mand', correct: 3, total: 4, operatore: 'Anna', operatoriEmail: ['anna@c.it'] },
      { id: 'cs_1', date: '2026-11-10T12:00:00', mode: 'comportamento', comportamentoId: 'cp1', setName: 'Colpire', episodi: 2, fuoriStatistiche: true,
        dettaglio: [{ t: '2026-11-10T09:20:00' }, { t: '2026-11-10T09:35:00' }], operatore: 'Anna' },
      { id: 'sx_3', date: '2026-11-12T10:00:00', setName: 'Tact · Set 1', attivitaId: 'a1', targetId: 't1', correct: 9, total: 10, operatore: 'Bea' },
    ],
    diario: [], dailyNotes: {}, comportamenti: [{ id: 'cp1', nome: 'Colpire', stato: 'attivo', misura: 'frequenza' }],
    learnUnitStoriche: [{ data: '2026-11-10', totali: 12 }],
  };
  N.aggiungi(p, { testo: 'Seduta tranquilla.', data: '2026-11-10', il: '2026-11-10T10:30:00', tag: 'seduta', autore: 'Anna', email: 'anna@c.it', operatoriEmail: ['anna@c.it'] });
  N.aggiungi(p, { testo: 'Nota del 12.', data: '2026-11-12', il: '2026-11-12T11:00:00', autore: 'Bea' });
  return p;
}
const tutte = (p, g) => p.history.filter((s) => giorno(s.date) === g);

// ---------- una voce ----------
{
  const p = bambino(), s = p.history[0];
  const r = D.spostaVoce(p, s, '2026-11-05', { chi: 'Marta', adesso });
  ok(r && giorno(s.date) === '2026-11-05' && s.date === '2026-11-05T09:15:00', 'voce: cambia giorno e tiene l\'ora');
  ok(s.id === 'sx_1' && s.correct === 8 && s.operatore === 'Anna' && s.operatoriEmail[0] === 'anna@c.it', 'voce: id, conteggi e chi ha svolto restano');
  ok(s.correzioni.length === 1 && s.correzioni[0].campo === 'data' && s.correzioni[0].da === '2026-11-10T09:15:00' && s.correzioni[0].chi === 'Marta', 'voce: la correzione resta scritta (da dove, chi)');
  ok(p.programma.attivita[0].target[0].inizio === '2026-11-05', 'voce: il target che iniziava dopo comincia dal giorno della voce più antica');
  r.annulla();
  ok(s.date === '2026-11-10T09:15:00' && !s.correzioni && p.programma.attivita[0].target[0].inizio === '2026-11-10', 'voce: annulla riporta tutto com\'era');
  D.spostaVoce(p, s, '2026-11-10', { ora: '14:20' });
  ok(s.date === '2026-11-10T14:20:00', 'voce: solo l\'ora, nello stesso giorno');
  ok(D.spostaVoce(p, s, '2026-11-10', { ora: '14:20' }) === null, 'voce: stessa data e ora, niente da fare');
  const c = p.history[2];
  D.spostaVoce(p, c, '2026-11-08');
  ok(giorno(c.date) === '2026-11-08' && c.dettaglio.every((e) => giorno(e.t) === '2026-11-08') && c.dettaglio[0].t.endsWith('T09:20:00'), 'voce di comportamento: anche gli episodi seguono');
}

// ---------- una giornata, data di arrivo vuota ----------
{
  const p = bambino();
  const prima = D.contenuto(p, '2026-11-10');
  ok(prima.attivita === 2 && prima.comportamenti === 1 && prima.note === 1 && prima.tabelle === 1, 'giornata: contenuto (2 attività, 1 comportamento, 1 nota, 1 tabella importata)');
  const r = D.spostaGiornata(p, '2026-11-10', '2026-11-07', { chi: 'Marta', adesso });
  ok(r && !r.occupata && r.spostate.attivita === 2 && r.spostate.comportamenti === 1 && r.spostate.note === 1, 'giornata: sposta tutto');
  ok(tutte(p, '2026-11-10').length === 0 && tutte(p, '2026-11-07').length === 3 && tutte(p, '2026-11-12').length === 1, 'giornata: nulla resta nella data di partenza, la giornata del 12 non si tocca');
  ok(p.history.length === 4 && p.history.every((s) => s.id), 'giornata: nessuna voce persa o duplicata');
  const note = p.diario.find((x) => x.testo === 'Seduta tranquilla.');
  ok(note.data === '2026-11-07' && note.il === '2026-11-07T10:30:00' && note.id && note.tag === 'seduta' && note.operatoriEmail[0] === 'anna@c.it', 'giornata: la nota di seduta segue, con id, etichetta e chi ha svolto');
  ok(p.dailyNotes['2026-11-07'] === 'Seduta tranquilla.' && !('2026-11-10' in p.dailyNotes) && p.dailyNotes['2026-11-12'] === 'Nota del 12.', 'giornata: il testo del giorno (dailyNotes) si sposta con le note');
  ok(!N.allinea(p) && p.diario.length === 2, 'giornata: riallineare le note non rimette la nota nel giorno vecchio');
  ok(p.learnUnitStoriche[0].data === '2026-11-07', 'giornata: anche le tabelle importate');
  const sm = p.history.find((s) => s.id === 'cs_1');
  ok(sm.dettaglio.every((e) => giorno(e.t) === '2026-11-07') && p.history.filter((s) => giorno(s.date) === '2026-11-07').every((s) => s.operatore === 'Anna'), 'giornata: episodi dei comportamenti e chi ha svolto');
  r.annulla();
  ok(tutte(p, '2026-11-10').length === 3 && tutte(p, '2026-11-07').length === 0 && p.dailyNotes['2026-11-10'] === 'Seduta tranquilla.' && !('2026-11-07' in p.dailyNotes) && p.learnUnitStoriche[0].data === '2026-11-10' && p.diario.find((x) => x.testo === 'Seduta tranquilla.').il === '2026-11-10T10:30:00',
    'giornata: annulla riporta tutto com\'era');
}

// ---------- una giornata, data di arrivo con già dei dati ----------
{
  const p = bambino();
  const r0 = D.spostaGiornata(p, '2026-11-10', '2026-11-12');
  ok(r0 && r0.occupata && r0.occupata.attivita === 1 && r0.occupata.note === 1 && tutte(p, '2026-11-10').length === 3, 'arrivo occupato: senza «unisci» non si muove niente e si dice cosa c\'è');
  const r = D.spostaGiornata(p, '2026-11-10', '2026-11-12', { unisci: true });
  ok(r && r.unita && tutte(p, '2026-11-12').length === 4 && tutte(p, '2026-11-10').length === 0, 'unisci: le voci dei due giorni stanno insieme');
  ok(p.diario.length === 2 && p.diario.every((x) => x.data === '2026-11-12') && p.dailyNotes['2026-11-12'].split('\n\n').length === 2, 'unisci: le due note restano, il testo del giorno le contiene entrambe');
  ok(!('2026-11-10' in p.dailyNotes), 'unisci: il giorno di partenza non ha più testo');
  r.annulla();
  ok(tutte(p, '2026-11-12').length === 1 && tutte(p, '2026-11-10').length === 3 && p.dailyNotes['2026-11-12'] === 'Nota del 12.', 'unisci: annulla rimette le due giornate come prima');
}
ok(D.spostaGiornata(bambino(), '2026-11-03', '2026-11-04') === null && D.spostaGiornata(bambino(), '2026-11-10', '2026-11-10') === null, 'una giornata vuota o la stessa data: niente da fare');

// ---------- due dispositivi: la fusione prima e dopo lo spostamento ----------
const fondi = (base, a, b) => { const u = U.unisci(base, a, b); N.allinea(u); return u; };
const ids = (p) => p.history.map((s) => s.id).sort().join();
{
  // base: l'ultima copia sincronizzata, uguale sui due dispositivi
  const base = bambino(); U.assegnaId(base);
  const A = copia(base), B = copia(base);
  D.spostaGiornata(A, '2026-11-10', '2026-11-07', { chi: 'Marta' });
  // intanto B aggiunge una voce nel giorno che A ha spostato, e una nota al 12
  B.history.push({ id: 'sx_nuova', date: '2026-11-10T15:00:00', setName: 'Mand', correct: 1, total: 2 });
  N.aggiungi(B, { testo: 'Nota di Bea.', data: '2026-11-12', il: '2026-11-12T16:00:00' });
  const u1 = fondi(base, A, B), u2 = fondi(base, B, A);
  ok(u1.history.length === 5 && u2.history.length === 5 && ids(u1) === ids(u2), 'due dispositivi: nessun doppione né voce persa (5 voci, uguali da entrambe le parti)');
  ok(tutte(u1, '2026-11-07').length === 3 && tutte(u1, '2026-11-10').length === 1 && tutte(u1, '2026-11-10')[0].id === 'sx_nuova', 'due dispositivi: le voci spostate stanno nel nuovo giorno, la voce nuova dell\'altro resta dov\'era');
  ok(u1.diario.filter((x) => x.testo === 'Seduta tranquilla.').length === 1 && u1.diario.find((x) => x.testo === 'Seduta tranquilla.').data === '2026-11-07' && u1.diario.length === 3, 'due dispositivi: la nota spostata è una sola e nel nuovo giorno; l\'altra nota si aggiunge');
  ok(!('2026-11-10' in u1.dailyNotes) && u1.dailyNotes['2026-11-07'] === 'Seduta tranquilla.', 'due dispositivi: il testo del giorno (dailyNotes) segue');
  // il custode ha già la copia spostata; il dispositivo B si sincronizza dopo, senza averla toccata
  const dopo = fondi(base, B, A);
  ok(dopo.history.filter((s) => s.id === 'sx_1')[0].date === '2026-11-07T09:15:00', 'B che si sincronizza dopo: vede la data nuova');
}
{
  // voci senza id (registrate prima degli id), mai sincronizzate: lo stesso id ricavato dal contenuto di prima
  const iniziale = bambino(); iniziale.history.forEach((s) => { delete s.id; });
  const A = copia(iniziale), B = copia(iniziale);
  D.spostaVoce(A, A.history[0], '2026-11-05', { chi: 'Marta' });   // assegna gli id PRIMA di cambiare la data
  U.assegnaId(B);                                                    // come fa la sincronizzazione di B prima di inviare
  const u = fondi(null, A, B), v = fondi(null, B, A);
  ok(u.history.length === 4 && v.history.length === 4, 'voci senza id: lo spostamento non crea doppioni sull\'altro dispositivo (4 voci, non 5)');
  ok(giorno(u.history.find((s) => s.setName === 'Tact · Set 1' && s.correct === 8).date) === '2026-11-05', 'voci senza id: la voce spostata ha la data nuova');
  // controllo: senza l'id assegnato prima, la voce spostata avrebbe un id diverso da quello dell'altro dispositivo
  const C1 = copia(iniziale), C2 = copia(iniziale);
  C1.history[0].date = '2026-11-05T09:15:00'; U.assegnaId(C1); U.assegnaId(C2);
  ok(C1.history[0].id !== C2.history[0].id, 'perché serve: assegnare l\'id dopo lo spostamento darebbe un id diverso (doppione)');
}
{
  // la stessa voce spostata sulle due parti a date diverse: nessun doppione, vince chi salva
  const base = bambino(); U.assegnaId(base);
  const A = copia(base), B = copia(base);
  D.spostaVoce(A, A.history[0], '2026-11-05'); D.spostaVoce(B, B.history[0], '2026-11-06');
  const u = fondi(base, A, B);
  ok(u.history.length === 4 && giorno(u.history.find((s) => s.id === 'sx_1').date) === '2026-11-05', 'spostata da due parti a date diverse: una sola voce, vince chi salva');
}

console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
