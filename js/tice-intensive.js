/**
 * «Intensive tact»: il tact con quattro dati (✓ autonoma, E+ ecoica, E- ecoica errata, ✗ errata), come l'echo to tact
 * della presa dati, e gli stimoli non autonomi che tornano a fine giro.
 *
 * Modulo puro (niente DOM, niente DB: si prova in Node). Lo stato `S` è un oggetto semplice:
 *   { n, ripresenta, giro, coda: [indice dello stimolo…], ordine: [chiave…], prove: { chiave: {idx, r, giro, rimesso} }, seq, pile }
 * - `coda`: gli stimoli ancora da presentare, il primo è quello a schermo; gli indici sono quelli dell'elenco giocato.
 * - `prove`: ogni risposta data (una prova), con la chiave `it_<n>` che il gioco usa in `itemResults`.
 * - Risultati, gli stessi valori degli altri giochi più uno: `true` (✓), `'prompt'` (E+), `'echo_no'` (E-), `false` (✗).
 * - Codici della sequenza: V, P (= E+), E (= E-), X: gli stessi della presa dati.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceIntensive = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var E_PIU = 'prompt', E_MENO = 'echo_no';
  var CODICI = { V: true, P: E_PIU, E: E_MENO, X: false };

  function valido(r) { return r === true || r === E_PIU || r === E_MENO || r === false; }
  /** Il codice di un risultato: V, P (E+), E (E-), X. */
  function codice(r) { return r === true ? 'V' : r === E_PIU ? 'P' : r === E_MENO ? 'E' : 'X'; }
  /** Il risultato a un solo valore per le analisi degli altri giochi: E- vale come errore. */
  function semplice(r) { return r === true ? true : r === E_PIU ? 'prompt' : false; }

  function ordina(n, rnd) {
    var a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    var r = rnd || Math.random;
    for (i = a.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /**
   * Una partita nuova su `n` stimoli (nell'ordine dell'elenco: lo mescola già il gioco, come per il tact).
   *   opz.ripresenta: gli stimoli non autonomi tornano a fine giro (di partenza sì).
   */
  function crea(n, opz) {
    opz = opz || {};
    var coda = [];
    for (var i = 0; i < n; i++) coda.push(i);
    return { n: n, ripresenta: opz.ripresenta !== false, giro: 1, coda: coda, ordine: [], prove: {}, seq: 0, pile: [] };
  }
  /** Lo stimolo a schermo (indice nell'elenco) o null se il giro è finito. */
  function corrente(S) { return S && S.coda.length ? S.coda[0] : null; }
  /** Il giro è finito: non c'è più niente da presentare (almeno una risposta data). */
  function finito(S) { return !!S && S.coda.length === 0 && S.ordine.length > 0; }

  /** Registra la risposta allo stimolo a schermo. Restituisce la chiave della prova, o null se non c'è niente da segnare. */
  function segna(S, r) {
    if (!S || !S.coda.length || !valido(r)) return null;
    var idx = S.coda.shift();
    var chiave = 'it_' + (++S.seq);
    var rimesso = !!S.ripresenta && r !== true;
    if (rimesso) S.coda.push(idx);
    S.prove[chiave] = { idx: idx, r: r, giro: S.giro, rimesso: rimesso };
    S.ordine.push(chiave);
    return chiave;
  }
  /** Annulla l'ultima risposta: lo stimolo torna a schermo. Restituisce la chiave tolta, o null. */
  function annulla(S) {
    if (!S || !S.ordine.length) return null;
    // si annulla l'ultima prova di un giro appena finito: si torna al giro prima
    if (S.pile.length && S.pile[S.pile.length - 1] === S.ordine.length) { S.pile.pop(); S.giro--; S.coda = []; }
    var chiave = S.ordine.pop(), p = S.prove[chiave];
    delete S.prove[chiave];
    if (p.rimesso) S.coda.pop();
    S.coda.unshift(p.idx);
    return chiave;
  }
  /** Un altro giro con tutti gli stimoli, mescolati (solo a giro finito). */
  function nuovoGiro(S, rnd) {
    if (!S || S.coda.length) return false;
    S.pile.push(S.ordine.length);
    S.giro++;
    S.coda = ordina(S.n, rnd);
    return true;
  }
  function setRipresenta(S, v) { if (S) S.ripresenta = !!v; }

  /** I risultati per chiave, nel formato di `itemResults` del gioco. */
  function risultati(S) {
    var o = {};
    S.ordine.forEach(function (k) { o[k] = S.prove[k].r; });
    return o;
  }
  /** I quattro conteggi. */
  function conta(S) {
    var c = { v: 0, p: 0, e: 0, x: 0, tot: 0 };
    ((S && S.ordine) || []).forEach(function (k) {
      var r = S.prove[k].r;
      if (r === true) c.v++; else if (r === E_PIU) c.p++; else if (r === E_MENO) c.e++; else c.x++;
      c.tot++;
    });
    return c;
  }
  /** I quattro conteggi di un elenco di risultati qualsiasi (anche di `itemResults`). */
  function contaRisultati(res) {
    var c = { v: 0, p: 0, e: 0, x: 0, tot: 0 };
    Object.keys(res || {}).forEach(function (k) {
      var r = res[k];
      if (!valido(r)) return;
      if (r === true) c.v++; else if (r === E_PIU) c.p++; else if (r === E_MENO) c.e++; else c.x++;
      c.tot++;
    });
    return c;
  }
  function percentuale(c) { return c.tot ? Math.round(c.v / c.tot * 100) : 0; }

  /** Quanti stimoli sono ancora da presentare e quanti sono già autonomi (almeno una volta ✓ all'ultima prova). */
  function stato(S) {
    var ultimo = {};
    S.ordine.forEach(function (k) { ultimo[S.prove[k].idx] = S.prove[k].r; });
    var autonomi = Object.keys(ultimo).filter(function (i) { return ultimo[i] === true; }).length;
    return { daFare: S.coda.length, autonomi: autonomi, giro: S.giro };
  }

  /**
   * Il risultato da salvare.
   *   giocati: gli stimoli del gioco ({label|l, _setId?, _setName?, _setCat?}); ordineSet: gli id dei set scelti.
   * Restituisce { v, p, e, x, tot, percentuale, sequenza, itemDetails, setBreakdown }:
   * - `itemDetails`: uno per stimolo, nell'ordine in cui è comparso la prima volta: `result` è la prima risposta
   *   (E- vale come errore), `risposte` la sequenza di tutte le sue risposte («XEV»), `prove` quante;
   * - `setBreakdown`: per set, con E+ in `prompts`, E- in `echoNo`, ✗ in `incorrect` (se gli stimoli portano il set).
   */
  function riepilogo(S, giocati, ordineSet) {
    var c = conta(S), perStimolo = {}, ordStim = [], perSet = {}, visti = [], sequenza = '';
    S.ordine.forEach(function (k) {
      var p = S.prove[k], it = (giocati || [])[p.idx] || {}, cod = codice(p.r);
      sequenza += cod;
      if (!perStimolo[p.idx]) {
        var d = { label: it.label || it.l || ('Item ' + (p.idx + 1)), result: semplice(p.r), risposte: '', prove: 0 };
        if (it._setId) { d.setId = it._setId; d.setName = it._setName || ''; }
        perStimolo[p.idx] = d; ordStim.push(p.idx);
      }
      perStimolo[p.idx].risposte += cod;
      perStimolo[p.idx].prove++;
      var sid = it._setId;
      if (sid) {
        if (!perSet[sid]) { perSet[sid] = { setId: sid, setName: it._setName || '', setCat: it._setCat || '', correct: 0, prompts: 0, echoNo: 0, incorrect: 0, total: 0, percentage: 0 }; visti.push(sid); }
        var s = perSet[sid];
        if (p.r === true) s.correct++; else if (p.r === E_PIU) s.prompts++; else if (p.r === E_MENO) s.echoNo++; else s.incorrect++;
        s.total++;
      }
    });
    var seq = (ordineSet || []).filter(function (i) { return perSet[i]; }).concat(visti.filter(function (i) { return (ordineSet || []).indexOf(i) < 0; }));
    var setBreakdown = seq.map(function (i) { var s = perSet[i]; s.percentage = s.total ? Math.round(s.correct / s.total * 100) : 0; return s; });
    return {
      v: c.v, p: c.p, e: c.e, x: c.x, tot: c.tot, percentuale: percentuale(c), sequenza: sequenza,
      itemDetails: ordStim.map(function (i) { return perStimolo[i]; }), setBreakdown: setBreakdown
    };
  }

  /** «XEV» → «✗ → E- → ✓», per schede ed elenchi. */
  function testoSequenza(risposte) {
    return String(risposte || '').split('').map(function (c) { return c === 'V' ? '✓' : c === 'P' ? 'E+' : c === 'E' ? 'E-' : '✗'; }).join(' → ');
  }

  return {
    E_PIU: E_PIU, E_MENO: E_MENO, CODICI: CODICI,
    valido: valido, codice: codice, semplice: semplice,
    crea: crea, corrente: corrente, finito: finito, segna: segna, annulla: annulla, nuovoGiro: nuovoGiro, setRipresenta: setRipresenta,
    risultati: risultati, conta: conta, contaRisultati: contaRisultati, percentuale: percentuale, stato: stato,
    riepilogo: riepilogo, testoSequenza: testoSequenza
  };
});
