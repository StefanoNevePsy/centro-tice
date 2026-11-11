/**
 * Note del diario di un bambino: ogni nota è una voce a sé.
 *
 * patient.diario = [{ id, data: 'AAAA-MM-GG', il: ISO, testo, tag?, autore?, email?, fissata?, modificato? }]
 *   - `fissata`: sta in «Da tenere a mente» (allergie, rinforzatori, cosa evitare)
 * patient.diarioVisti = { hash: 1 }   paragrafi già passati di qui (modificati o tolti): non rientrano
 *
 * Il resto dell'app (cartella clinica, report) legge ancora patient.dailyNotes, un testo per
 * giorno: qui resta come copia, riscritta dalle note. Quello che vi arriva da fuori (quaderni
 * importati, note scritte prima, una versione vecchia dell'app) diventa nota al primo allineamento,
 * con un identificativo ricavato dal testo: due dispositivi che lo fanno insieme ottengono la stessa nota.
 * Le voci si uniscono per id fra dispositivi (tice-unisci): due note scritte insieme restano entrambe.
 *
 * Modulo puro: si prova in Node (tools/test-tice-note.js).
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceNote = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ETICHETTE_BASE = [
    { id: 'seduta', nome: 'Seduta', colore: '#3b6a2f' }, { id: 'comportamento', nome: 'Comportamento', colore: '#9b2a22' },
    { id: 'famiglia', nome: 'Famiglia', colore: '#2a4d8f' }, { id: 'scuola', nome: 'Scuola', colore: '#0f766e' },
    { id: 'salute', nome: 'Salute', colore: '#8a5a14' }, { id: 'rinforzatori', nome: 'Rinforzatori', colore: '#6a3a8a' },
  ];
  var PALETTE = ['#3b6a2f', '#9b2a22', '#2a4d8f', '#0f766e', '#8a5a14', '#6a3a8a', '#b3307a', '#475569'];

  function hash(t) {
    var h = 5381, s = String(t);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function nuovoId() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    for (var i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
    return 'nt_' + s;
  }
  var giorno = function (d) {
    var x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };
  var paragrafi = function (t) { return String(t || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean); };

  function delGiorno(p, d) {
    return (p.diario || []).filter(function (n) { return n.data === d; }).sort(function (a, b) { return String(a.il).localeCompare(String(b.il)); });
  }
  var copia = function (p, d) { return delGiorno(p, d).map(function (n) { return String(n.testo || '').trim(); }).filter(Boolean).join('\n\n'); };
  function scriviCopia(p, d) {
    var m = copia(p, d);
    if (m) { p.dailyNotes = p.dailyNotes || {}; if (p.dailyNotes[d] === m) return false; p.dailyNotes[d] = m; return true; }
    if (p.dailyNotes && d in p.dailyNotes) { delete p.dailyNotes[d]; return true; }
    return false;
  }
  function visto(p, d, testo) {
    var v = p.diarioVisti || (p.diarioVisti = {});
    paragrafi(testo).forEach(function (x) { v[hash(d + '|' + x)] = 1; });
  }

  /** Porta nel diario quello che c'è solo nel testo del giorno, e riscrive la copia. true se è cambiato qualcosa. */
  function allinea(p) {
    if (!p) return false;
    var cambiato = false;
    if (!Array.isArray(p.diario)) { if (!p.dailyNotes || !Object.keys(p.dailyNotes).length) return false; p.diario = []; cambiato = true; }
    var dn = p.dailyNotes || {}, giorni = {};
    Object.keys(dn).forEach(function (d) { giorni[d] = 1; });
    p.diario.forEach(function (n) { giorni[n.data] = 1; });
    var visti = p.diarioVisti || {};
    Object.keys(giorni).forEach(function (d) {
      var L = String(dn[d] || '').trim(), M = copia(p, d);
      if (L && L !== M) {
        paragrafi(L).forEach(function (x) {
          var hh = hash(d + '|' + x);
          if (M.indexOf(x) >= 0 || visti[hh]) return;
          var id = 'nt_g' + hh;
          if (p.diario.some(function (n) { return n.id === id; })) return;
          p.diario.push({ id: id, data: d, il: d + 'T12:00:00', testo: x });
          cambiato = true;
        });
      }
      if (scriviCopia(p, d)) cambiato = true;
    });
    return cambiato;
  }

  function aggiungi(p, d) {
    var testo = String(d.testo || '').trim();
    if (!testo) return null;
    allinea(p);
    p.diario = p.diario || [];
    var il = d.il || new Date().toISOString();
    var n = { id: nuovoId(), data: d.data || giorno(il), il: il, testo: testo.slice(0, 5000) };
    if (d.tag) n.tag = String(d.tag);
    if (d.autore) n.autore = String(d.autore).slice(0, 120);
    if (d.email) n.email = String(d.email).toLowerCase();
    if (d.fissata) n.fissata = true;
    p.diario.push(n);
    scriviCopia(p, n.data);
    return n;
  }
  function modifica(p, id, d) {
    var n = (p.diario || []).filter(function (x) { return x.id === id; })[0];
    if (!n) return null;
    var prima = n.data;
    visto(p, n.data, n.testo);
    if (d.testo !== undefined) n.testo = String(d.testo).trim().slice(0, 5000);
    if (d.data) n.data = d.data;
    if (d.tag !== undefined) { if (d.tag) n.tag = String(d.tag); else delete n.tag; }
    if (d.fissata !== undefined) { if (d.fissata) n.fissata = true; else delete n.fissata; }
    n.modificato = new Date().toISOString();
    scriviCopia(p, prima);
    if (n.data !== prima) scriviCopia(p, n.data);
    return n;
  }
  function togli(p, id) {
    var n = (p.diario || []).filter(function (x) { return x.id === id; })[0];
    if (!n) return false;
    visto(p, n.data, n.testo);
    p.diario = p.diario.filter(function (x) { return x.id !== id; });
    scriviCopia(p, n.data);
    return true;
  }

  /** Dalla più recente. */
  function elenco(p) {
    allinea(p);
    return (p.diario || []).slice().sort(function (a, b) { return (b.data + '|' + b.il).localeCompare(a.data + '|' + a.il); });
  }
  var fissate = function (p) { return elenco(p).filter(function (n) { return n.fissata; }); };
  var diOggi = function (p, oggi) { return (p.diario || []).filter(function (n) { return n.data === oggi; }).length; };

  /** Le etichette in uso: quelle di serie più quelle del centro (che le possono rinominare o nascondere). */
  function etichette(salvate) {
    var out = ETICHETTE_BASE.map(function (e) { return Object.assign({}, e); });
    (salvate || []).forEach(function (e) {
      var i = -1; out.forEach(function (y, k) { if (y.id === e.id) i = k; });
      if (i >= 0) out[i] = Object.assign({}, out[i], e); else out.push(Object.assign({}, e));
    });
    out.forEach(function (e, i) { if (!e.colore) e.colore = PALETTE[i % PALETTE.length]; });
    return out;
  }

  return { ETICHETTE_BASE: ETICHETTE_BASE, PALETTE: PALETTE, hash: hash, giorno: giorno, allinea: allinea, aggiungi: aggiungi, modifica: modifica,
    togli: togli, elenco: elenco, fissate: fissate, diOggi: diOggi, etichette: etichette, copia: copia };
});
