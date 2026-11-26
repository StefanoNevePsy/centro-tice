/**
 * Giochi con più set insieme e risultati del gioco nella seduta di oggi.
 *
 * Due cose, entrambe pure (niente DOM, niente DB: si provano in Node):
 *
 * 1. PIÙ SET IN UN'ATTIVITÀ. Un target del programma collegato a un set ha `setId`; se l'attività
 *    usa più set insieme il target ha anche `setIds` (elenco completo, il primo uguale a `setId`
 *    così tutto il codice che guarda `setId` continua a funzionare). Il gioco gira una volta sola
 *    con gli stimoli di tutti i set (`unisciSet`: ogni stimolo porta `_setId`/`_setName`), e a fine
 *    gioco `dettaglio` calcola il totale unito, il dettaglio per set (`setBreakdown`, lo stesso
 *    formato delle modalità a scenari) e quello per stimolo (`itemDetails`, con il set di ogni stimolo).
 *
 * 2. GIOCO AVVIATO DIRETTAMENTE. Quando si gioca fuori dalla seduta con un bambino del Centro, la
 *    seduta salvata dal gioco non resta nella cartella: entra nella bozza della seduta di oggi come
 *    attività «una tantum» (`aggiungiInBozza`), con il dettaglio del gioco in `voce.gioco`. Alla
 *    chiusura della seduta `applicaGioco` rimette nella seduta salvata il dettaglio (modalità di
 *    gioco, set, per set e per stimolo), se i conteggi non sono stati modificati nel frattempo.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceGioco = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Le voci dello storico che NON sono sedute di un gioco
  var NON_GIOCO = { quaderno: true, quaderno_task: true, comportamento: true };
  // Una seduta salvata dal gioco è «fresca» entro questi millisecondi
  var FRESCA_MS = 60000;
  // Campi che dopo la chiusura della seduta decide il programma (nome, conteggi, tipo, note), non il gioco
  var DEL_PROGRAMMA = ['id', 'date', 'setName', 'correct', 'prompts', 'total', 'percentage', 'rawV', 'rawP', 'rawE', 'rawX', 'sessionType',
    'timeDelaySeconds', 'note', 'attivitaId', 'targetId', 'operatore', 'operatoriEmail', 'sequenza', 'setId', 'setCat', 'mode'];

  function unici(a) { var v = {}; return a.filter(function (x) { if (v[x]) return false; v[x] = true; return true; }); }

  // ---------- più set in un target ----------
  /** Gli id dei set di un target (o di un oggetto con setId/setIds): [] se non è collegato a un set. */
  function idsSet(t) {
    if (!t) return [];
    var l = Array.isArray(t.setIds) ? t.setIds.filter(Boolean).map(String) : [];
    if (!l.length && t.setId) l = [String(t.setId)];
    return unici(l);
  }
  function insieme(t) { return idsSet(t).length > 1; }
  /** L'id con cui lo storico conosce i set usati insieme (come nelle sedute a scenari: «multi_a_b»). */
  function idUnione(ids) { return ids.length > 1 ? 'multi_' + ids.join('_') : (ids[0] || ''); }
  function idSetDi(t) { return idUnione(idsSet(t)); }
  function titolo(nomi) { return unici((nomi || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean)).join(' + '); }

  /**
   * Gli stimoli di più set in un unico elenco, nell'ordine dei set. Ogni stimolo è una copia e porta
   * il set di provenienza (`_setId`, `_setName`, `_setCat`).
   * sets: [{ id, name, category|cat, items }]
   */
  function unisciSet(sets) {
    var items = [], info = [];
    (sets || []).forEach(function (s) {
      if (!s) return;
      var cat = s.category || s.cat || '';
      info.push({ id: s.id, name: s.name, cat: cat });
      (s.items || []).forEach(function (it) {
        var c = JSON.parse(JSON.stringify(it));
        c._setId = s.id; c._setName = s.name; c._setCat = cat;
        items.push(c);
      });
    });
    var ids = info.map(function (x) { return x.id; });
    return { id: idUnione(ids), ids: ids, nome: titolo(info.map(function (x) { return x.name; })), items: items, sets: info };
  }

  /**
   * Totale unito, dettaglio per set e dettaglio per stimolo di un gioco con più set.
   *   giocati: gli stimoli del gioco (con _setId); risultati: { indice: true | 'prompt' | false }.
   *   ordine: gli id dei set, per dare al dettaglio lo stesso ordine con cui sono stati scelti.
   *   origini: { chiave: indice dello stimolo } per i giochi che non usano l'indice come chiave del risultato
   *            (le scene dei giochi a scenari: la chiave è quella del segnaposto).
   * Restituisce { v, p, x, tot, setBreakdown, itemDetails }.
   */
  function dettaglio(giocati, risultati, ordine, origini) {
    var perSet = {}, visti = [], itemDetails = [], v = 0, p = 0, x = 0;
    Object.keys(risultati || {}).forEach(function (k) {
      var idx = origini && origini[k] != null ? parseInt(origini[k], 10) : parseInt(k, 10), it = isNaN(idx) ? null : (giocati || [])[idx];
      var r = risultati[k];
      if (!it || (r !== true && r !== 'prompt' && r !== false)) return;
      var sid = it._setId || '';
      if (!perSet[sid]) {
        perSet[sid] = { setId: sid, setName: it._setName || '', setCat: it._setCat || '', correct: 0, prompts: 0, incorrect: 0, total: 0, percentage: 0 };
        visti.push(sid);
      }
      var s = perSet[sid];
      if (r === true) { s.correct++; v++; } else if (r === 'prompt') { s.prompts++; p++; } else { s.incorrect++; x++; }
      s.total++;
      var d = { label: it.label || it.l || ('Item ' + (idx + 1)), result: r };
      if (sid) { d.setId = sid; d.setName = it._setName || ''; }
      itemDetails.push(d);
    });
    var seq = (ordine || []).filter(function (i) { return perSet[i]; }).concat(visti.filter(function (i) { return (ordine || []).indexOf(i) < 0; }));
    var setBreakdown = seq.map(function (i) { var s = perSet[i]; s.percentage = s.total ? Math.round(s.correct / s.total * 100) : 0; return s; });
    return { v: v, p: p, x: x, tot: v + p + x, setBreakdown: setBreakdown, itemDetails: itemDetails };
  }

  /** Gli stimoli di un set di una seduta, nell'ordine in cui sono stati giocati. */
  function stimoliDelSet(seduta, setId) {
    return ((seduta && seduta.itemDetails) || []).filter(function (d) { return d.setId === setId; });
  }
  /** La seduta ha il dettaglio per set (e quindi si può mostrare con gli stimoli)? */
  function haDettaglioPerSet(s) { return !!(s && Array.isArray(s.setBreakdown) && s.setBreakdown.length); }

  // ---------- gioco avviato direttamente: dentro la seduta di oggi ----------
  /**
   * Questa voce dello storico è appena stata salvata da un gioco e non è ancora collegata a niente?
   * (senza id né attività del programma, di una modalità di gioco, di pochi istanti fa)
   */
  function eSedutaGioco(s, adesso) {
    if (!s || typeof s !== 'object' || s.id || s.attivitaId || s.fonte) return false;
    if (!s.mode || NON_GIOCO[s.mode] || !(s.total > 0)) return false;
    var t = Date.parse(s.date);
    if (isNaN(t)) return false;
    var d = (adesso != null ? adesso : Date.now()) - t;
    return d >= -5000 && d <= FRESCA_MS;
  }
  /** Impronta di una seduta di gioco, per non registrarla due volte. */
  function firma(s) {
    // rawE (E- dell'intensive tact) entra nell'impronta solo se c'è: le sedute senza E- hanno la stessa impronta di sempre
    return [s.date, s.mode, s.setId, s.setName, s.rawV != null ? s.rawV : s.correct, s.rawP != null ? s.rawP : s.prompts, s.rawX != null ? s.rawX : '', s.total].concat(s.rawE > 0 ? ['E' + s.rawE] : []).join('|');
  }
  /** Il titolo proposto: «Modalità – nome dei set» (il nome del gioco non si ripete se c'è già). */
  function titoloProposto(s, etichettaModo) {
    var nome = String(s.setName || '').trim();
    var et = String((etichettaModo ? etichettaModo(s.mode) : '') || '').trim();
    if (!et || et === s.mode) return nome || 'Gioco';
    if (!nome) return et;
    var n = nome.toLowerCase(), e = et.toLowerCase();
    return n.indexOf(e) >= 0 ? nome : et + ' – ' + nome;
  }
  /** Una seduta di gioco con le quattro risposte dell'echo to tact (✓, E+, E-, ✗): intensive tact. */
  function eEcoico(s) { return !!s && (s.risposte === 'ecoico' || s.rawE > 0); }
  /** I conteggi della seduta di gioco come voce della bozza: V, P (aiutata, E+), E (E-), X. */
  function voceDaSeduta(s) {
    var v = s.rawV != null ? s.rawV : (s.correct || 0);
    var p = s.rawP != null ? s.rawP : (s.prompts || 0);
    var e = s.rawE || 0;
    var x = s.rawX != null ? s.rawX : Math.max(0, (s.total || 0) - v - p - e);
    var voce = {
      v: v, p: p, x: x, sequenza: eEcoico(s) && typeof s.sequenza === 'string' && s.sequenza.length === v + p + e + x ? s.sequenza : '',
      nota: s.note || '', decisione: '', targetId: null, mantenimento: false,
      sessionType: s.sessionType === 'timedelay' ? 'timedelay' : 'independent',
      gioco: JSON.parse(JSON.stringify(s))
    };
    if (e) voce.e = e;
    if (s.timeDelaySeconds != null) voce.tdSeconds = s.timeDelaySeconds;
    return voce;
  }
  /** Già nella bozza (o già salvata nello storico dalla bozza)? */
  function giaRegistrata(bozza, storico, s) {
    var f = firma(s);
    var inBozza = Object.keys((bozza && bozza.voci) || {}).some(function (k) { var g = bozza.voci[k] && bozza.voci[k].gioco; return g && firma(g) === f; });
    if (inBozza) return true;
    return (storico || []).some(function (x) { return x && x.giocoFirma === f; });
  }
  /**
   * La seduta del gioco entra nella bozza come attività una tantum.
   *   bozza: { voci, temp, extra }; nuovoId(prefisso): per l'id dell'attività; etichettaModo(mode): nome del gioco.
   * Restituisce { id, doppione }.
   */
  function aggiungiInBozza(bozza, storico, s, nuovoId, etichettaModo) {
    bozza.voci = bozza.voci || {}; bozza.temp = bozza.temp || []; bozza.extra = bozza.extra || [];
    if (giaRegistrata(bozza, storico, s)) return { id: null, doppione: true };
    var id = nuovoId('tmp');
    var voce = voceDaSeduta(s);
    // «fuori»: una tantum di partenza, senza chiedere dove va alla chiusura (si può cambiare quando si vuole)
    var att = { id: id, nome: titoloProposto(s, etichettaModo), sessionType: voce.sessionType, fuori: true, daGioco: true };
    // intensive tact: l'attività di oggi ha i quattro tasti dell'echo to tact (✓ · E+ · E- · ✗)
    if (eEcoico(s)) att.risposte = 'ecoico';
    bozza.temp.push(att);
    bozza.voci[id] = voce;
    return { id: id, doppione: false };
  }
  /** I conteggi della voce sono ancora quelli del gioco? Allora il dettaglio per set e per stimolo vale. */
  function dettaglioValido(voce) {
    var g = voce && voce.gioco;
    if (!g) return false;
    var v = g.rawV != null ? g.rawV : (g.correct || 0), p = g.rawP != null ? g.rawP : (g.prompts || 0), e = g.rawE || 0;
    var x = g.rawX != null ? g.rawX : Math.max(0, (g.total || 0) - v - p - e);
    return voce.v === v && voce.p === p && voce.x === x && (voce.e || 0) === e;
  }
  /**
   * Alla chiusura della seduta: la voce salvata `s` (fatta dal programma con nome, conteggi, operatore)
   * riprende dal gioco la modalità, i set e il dettaglio.
   *   conSetNelTarget: la voce va in un target già collegato a un set: il suo set (e il nome) restano.
   */
  function applicaGioco(s, voce, conSetNelTarget) {
    var g = voce && voce.gioco;
    if (!g || !s) return s;
    var valido = dettaglioValido(voce);
    var copia = JSON.parse(JSON.stringify(g));
    // dal gioco: tutto quello che il programma non conosce (varianti, field, tag, dettagli)…
    Object.keys(copia).forEach(function (k) { if (!(k in s) && DEL_PROGRAMMA.indexOf(k) < 0) s[k] = copia[k]; });
    s.mode = g.mode || s.mode;
    if (!conSetNelTarget && g.setId) s.setId = g.setId;
    if (!conSetNelTarget && g.setCat) s.setCat = g.setCat;
    if (!valido) {
      // conteggi corretti a mano: il dettaglio del gioco non corrisponde più
      ['itemDetails', 'setBreakdown', 'goNogoBreakdown', 'topoBreakdown', 'memLavTrials', 'memoryStats'].forEach(function (k) { delete s[k]; });
    }
    s.fonte = 'app-gioco';
    s.giocoFirma = firma(g);
    return s;
  }

  // ---------- modalità derivate ----------
  // Alcune modalità non si scelgono nel set: valgono per tutti i set che hanno la modalità di partenza
  // (l'intensive tact per quelli con il tact), così i set già salvati le hanno senza doverli risalvare.
  var DERIVATE = { intensive_tact: 'tact' };
  /** Le modalità di un set, con quelle derivate (se `modes` non è un elenco resta com'è). */
  function modiDelSet(modes) {
    if (!Array.isArray(modes)) return modes;
    var out = modes.slice();
    Object.keys(DERIVATE).forEach(function (k) { if (out.indexOf(DERIVATE[k]) >= 0 && out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  /** La modalità del set da cercare per un gioco: 'tact' per l'intensive tact, il gioco stesso per gli altri. */
  function modoDiPartenza(modo) { return DERIVATE[modo] || modo; }

  return {
    modiDelSet: modiDelSet, modoDiPartenza: modoDiPartenza, eEcoico: eEcoico, DERIVATE: DERIVATE,
    idsSet: idsSet, insieme: insieme, idUnione: idUnione, idSetDi: idSetDi, titolo: titolo, unisciSet: unisciSet,
    dettaglio: dettaglio, stimoliDelSet: stimoliDelSet, haDettaglioPerSet: haDettaglioPerSet,
    eSedutaGioco: eSedutaGioco, firma: firma, titoloProposto: titoloProposto, voceDaSeduta: voceDaSeduta,
    giaRegistrata: giaRegistrata, aggiungiInBozza: aggiungiInBozza, dettaglioValido: dettaglioValido, applicaGioco: applicaGioco,
    NON_GIOCO: NON_GIOCO, FRESCA_MS: FRESCA_MS
  };
});
