/**
 * «Chi lo fa?» e «Cosa fa?»: la logica delle due modalità (pura, niente DOM: si prova in Node).
 *
 * I set di azioni hanno più immagini con la STESSA parola (`label`, es. 6 × «bere»): la stessa azione
 * svolta da persone diverse. Ogni immagine può avere il campo facoltativo `soggetto` («nonno», «mamma»…).
 *
 *   «Chi lo fa?»  (modo 'chi')  esce un'azione; il field mostra le immagini di quell'azione (soggetti
 *                               diversi) e il bersaglio è UNA di esse: «Chi beve?» → il nonno.
 *   «Cosa fa?»    (modo 'cosa') esce un soggetto; il field mostra lo stesso soggetto che fa azioni diverse
 *                               e il bersaglio è una di esse: «Il nonno cosa fa?» → beve.
 *
 * Lo stimolo registrato è la coppia azione + soggetto: «bere · nonno».
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceAzioni = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MODI = { chi_lo_fa: 'chi', cosa_fa: 'cosa' };
  /** Il modo ('chi' | 'cosa') di una modalità di gioco, o null se non è una delle due. */
  function modoDi(engine) { return MODI[engine] || null; }
  function eAzioneSoggetto(engine) { return !!MODI[engine]; }

  function pulisci(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function norm(s) { return pulisci(s).toLowerCase(); }
  function azioneDi(it) { return pulisci(it && (it.label != null ? it.label : it.l)); }
  function soggettoDi(it) { return pulisci(it && it.soggetto); }
  /** L'immagine si può giocare? (c'è un'immagine e non è nascosta) */
  function giocabile(it) { return !!(it && it.url && !it.hidden); }

  /** Il testo che identifica lo stimolo nei dati: «bere · nonno» (senza soggetto: solo l'azione). */
  function etichetta(it) {
    var a = azioneDi(it), s = soggettoDi(it);
    return s ? a + ' · ' + s : a;
  }

  /** Gli elementi di un elenco senza ripetizioni della chiave (restano i primi). */
  function distinti(lista, chiave) {
    var visti = {}, fuori = [];
    lista.forEach(function (x) {
      var k = chiave(x);
      if (k === null) { fuori.push(x); return; } // senza chiave: ognuno vale per sé
      if (visti[k]) return;
      visti[k] = true; fuori.push(x);
    });
    return fuori;
  }

  /**
   * Divide gli stimoli in gruppi giocabili.
   *   modo 'chi':  un gruppo per azione (stessa parola); le opzioni sono le immagini di soggetti diversi
   *                (due immagini dello stesso soggetto contano una volta; senza soggetto valgono tutte).
   *   modo 'cosa': un gruppo per soggetto; le opzioni sono azioni diverse (le immagini senza soggetto
   *                sono escluse). Un gruppo con meno di 2 opzioni non ha distrattori e viene escluso.
   * Restituisce { gruppi, esclusi, senzaSoggetto, soloUna, immagini }:
   *   gruppi:        [{ chiave, nome, opzioni: [item…] }] già giocabili (≥ 2 opzioni)
   *   senzaSoggetto: immagini giocabili senza soggetto (in 'cosa' sono escluse, in 'chi' si usano lo stesso)
   *   soloUna:       i gruppi con una sola opzione, scartati: [{ nome, motivo }]
   */
  function preparaGruppi(items, modo) {
    var tutte = (items || []).filter(giocabile);
    var senzaSoggetto = tutte.filter(function (i) { return !soggettoDi(i); }).length;
    var per = modo === 'cosa' ? soggettoDi : azioneDi;
    var ammesse = modo === 'cosa' ? tutte.filter(function (i) { return soggettoDi(i); }) : tutte.filter(function (i) { return azioneDi(i); });
    var mappa = {}, ordine = [];
    ammesse.forEach(function (it) {
      var k = norm(per(it));
      if (!mappa[k]) { mappa[k] = { chiave: k, nome: per(it), tutte: [] }; ordine.push(k); }
      mappa[k].tutte.push(it);
    });
    var gruppi = [], soloUna = [];
    ordine.forEach(function (k) {
      var g = mappa[k];
      var opz = modo === 'cosa'
        ? distinti(g.tutte, function (i) { return norm(azioneDi(i)); })
        : distinti(g.tutte, function (i) { return soggettoDi(i) ? norm(soggettoDi(i)) : null; });
      if (opz.length >= 2) gruppi.push({ chiave: g.chiave, nome: g.nome, opzioni: opz });
      else soloUna.push({ nome: g.nome, motivo: g.tutte.length > 1 ? (modo === 'cosa' ? 'sempre la stessa azione' : 'sempre lo stesso soggetto') : 'una sola immagine' });
    });
    return { gruppi: gruppi, soloUna: soloUna, senzaSoggetto: senzaSoggetto, immagini: tutte.length };
  }

  /** Tutti i possibili bersagli: ogni opzione di ogni gruppo valido. */
  function bersagli(gruppi) {
    var l = [];
    (gruppi || []).forEach(function (g, gi) { g.opzioni.forEach(function (it, oi) { l.push({ gruppo: gi, opzione: oi, item: it }); }); });
    return l;
  }
  /** La chiave di un bersaglio (azione + soggetto + gruppo): serve a non ripetere lo stesso due volte di fila. */
  function chiaveBersaglio(b) { return b.gruppo + '|' + norm(azioneDi(b.item)) + '|' + norm(soggettoDi(b.item)) + '|' + (b.item._setId || ''); }

  function mescola(a, rnd) {
    var v = a.slice(), r = rnd || Math.random;
    for (var i = v.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = v[i]; v[i] = v[j]; v[j] = t; }
    return v;
  }

  /**
   * Il mazzo dei bersagli: ogni giro li contiene tutti, mescolati; all'inizio di un nuovo giro il primo
   * non è l'ultimo uscito. mazzo: { coda: [], ultimo: chiave|null, giro: n }.
   */
  function nuovoMazzo() { return { coda: [], ultimo: null, giro: 0 }; }
  function estrai(mazzo, tutti, rnd) {
    if (!tutti || !tutti.length) return null;
    if (!mazzo.coda.length) {
      var c = mescola(tutti, rnd);
      if (c.length > 1 && mazzo.ultimo != null && chiaveBersaglio(c[0]) === mazzo.ultimo) {
        var k = c.findIndex(function (b) { return chiaveBersaglio(b) !== mazzo.ultimo; });
        if (k > 0) { var t = c[0]; c[0] = c[k]; c[k] = t; }
      }
      mazzo.coda = c; mazzo.giro++;
    }
    var b = mazzo.coda.shift();
    // fra due giri con pochi bersagli: mai lo stesso di fila
    if (tutti.length > 1 && mazzo.ultimo != null && chiaveBersaglio(b) === mazzo.ultimo) {
      if (mazzo.coda.length) { var altro = mazzo.coda.shift(); mazzo.coda.push(b); b = altro; }
    }
    mazzo.ultimo = chiaveBersaglio(b);
    return b;
  }

  /**
   * Le carte del field per un bersaglio: il bersaglio più altre opzioni dello stesso gruppo, mescolate.
   * n: il «Field» scelto (0 = tutte); con più carte di quelle disponibili si mostrano quelle disponibili.
   */
  function campo(gruppo, bersaglio, n, rnd) {
    var altre = mescola(gruppo.opzioni.filter(function (o) { return o !== bersaglio; }), rnd);
    var max = n > 0 ? Math.min(n, gruppo.opzioni.length) : gruppo.opzioni.length;
    max = Math.max(2, max);
    return mescola([bersaglio].concat(altre.slice(0, max - 1)), rnd);
  }

  /** La domanda per chi somministra e la risposta attesa. */
  function domanda(modo, bersaglio) {
    var a = azioneDi(bersaglio), s = soggettoDi(bersaglio);
    if (modo === 'cosa') return { titolo: 'Cosa fa?', domanda: '«' + s + '» cosa fa?', risposta: a, azione: a, soggetto: s };
    return { titolo: 'Chi lo fa?', domanda: 'Chi lo fa: «' + a + '»?', risposta: s || '(l\'immagine indicata: soggetto non assegnato)', azione: a, soggetto: s };
  }

  /** L'avviso per chi somministra: che cosa è stato escluso e perché ('' se niente). */
  function avvisi(info, modo) {
    var l = [];
    if (modo === 'cosa' && info.senzaSoggetto > 0) {
      l.push(info.senzaSoggetto + (info.senzaSoggetto === 1 ? ' immagine senza soggetto esclusa' : ' immagini senza soggetto escluse') + ' (assegna il soggetto nell\'editor del set)');
    }
    if (modo === 'chi' && info.senzaSoggetto > 0) {
      l.push(info.senzaSoggetto + (info.senzaSoggetto === 1 ? ' immagine senza soggetto' : ' immagini senza soggetto') + ': si gioca con la sola parola, senza la risposta attesa');
    }
    if (info.soloUna && info.soloUna.length) {
      var nomi = info.soloUna.map(function (x) { return x.nome; });
      var tanti = nomi.length > 4 ? nomi.slice(0, 4).join(', ') + '…' : nomi.join(', ');
      l.push(nomi.length + (nomi.length === 1 ? ' gruppo escluso' : ' gruppi esclusi') + ' per mancanza di distrattori (' + tanti + ')');
    }
    return l;
  }

  /**
   * Il dettaglio di una seduta a partire dai turni giocati.
   *   turni:     [{ chiave, label, azione, soggetto, setId?, setName?, setCat? }]
   *   risultati: { chiave: true | 'prompt' | false }
   *   ordine:    gli id dei set nell'ordine scelto (per l'elenco per set)
   * Restituisce { v, p, x, tot, itemDetails, setBreakdown } (setBreakdown solo se i set sono più d'uno).
   */
  function riepilogo(turni, risultati, ordine) {
    var v = 0, p = 0, x = 0, itemDetails = [], perSet = {}, visti = [];
    (turni || []).forEach(function (t) {
      var r = (risultati || {})[t.chiave];
      if (r !== true && r !== 'prompt' && r !== false) return;
      if (r === true) v++; else if (r === 'prompt') p++; else x++;
      var d = { label: t.label, result: r };
      if (t.azione) d.azione = t.azione;
      if (t.soggetto) d.soggetto = t.soggetto;
      if (t.setId) {
        d.setId = t.setId; d.setName = t.setName || '';
        if (!perSet[t.setId]) { perSet[t.setId] = { setId: t.setId, setName: t.setName || '', setCat: t.setCat || '', correct: 0, prompts: 0, incorrect: 0, total: 0, percentage: 0 }; visti.push(t.setId); }
        var s = perSet[t.setId];
        if (r === true) s.correct++; else if (r === 'prompt') s.prompts++; else s.incorrect++;
        s.total++;
      }
      itemDetails.push(d);
    });
    var seq = (ordine || []).filter(function (i) { return perSet[i]; }).concat(visti.filter(function (i) { return (ordine || []).indexOf(i) < 0; }));
    var setBreakdown = seq.map(function (i) { var s = perSet[i]; s.percentage = s.total ? Math.round(s.correct / s.total * 100) : 0; return s; });
    return { v: v, p: p, x: x, tot: v + p + x, itemDetails: itemDetails, setBreakdown: setBreakdown };
  }

  /** I soggetti già usati in un elenco di immagini (per i suggerimenti dell'editor), dal più usato. */
  function soggettiUsati(items) {
    var n = {}, nomi = {};
    (items || []).forEach(function (i) { var s = soggettoDi(i); if (s) { var k = norm(s); n[k] = (n[k] || 0) + 1; if (!nomi[k]) nomi[k] = s; } });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || (nomi[a] < nomi[b] ? -1 : 1); }).map(function (k) { return nomi[k]; });
  }

  return {
    modoDi: modoDi, eAzioneSoggetto: eAzioneSoggetto, norm: norm, azioneDi: azioneDi, soggettoDi: soggettoDi, etichetta: etichetta,
    giocabile: giocabile, preparaGruppi: preparaGruppi, bersagli: bersagli, chiaveBersaglio: chiaveBersaglio, nuovoMazzo: nuovoMazzo,
    estrai: estrai, campo: campo, domanda: domanda, avvisi: avvisi, riepilogo: riepilogo, soggettiUsati: soggettiUsati, mescola: mescola
  };
});
