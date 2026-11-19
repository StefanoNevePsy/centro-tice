/**
 * Centro TICE — la data delle voci di un bambino.
 *
 * Due compiti, entrambi puri (si provano in Node: tools/test-tice-data.js):
 *   1. `quando(giorno, ora)`: il momento da scrivere su una voce salvata da una seduta del giorno `giorno`.
 *      Oggi: l'ora reale (se non è stata scelta un'ora). Un giorno passato: l'ora scelta, altrimenti le 12:00.
 *      Così una seduta registrata a posteriori non finisce mai in «oggi».
 *   2. Spostare a un'altra data, a posteriori, una voce (spostaVoce) o tutta una giornata (spostaGiornata):
 *      sedute del programma, giochi, comportamenti (con gli orari degli episodi), note del diario, testo del giorno
 *      (dailyNotes) e tabelle storiche importate. Chi ha svolto (operatore, operatoriEmail) resta com'è.
 *
 * Fusione fra dispositivi: le voci si uniscono per `id` (tice-unisci.js), la data non fa parte della chiave.
 * Le voci vecchie senza `id` ricevono prima dello spostamento lo stesso id che darebbe un altro dispositivo
 * (ricavato dal contenuto di prima), altrimenti sull'altro dispositivo resterebbero in doppio.
 *
 * Le date sono testi: 'AAAA-MM-GG' per i giorni, ISO per le voci (come in tutta l'app).
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./tice-unisci.js'), require('./tice-note.js'));
  else radice.TiceData = fabbrica(radice.TiceUnisci, radice.TiceNote);
})(typeof self !== 'undefined' ? self : this, function (U, N) {
  'use strict';

  function due(n) { return (n < 10 ? '0' : '') + n; }
  /** Giorno di calendario locale di un ISO (come TiceProgramma.giorno). */
  function giorno(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso || '').slice(0, 10);
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }
  /** L'orario locale 'HH:MM:SS' di un ISO; senza orario valido, mezzogiorno. */
  function orario(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '12:00:00' : due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds());
  }
  /** 'HH:MM' (o 'HH:MM:SS') valido? Restituisce 'HH:MM:SS' oppure ''. */
  function oraValida(ora) {
    var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(ora || '').trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return '';
    return due(+m[1]) + ':' + m[2] + ':' + due(+(m[3] || 0));
  }
  /** Lo stesso orario (o `ora`, se data) portato sul giorno `g`. */
  function suGiorno(iso, g, ora) {
    var o = oraValida(ora) || orario(iso);
    return g + 'T' + o;
  }

  /**
   * Il momento di una voce salvata da una seduta del giorno `g`.
   *   ora: 'HH:MM' scelta a mano (facoltativa); adesso: Date (per le prove).
   */
  function quando(g, ora, adesso) {
    adesso = adesso || new Date();
    var o = oraValida(ora);
    if (o) return g + 'T' + o;
    return g === giorno(adesso.toISOString()) ? adesso.toISOString() : g + 'T12:00:00';
  }

  // ---------- che cosa c'è in un giorno ----------
  function delGiorno(p, g) {
    if (N) N.allinea(p);
    return {
      voci: (p.history || []).filter(function (s) { return s && giorno(s.date) === g; }),
      note: (p.diario || []).filter(function (n) { return n && n.data === g; }),
      tabelle: (p.learnUnitStoriche || []).filter(function (r) { return r && r.data === g; })
    };
  }
  /** Riassunto per le schermate: quante attività, comportamenti, note. */
  function contenuto(p, g) {
    var x = delGiorno(p, g);
    var comp = x.voci.filter(function (s) { return s.mode === 'comportamento'; }).length;
    return { attivita: x.voci.length - comp, comportamenti: comp, note: x.note.length, tabelle: x.tabelle.length,
      totale: x.voci.length + x.note.length + x.tabelle.length };
  }

  // ---------- una voce ----------
  function rebaseDettaglio(s, g) {
    if (Array.isArray(s.dettaglio)) s.dettaglio.forEach(function (e) { if (e && e.t) e.t = suGiorno(e.t, g); });
  }
  // il bambino ha voci senza id (registrate prima degli id)? Ora ne hanno uno stabile, ricavato dal contenuto di prima
  function conId(p) { if (U) U.assegnaId(p); }
  // un target che inizia dopo la prima voce spostata prima: l'inizio la segue
  function inizioTarget(p, s, g) {
    if (!s.attivitaId || !s.targetId) return null;
    var a = ((p.programma && p.programma.attivita) || []).filter(function (x) { return x.id === s.attivitaId; })[0];
    var t = a && (a.target || []).filter(function (x) { return x.id === s.targetId; })[0];
    if (t && t.inizio && t.inizio > g) { var prima = t.inizio; t.inizio = g; return { t: t, prima: prima }; }
    return null;
  }

  /**
   * Sposta una voce dello storico a un altro giorno (e, se data, a un'altra ora).
   *   opz: { ora: 'HH:MM', chi: nome di chi corregge, adesso: Date }
   * Restituisce { annulla() } oppure null se non c'è niente da fare.
   */
  function spostaVoce(p, s, g, opz) {
    opz = opz || {};
    if (!s || !g) return null;
    var ora = oraValida(opz.ora);
    var nuova = suGiorno(s.date, g, ora);
    if (nuova === s.date) return null;
    conId(p);
    var adesso = (opz.adesso || new Date()).toISOString();
    var prima = { date: s.date, dettaglio: s.dettaglio ? JSON.parse(JSON.stringify(s.dettaglio)) : undefined,
      correzioni: s.correzioni ? s.correzioni.slice() : undefined };
    var vecchioGiorno = giorno(s.date);
    s.date = nuova;
    rebaseDettaglio(s, g);
    (s.correzioni = s.correzioni || []).push({ il: adesso, campo: 'data', da: prima.date, a: nuova, chi: opz.chi || '' });
    var t = inizioTarget(p, s, g);
    return {
      voci: 1, da: vecchioGiorno, a: g,
      annulla: function () {
        s.date = prima.date;
        if (prima.dettaglio) s.dettaglio = prima.dettaglio;
        if (prima.correzioni) s.correzioni = prima.correzioni; else delete s.correzioni;
        if (t) t.t.inizio = t.prima;
      }
    };
  }

  // ---------- una giornata ----------
  /**
   * Sposta tutto ciò che c'è nel giorno `da` al giorno `a`. Se in `a` c'è già qualcosa serve `opz.unisci: true`,
   * altrimenti non si fa niente e si risponde { occupata: contenuto(a) }.
   *   opz: { unisci, chi, adesso }
   * Risultato: { spostate: { attivita, comportamenti, note, tabelle }, annulla() } oppure { occupata } o null.
   */
  function spostaGiornata(p, da, a, opz) {
    opz = opz || {};
    if (!da || !a || da === a) return null;
    var arrivo = contenuto(p, a);
    if (arrivo.totale && !opz.unisci) return { occupata: arrivo };
    var x = delGiorno(p, da);
    var dentro = x.voci.length + x.note.length + x.tabelle.length;
    if (!dentro) return null;
    conId(p);
    var adesso = (opz.adesso || new Date()).toISOString();
    var annulli = [];
    var cont = contenuto(p, da);
    x.voci.forEach(function (s) {
      var r = spostaVoce(p, s, a, { chi: opz.chi, adesso: opz.adesso });
      if (r) annulli.push(r.annulla);
    });
    // note: la nota resta la stessa (stesso id), cambiano giorno e orario; il testo del giorno si riscrive
    var salvateNote = x.note.map(function (n) { return { n: n, data: n.data, il: n.il, modificato: n.modificato }; });
    x.note.forEach(function (n) {
      if (N) N.sposta(p, n.id, a, suGiorno(n.il, a), adesso); else { n.data = a; n.il = suGiorno(n.il, a); }
    });
    var salvateTab = x.tabelle.map(function (r) { return { r: r, data: r.data }; });
    x.tabelle.forEach(function (r) { r.data = a; });
    return {
      spostate: { attivita: cont.attivita, comportamenti: cont.comportamenti, note: cont.note, tabelle: cont.tabelle },
      da: da, a: a, unita: !!arrivo.totale,
      annulla: function () {
        annulli.forEach(function (f) { f(); });
        salvateNote.forEach(function (c) { c.n.data = c.data; c.n.il = c.il; if (c.modificato === undefined) delete c.n.modificato; else c.n.modificato = c.modificato; });
        salvateTab.forEach(function (c) { c.r.data = c.data; });
        if (N) N.riscrivi(p, [da, a]);
      }
    };
  }

  /** Il testo dell'ora di una voce, 'HH:MM', per i campi <input type="time">. */
  function oraCampo(iso) { return orario(iso).slice(0, 5); }

  return { giorno: giorno, orario: orario, oraValida: oraValida, oraCampo: oraCampo, suGiorno: suGiorno, quando: quando,
    contenuto: contenuto, spostaVoce: spostaVoce, spostaGiornata: spostaGiornata };
});
