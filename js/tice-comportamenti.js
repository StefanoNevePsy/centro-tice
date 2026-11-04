/**
 * Comportamenti problema: si segna se e quando avvengono, non se la risposta è corretta.
 *
 * patient.comportamenti = [{
 *   id, nome, definizione,            // la definizione operativa: cosa conta come episodio
 *   misura: 'frequenza' | 'durata',   // +1 a ogni episodio, o avvia/ferma
 *   intensita: true?,                 // lieve, media, grave per ogni episodio
 *   antecedenti: [testo], conseguenze: [testo],   // elenchi brevi per l'ABC (facoltativi)
 *   obiettivo: { max, giorni }?,      // al massimo `max` episodi (o minuti) all'ora per `giorni` giorni di fila
 *   stato: 'attivo' | 'sospeso', creato
 * }]
 *
 * In seduta si raccolgono gli episodi; al salvataggio ogni comportamento osservato
 * diventa una voce dello storico, fuori dalle statistiche delle LU:
 *   { id, date, mode: 'comportamento', comportamentoId, setName, episodi, durataSecondi,
 *     minutiOsservati, dettaglio: [{ t, s?, i?, a?, c?, nota? }], fuoriStatistiche: true }
 * Anche zero episodi è un dato: un comportamento "non osservato" invece non si salva.
 *
 * Modulo puro (calcoli) più il disegno del grafico: si prova in Node (tools/test-tice-comportamenti.js).
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceComportamenti = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INTENSITA = { 1: 'lieve', 2: 'media', 3: 'grave' };

  function nuovoId(prefisso) {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    var r = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(10)) : null;
    for (var i = 0; i < 10; i++) s += a[(r ? r[i] : Math.floor(Math.random() * 256)) % a.length];
    return prefisso + '_' + s;
  }
  var giorno = function (d) {
    var x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };
  function righe(testo) { return String(testo || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 30); }

  function elenco(p) { return (p && p.comportamenti) || []; }
  function attivi(p) { return elenco(p).filter(function (c) { return c.stato !== 'sospeso'; }); }
  function trova(p, id) { return elenco(p).filter(function (c) { return c.id === id; })[0] || null; }

  /** Nuovo comportamento nel paziente, dai campi del modulo. */
  function crea(p, d) {
    var c = { id: nuovoId('cp'), creato: new Date().toISOString(), stato: 'attivo' };
    imposta(c, d);
    (p.comportamenti = p.comportamenti || []).push(c);
    return c;
  }
  function imposta(c, d) {
    c.nome = String(d.nome || '').trim().slice(0, 120) || c.nome || 'Comportamento';
    c.definizione = String(d.definizione || '').trim().slice(0, 2000);
    c.misura = d.misura === 'durata' ? 'durata' : 'frequenza';
    if (d.intensita) c.intensita = true; else delete c.intensita;
    c.antecedenti = righe(d.antecedenti);
    c.conseguenze = righe(d.conseguenze);
    var max = parseFloat(String(d.max == null ? '' : d.max).replace(',', '.')), gg = parseInt(d.giorni, 10);
    if (isFinite(max) && max >= 0) c.obiettivo = { max: max, giorni: gg >= 1 && gg <= 30 ? gg : 5 }; else delete c.obiettivo;
    if (d.stato === 'sospeso' || d.stato === 'attivo') c.stato = d.stato;
    c.modificato = new Date().toISOString();
    return c;
  }

  // ---------- in seduta ----------
  /** La raccolta di un comportamento nella bozza della seduta. */
  function raccolta(bozza, cid) {
    var x = (bozza.comp = bozza.comp || {});
    return x[cid] || (x[cid] = { episodi: [], inCorso: null, nonOsservato: false });
  }
  function aggiungi(r, quando) {
    var e = { id: nuovoId('ep'), t: quando || new Date().toISOString() };
    r.episodi.push(e);
    r.nonOsservato = false;
    return e;
  }
  /** Durata: avvia o ferma l'episodio in corso. Restituisce l'episodio chiuso, se c'era. */
  function alterna(r, ora) {
    ora = ora || Date.now();
    if (r.inCorso) {
      var e = aggiungi(r, new Date(r.inCorso).toISOString());
      e.s = Math.max(1, Math.round((ora - r.inCorso) / 1000));
      r.inCorso = null;
      return e;
    }
    r.inCorso = ora;
    r.nonOsservato = false;
    return null;
  }
  function secondiTotali(r, ora) {
    var s = r.episodi.reduce(function (n, e) { return n + (e.s || 0); }, 0);
    if (r.inCorso) s += Math.round(((ora || Date.now()) - r.inCorso) / 1000);
    return s;
  }
  var haRaccolta = function (r) { return !!(r && (r.episodi.length || r.inCorso)); };

  /** Le voci dello storico per una seduta salvata. */
  function sedute(p, bozza, quando, minuti, operatore) {
    var out = [];
    attivi(p).concat(elenco(p).filter(function (c) { return c.stato === 'sospeso' && bozza.comp && bozza.comp[c.id]; })).forEach(function (c) {
      var r = bozza.comp && bozza.comp[c.id];
      if (r && r.nonOsservato) return;
      if (r && r.inCorso) alterna(r);
      var ep = r ? r.episodi : [];
      var s = {
        id: nuovoId('cs'), date: quando, mode: 'comportamento', comportamentoId: c.id,
        setId: 'comp_' + c.id, setName: c.nome, setCat: 'Comportamenti', misura: c.misura,
        episodi: ep.length, durataSecondi: ep.reduce(function (n, e) { return n + (e.s || 0); }, 0),
        minutiOsservati: minuti, dettaglio: ep.map(function (e) {
          var d = { t: e.t };
          ['s', 'i', 'a', 'c', 'nota'].forEach(function (k) { if (e[k] != null && e[k] !== '') d[k] = e[k]; });
          return d;
        }),
        correct: 0, total: 0, percentage: 0, fuoriStatistiche: true, fonte: 'app',
      };
      if (operatore) s.operatore = operatore;
      out.push(s);
    });
    return out;
  }

  // ---------- monitoraggio ----------
  /** Un punto per giorno: episodi (o minuti) all'ora, sommando i salvataggi dello stesso giorno. */
  function andamento(p, c) {
    var perGiorno = {};
    (p.history || []).forEach(function (s) {
      if (s.mode !== 'comportamento' || s.comportamentoId !== c.id) return;
      var g = giorno(s.date), x = perGiorno[g] || (perGiorno[g] = { data: g, episodi: 0, secondi: 0, minuti: 0, dettaglio: [] });
      x.episodi += s.episodi || 0;
      x.secondi += s.durataSecondi || 0;
      x.minuti += s.minutiOsservati || 0;
      x.dettaglio = x.dettaglio.concat(s.dettaglio || []);
    });
    return Object.keys(perGiorno).sort().map(function (g) {
      var x = perGiorno[g], ore = x.minuti / 60;
      x.valore = c.misura === 'durata' ? (ore > 0 ? x.secondi / 60 / ore : null) : (ore > 0 ? x.episodi / ore : null);
      return x;
    });
  }
  /** Obiettivo raggiunto: gli ultimi `giorni` giorni con dati tutti entro il massimo. */
  function aObiettivo(punti, c) {
    if (!c.obiettivo) return false;
    var ok = punti.filter(function (x) { return x.valore != null; }).slice(-c.obiettivo.giorni);
    return ok.length >= c.obiettivo.giorni && ok.every(function (x) { return x.valore <= c.obiettivo.max; });
  }
  /** Antecedenti, conseguenze, intensità e fasce orarie: quante volte ciascuno. */
  function riepilogo(punti) {
    var a = {}, cc = {}, i = {}, ore = {}, n = 0;
    punti.forEach(function (x) {
      x.dettaglio.forEach(function (e) {
        n++;
        if (e.a) a[e.a] = (a[e.a] || 0) + 1;
        if (e.c) cc[e.c] = (cc[e.c] || 0) + 1;
        if (e.i) i[e.i] = (i[e.i] || 0) + 1;
        var h = new Date(e.t).getHours();
        if (isFinite(h)) ore[h] = (ore[h] || 0) + 1;
      });
    });
    var ordina = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (x, y) { return y[1] - x[1]; }); };
    return { episodi: n, antecedenti: ordina(a), conseguenze: ordina(cc), intensita: i, ore: ore };
  }
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]; }); };
  var numero = function (v) { return v == null ? '—' : (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace('.', ',')); };
  var unita = function (c) { return c.misura === 'durata' ? 'min/ora' : 'episodi/ora'; };

  // ---------- grafico ----------
  /** SVG del valore all'ora per giorno, con la linea dell'obiettivo. */
  function grafico(punti, c) {
    var W = 640, H = 240, sx = 44, dx = 14, su = 16, giu = 34;
    var val = punti.filter(function (x) { return x.valore != null; });
    if (!val.length) return '<p class="sotto">Ancora nessun giorno osservato.</p>';
    var max = Math.max.apply(null, val.map(function (x) { return x.valore; }).concat([c.obiettivo ? c.obiettivo.max : 0, 1]));
    max = Math.ceil(max * 1.15 * 2) / 2;
    var w = W - sx - dx, hh = H - su - giu, n = val.length;
    var X = function (k) { return sx + (n === 1 ? w / 2 : k * w / (n - 1)); };
    var Y = function (v) { return su + hh - (v / max) * hh; };
    var s = '<svg class="comp-grafico" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(c.nome) + ': ' + unita(c) + ' per giorno">';
    for (var t = 0; t <= 4; t++) {
      var v = max * t / 4, y = Y(v);
      s += '<line x1="' + sx + '" x2="' + (W - dx) + '" y1="' + y + '" y2="' + y + '" class="cg-griglia"/>';
      s += '<text x="' + (sx - 6) + '" y="' + (y + 4) + '" text-anchor="end" class="cg-testo">' + numero(v) + '</text>';
    }
    if (c.obiettivo) {
      var yo = Y(c.obiettivo.max);
      s += '<line x1="' + sx + '" x2="' + (W - dx) + '" y1="' + yo + '" y2="' + yo + '" class="cg-obiettivo"/>';
      s += '<text x="' + (W - dx) + '" y="' + (yo - 5) + '" text-anchor="end" class="cg-testo cg-ob">obiettivo ≤ ' + numero(c.obiettivo.max) + '</text>';
    }
    s += '<polyline class="cg-linea" points="' + val.map(function (x, k) { return X(k) + ',' + Y(x.valore); }).join(' ') + '"/>';
    var passo = Math.max(1, Math.ceil(n / 8));
    val.forEach(function (x, k) {
      s += '<circle class="cg-punto" cx="' + X(k) + '" cy="' + Y(x.valore) + '" r="4.5"><title>' + x.data + ': ' + numero(x.valore) + ' ' + unita(c) + ' (' + x.episodi + ' episodi in ' + Math.round(x.minuti) + ' min)</title></circle>';
      if (k % passo === 0 || k === n - 1) {
        var d = x.data.split('-');
        s += '<text x="' + X(k) + '" y="' + (H - 12) + '" text-anchor="middle" class="cg-testo">' + (+d[2]) + '/' + (+d[1]) + '</text>';
      }
    });
    return s + '</svg>';
  }

  // Nelle Visualizzazioni (cartella clinica e schermata Grafici): un grafico per comportamento
  if (typeof window !== 'undefined' && window._vizApi && window._vizApi.VIZ_VIEWS) {
    window._vizApi.VIZ_VIEWS.push({ id: 'comportamenti', label: 'Comportamenti problema', icon: 'fa-triangle-exclamation', group: 'Clinico', fn: function (box, paz) {
      // il filtro delle statistiche toglie le voci dei comportamenti: si leggono dal paziente vero
      var vero = ((typeof state !== 'undefined' && state.patients) || []).filter(function (x) { return x.id === paz.id; })[0] || paz;
      var cc = elenco(vero);
      if (!cc.length) { box.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:24px">Nessun comportamento problema nel programma.</p>'; return; }
      box.innerHTML = cc.map(function (c) {
        var pt = andamento(vero, c);
        return '<div style="margin-bottom:22px"><b>' + esc(c.nome) + '</b> <small style="color:var(--text-secondary)">' + unita(c) +
          (c.obiettivo ? ' · obiettivo ≤ ' + numero(c.obiettivo.max) : '') + (aObiettivo(pt, c) ? ' · raggiunto' : '') + '</small>' + grafico(pt, c) + '</div>';
      }).join('');
    } });
  }

  return {
    INTENSITA: INTENSITA, nuovoId: nuovoId, elenco: elenco, attivi: attivi, trova: trova, crea: crea, imposta: imposta,
    raccolta: raccolta, aggiungi: aggiungi, alterna: alterna, secondiTotali: secondiTotali, haRaccolta: haRaccolta,
    sedute: sedute, andamento: andamento, aObiettivo: aObiettivo, riepilogo: riepilogo, grafico: grafico,
    numero: numero, unita: unita,
  };
});
