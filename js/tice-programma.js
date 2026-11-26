/**
 * Programma del bambino: le attività su cui si lavora, ognuna con i suoi
 * target in sequenza. Quando un target raggiunge il criterio si passa al
 * successivo. L'app lo propone, non lo decide da sola.
 *
 * patient.programma = { attivita: [{
 *   id, nome, area, descrizione,
 *   suggerimenti: '',        // come si somministra: note per chi fa la seduta
 *   cronometro: false,       // fluency: si misura il tempo, per le risposte al minuto
 *   sessionType: 'independent' | 'timedelay',
 *   criterio: { soglia: 90, sedute: 2 },
 *   prove: 10 | null,          // prove per seduta, se fisse
 *   stato: 'attivo' | 'sospeso' | 'terminato',
 *   target: [{ id, testo, stato, inizio, fine, tdSeconds?, suggerimento?,
 *              passi?: [{ id, testo }] }],   // con i passi è una task analysis
 *   // stato del target: 'attivo' | 'pianificato' | 'criterio' | 'repertorio' | 'chiuso'
 * }] }
 *
 * Task analysis: in seduta si segna un passo alla volta (ogni passo è una
 * learn unit) e si va avanti da soli; finito l'ultimo si ricomincia (un altro
 * giro). La seduta va nello storico come quelle della modalità Task Analysis
 * dell'app (mode 'quaderno_task' con taskSteps), quindi con il dettaglio dei
 * passi nei grafici.
 *
 * Le sedute restano nello storico dell'app (patient.history) come sedute
 * Quaderno con setName "Attività · Target", più attivitaId e targetId.
 *
 * Modulo puro (niente DOM, niente DB): si prova in Node.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceProgramma = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATI_TARGET = {
    attivo: 'In corso', pianificato: 'In programma', criterio: 'A criterio',
    repertorio: 'In repertorio', chiuso: 'Chiuso'
  };
  var CHIUSI = ['criterio', 'repertorio', 'chiuso'];

  function nuovoId(prefisso) {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    var r = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(10)) : null;
    for (var i = 0; i < 10; i++) s += a[(r ? r[i] : Math.floor(Math.random() * 256)) % a.length];
    return prefisso + '_' + s;
  }
  function due(n) { return (n < 10 ? '0' : '') + n; }
  /** Giorno di calendario locale, come getDateKey dell'app. */
  function giorno(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10);
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }
  function oggi() { return giorno(new Date().toISOString()); }

  function programma(p) {
    if (!p.programma) p.programma = { attivita: [] };
    if (!p.programma.attivita) p.programma.attivita = [];
    return p.programma;
  }
  function attivita(p, id) {
    return programma(p).attivita.filter(function (a) { return a.id === id; })[0] || null;
  }
  /**
   * I set di un target: `setId`, e `setIds` se l'attività usa più set insieme (il primo è sempre `setId`).
   * [] per un target non collegato a un set. Lo stesso calcolo di TiceGioco.idsSet.
   */
  function setIdsDi(target) {
    if (!target) return [];
    var l = (Array.isArray(target.setIds) ? target.setIds : []).filter(Boolean).map(String);
    if (!l.length && target.setId) l = [String(target.setId)];
    return l.filter(function (x, i) { return l.indexOf(x) === i; });
  }
  /** L'id con cui lo storico conosce il set (o i set usati insieme: «multi_a_b», come le sedute a scenari). */
  function setIdDi(target) {
    var l = setIdsDi(target);
    return l.length > 1 ? 'multi_' + l.join('_') : (l[0] || '');
  }
  function nomeSet(att, target) {
    // Un target collegato a un set dell'archivio si chiama come il set: così le
    // sedute registrate qui e quelle dei giochi finiscono nello stesso grafico.
    if (target && target.setId) return target.testo;
    return target && target.testo ? att.nome + ' · ' + target.testo : att.nome;
  }
  /** Modalità di gioco di un target collegato a un set (es. 'tact', 'ran'). */
  function modoTarget(att, target) {
    return (target && target.mode) || att.mode || null;
  }

  /**
   * Il target su cui si registra oggi: quello in corso; se non c'è, l'ultimo
   * chiuso a criterio (mantenimento, finché non si apre il successivo).
   */
  function targetCorrente(att) {
    var t = att.target || [];
    var attivo = t.filter(function (x) { return x.stato === 'attivo'; })[0];
    if (attivo) return { target: attivo, mantenimento: false };
    for (var i = t.length - 1; i >= 0; i--) {
      if (t[i].stato === 'criterio' || t[i].stato === 'repertorio') return { target: t[i], mantenimento: true };
    }
    return null;
  }
  // ---------- time delay ----------
  // Secondi validi (0 = senza attesa); null se non indicati
  function secondi(x) {
    if (x === null || x === undefined || x === '') return null;
    var n = +x;
    return isFinite(n) && n >= 0 && n <= 60 ? Math.round(n) : null;
  }
  /** Il time delay in uso: quello scritto sul target (quaderni importati) o quello dell'attività. */
  function tdDi(att, target) {
    var t = target === undefined ? (targetCorrente(att) || {}).target : target;
    var dt = t ? secondi(t.tdSeconds) : null;
    return dt != null ? dt : secondi(att && att.tdSeconds);
  }
  /**
   * Cambia il time delay dell'attività da qui in avanti e lo annota in att.tdCambi
   * ({ il, da, a, chi }). Il target in corso, se ne aveva uno suo, lo segue.
   * Restituisce true se il valore è cambiato.
   */
  function impostaTD(att, sec, opz) {
    var o = opz || {};
    var nuovo = secondi(sec);
    if (nuovo == null) return false;
    var c = targetCorrente(att);
    var vecchio = tdDi(att);
    if (vecchio === nuovo && secondi(att.tdSeconds) === nuovo) return false;
    att.tdSeconds = nuovo;
    if (c && c.target && secondi(c.target.tdSeconds) != null) c.target.tdSeconds = nuovo;
    if (vecchio !== nuovo) {
      att.tdCambi = att.tdCambi || [];
      var voce = { il: o.il || new Date().toISOString().slice(0, 10), da: vecchio, a: nuovo };
      if (o.chi) voce.chi = String(o.chi);
      if (c && c.target) voce.targetId = c.target.id;
      att.tdCambi.push(voce);
    }
    return vecchio !== nuovo;
  }
  /** "Passa a 2" T/D", "aumenta TD a 3''": i secondi decisi, se la decisione li indica. */
  function tdDaDecisione(testo) {
    var t = String(testo || '');
    var m = /(\d{1,2})\s*(?:["”″“]|''|sec\w*|s\b)?\s*(?:t\s*\.?\s*\/?\s*d\b|time\s*delay)/i.exec(t)
      || /(?:t\s*\.?\s*\/?\s*d\b|time\s*delay)\s*(?:a\s+)?(\d{1,2})/i.exec(t);
    return m ? secondi(m[1]) : null;
  }

  function prossimoTarget(att) {
    return (att.target || []).filter(function (x) { return x.stato === 'pianificato'; })[0] || null;
  }

  /** Sedute dello storico che appartengono a un target (o all'attività). */
  /** Le sedute di un'attività (di un target, di una sua presa dati se ms). */
  function sedute(p, att, target, ms) {
    var nome = target ? nomeSet(att, target) : null;
    return (p.history || []).filter(function (s) {
      if (ms && s.misura !== ms) return false;
      if (target && target.setId) {
        // anche le sedute di quel set giocate prima che entrasse nel programma, e quelle del target
        // scritte a mano prima che fosse collegato al set («Attività · Target», senza targetId)
        return s.targetId ? s.targetId === target.id
          : (s.setId === setIdDi(target) && s.mode === modoTarget(att, target)) ||
            (s.mode === 'quaderno' && s.setName === att.nome + ' · ' + target.testo);
      }
      if (target) return s.targetId ? s.targetId === target.id : (s.mode === 'quaderno' && s.setName === nome);
      return s.attivitaId === att.id || (s.mode === 'quaderno' && (s.setName === att.nome || String(s.setName).indexOf(att.nome + ' · ') === 0));
    }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  }

  /**
   * Primo giorno in cui il criterio è raggiunto: `sedute` giorni diversi di
   * fila con percentuale ≥ soglia (una seduta sotto soglia azzera il conto,
   * come checkCriterion dell'app). Restituisce la data o null.
   */
  /**
   * Criterio di un target (o dell'attività senza target): con più prese dati
   * nella stessa attività, quando ci arrivano tutte (la data dell'ultima).
   */
  function criterioDi(p, att, target) {
    var t = target || undefined;
    if (!(att.misure || []).length) return criterioRaggiunto(sedute(p, att, t), att.criterio);
    // le sottoattività in mantenimento non contano per il criterio dell'attività
    var attive = att.misure.filter(function (m) { return !m.mantenimento; });
    if (!attive.length) return null;
    var date = attive.map(function (m) { return criterioRaggiunto(sedute(p, att, t, m.id), att.criterio); });
    return date.every(Boolean) ? date.sort().pop() : null;
  }
  function criterioRaggiunto(elenco, criterio) {
    var soglia = (criterio && criterio.soglia) || 90, n = (criterio && criterio.sedute) || 2;
    // Più salvataggi nello stesso giorno (una seduta divisa fra due persone) valgono come
    // una giornata sola: si sommano le risposte e si guarda la percentuale del giorno.
    var perGiorno = {}, giorni = [];
    elenco.forEach(function (s) {
      var g = giorno(s.date);
      if (!perGiorno[g]) { perGiorno[g] = { ok: 0, tot: 0, pct: [] }; giorni.push(g); }
      var x = perGiorno[g];
      if (s.total > 0) { x.ok += s.correct || 0; x.tot += s.total; } else x.pct.push(s.percentage || 0);
    });
    giorni.sort();
    var fila = 0;
    for (var i = 0; i < giorni.length; i++) {
      var x = perGiorno[giorni[i]];
      var pct = x.tot ? 100 * x.ok / x.tot : (x.pct.length ? x.pct.reduce(function (a, b) { return a + b; }, 0) / x.pct.length : 0);
      if (pct >= soglia) fila++; else fila = 0;
      if (fila >= n) return giorni[i];
    }
    return null;
  }

  /** I passi di una task analysis ([] per un target normale). */
  function passiDi(target) {
    return (target && Array.isArray(target.passi)) ? target.passi.filter(function (x) { return x && x.testo; }) : [];
  }
  /** Testi (o oggetti) → passi con id, conservando gli id dei passi uguali. */
  function nuoviPassi(elenco, vecchi) {
    var usati = {};
    return (elenco || []).map(function (x) {
      var testo = String(typeof x === 'object' && x ? (x.testo || x.name || '') : x).trim();
      if (!testo) return null;
      var v = (vecchi || []).filter(function (y) { return y.testo === testo && !usati[y.id]; })[0];
      var id = v ? v.id : nuovoId('ps');
      usati[id] = true;
      return { id: id, testo: testo };
    }).filter(Boolean);
  }

  /** Crea le sedute Quaderno di un'attività per lo storico dell'app. */
  function seduta(att, target, voce, quando) {
    var v = voce.v || 0, pp = voce.p || 0, ee = voce.e || 0, x = voce.x || 0, tot = v + pp + ee + x;
    if (!tot) return null;
    var s = {
      id: nuovoId('sx'),
      date: quando,
      setId: target && target.setId ? setIdDi(target) : 'tice_' + (target ? target.id : att.id),
      setName: nomeSet(att, target),
      setCat: att.area || '',
      mode: (target && target.setId && modoTarget(att, target)) || 'quaderno',
      correct: v,
      prompts: pp,
      total: tot,
      percentage: Math.round(v / tot * 100),
      sessionType: voce.sessionType || att.sessionType || 'independent',
      rawV: v, rawP: pp, rawX: x,
      attivitaId: att.id,
      targetId: target ? target.id : null,
      fonte: 'app'
    };
    // echo to tact: E- (ecoico richiesto ma non corretto), distinto da E+ (rawP) e da ✗ (rawX); assente se zero, così le sedute senza E- restano identiche
    if (ee) s.rawE = ee;
    if (s.sessionType === 'timedelay') {
      var td = secondi(voce.tdSeconds) != null ? secondi(voce.tdSeconds) : tdDi(att, target);
      if (td != null) s.timeDelaySeconds = td;
    }
    if (voce.sequenza) s.sequenza = voce.sequenza;
    // task analysis: il dettaglio per passo, come la modalità Task Analysis
    var passi = passiDi(target);
    if (passi.length && voce.esiti) {
      var CODICI = { V: true, P: 'prompt', E: false, X: false };
      s.mode = 'quaderno_task';
      s.taskSteps = passi.map(function (ps) {
        var e = String(voce.esiti[ps.id] || '');
        var n = function (c) { return e.split(c).length - 1; };
        return { name: ps.testo, results: e.split('').map(function (c) { return CODICI[c]; }),
          v: n('V'), p: n('P'), x: n('X') + n('E'), na: 0, scored: e.length, sessionType: s.sessionType };
      });
      if (voce.giri) s.giri = voce.giri;
    }
    if (voce.operatore) s.operatore = voce.operatore;
    var nota = [];
    if (voce.decisione) nota.push('**' + voce.decisione + '**');
    if (voce.nota) nota.push(voce.nota);
    if (nota.length) s.note = nota.join(' — ');
    if (voce.mantenimento) s.mantenimento = true;
    // attività in mantenimento: il dato si prende ma non entra nelle statistiche
    if (att.mantenimento) { s.mantenimento = true; s.fuoriStatistiche = true; }
    // attività cronometrata: il tempo di lavoro, per le risposte al minuto (SCC)
    if (voce.tempo) {
      var ms = (voce.tempo.ms || 0) + (voce.tempo.da ? Date.now() - voce.tempo.da : 0);
      if (ms >= 5000) s.durationSeconds = Math.round(ms / 1000);
    }
    return s;
  }

  // ---------- modifiche al programma ----------
  function nuovaAttivita(p, dati) {
    var att = {
      id: nuovoId('at'),
      nome: String(dati.nome || '').trim() || 'Attività',
      area: String(dati.area || '').trim(),
      descrizione: String(dati.descrizione || '').trim(),
      suggerimenti: String(dati.suggerimenti || '').trim(),
      cronometro: !!dati.cronometro,
      sessionType: dati.sessionType === 'timedelay' ? 'timedelay' : 'independent',
      criterio: { soglia: +dati.soglia || 90, sedute: +dati.sedute || 2 },
      prove: +dati.prove || null,
      stato: dati.stato || 'attivo',
      target: [],
      origine: 'app',
      creato: new Date().toISOString(),
      modificato: new Date().toISOString()
    };
    if (secondi(dati.tdSeconds) != null) att.tdSeconds = secondi(dati.tdSeconds);
    if (dati.mode) att.mode = String(dati.mode);
    if (dati.mantenimento) att.mantenimento = true;
    if (dati.modalita) { att.modalita = String(dati.modalita); if (dati.variante) att.variante = String(dati.variante).trim(); }
    programma(p).attivita.push(att);
    if (dati.target) aggiungiTarget(att, dati.target, true);
    return att;
  }
  /** dati: il testo, oppure { testo, setId, mode } per un set dell'archivio ({ testo, setIds, mode } per più set insieme). */
  function aggiungiTarget(att, dati, attiva) {
    var corrente = (att.target || []).filter(function (x) { return x.stato === 'attivo'; })[0];
    var d = typeof dati === 'object' && dati ? dati : { testo: dati };
    var t = {
      id: nuovoId('tg'), testo: String(d.testo || '').trim(),
      stato: attiva && !corrente ? 'attivo' : 'pianificato',
      inizio: null, fine: null, origine: 'app', modificato: new Date().toISOString()
    };
    if (d.setId) { t.setId = String(d.setId); if (d.mode) t.mode = String(d.mode); }
    // più set usati insieme in un unico target: setId resta il primo
    if (Array.isArray(d.setIds) && d.setIds.length > 1) {
      t.setIds = d.setIds.map(String).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      t.setId = t.setIds[0];
      if (d.mode) t.mode = String(d.mode);
    }
    if (d.passi && d.passi.length) t.passi = nuoviPassi(d.passi);
    (att.target || (att.target = [])).push(t);
    att.modificato = t.modificato;
    return t;
  }
  // ---------- collegare i target ai set dell'archivio ----------
  // Collegare (o scollegare) cambia solo setId/setIds/mode del target: stato, storico e testo restano.
  // Le sedute già registrate restano del target: quelle che lo riconoscevano solo dal nome o dal set
  // prendono il suo targetId, così nessuna si perde passando da «Set 1» scritto a mano a un set del gioco.
  function ancoraSedute(p, att, target, prima) {
    (prima || []).forEach(function (s) { if (!s.targetId) s.targetId = target.id; });
  }
  /** Collega il target a uno o più set (insieme); `mode` è il gioco (facoltativo). Restituisce il target. */
  function collegaSet(p, att, target, ids, mode) {
    var l = (ids || []).map(String).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    if (!target || !l.length) return target;
    var prima = sedute(p, att, target);
    target.setId = l[0];
    if (l.length > 1) target.setIds = l; else delete target.setIds;
    if (mode) target.mode = String(mode);
    ancoraSedute(p, att, target, prima);
    target.modificato = att.modificato = new Date().toISOString();
    return target;
  }
  /** Toglie il collegamento al set: il target resta, con le sue sedute. */
  function scollegaSet(p, att, target) {
    if (!target || !target.setId) return target;
    var prima = sedute(p, att, target);
    delete target.setId; delete target.setIds; delete target.mode;
    ancoraSedute(p, att, target, prima);
    target.modificato = att.modificato = new Date().toISOString();
    return target;
  }
  function norm(x) {
    return String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  /**
   * Un set dell'archivio che potrebbe corrispondere al target (solo un suggerimento da confermare):
   * stesso nome, nome contenuto, oppure lo stesso numero finale («Set 1» ↔ «Frutta 1»), con un
   * bonus se la categoria del set è quella indicata in opz.categorie. Senza un candidato chiaro null.
   * archivio: [{id, name, cat}]; opz: { categorie: [...] (richieste per il solo numero), categorieDeboli: [...] (solo un bonus,
   es. area e nome dell'attività), esclusi: [id…] }.
   */
  function suggerisciSet(testo, archivio, opz) {
    var o = opz || {}, t = norm(testo), esclusi = o.esclusi || [];
    var cats = (o.categorie || []).map(norm).filter(Boolean);
    var deboli = (o.categorieDeboli || []).map(norm).filter(Boolean);
    var m = /(\d+)\s*$/.exec(t), num = m ? String(parseInt(m[1], 10)) : null;
    var re = num ? new RegExp('(^|[^0-9])0*' + num + '([^0-9]|$)') : null;
    var ris = [];
    (archivio || []).forEach(function (s) {
      if (esclusi.indexOf(s.id) >= 0) return;
      var n = norm(s.name), c = norm(s.cat || s.category), sc = 0;
      if (!n || !t) return;
      var perCat = cats.some(function (x) { return c && (c === x || c.indexOf(x) >= 0 || x.indexOf(c) >= 0); });
      var perDebole = !!c && deboli.some(function (x) { return x.indexOf(c) >= 0; });
      if (n === t) sc = 100;
      else if (t.length >= 3 && n.indexOf(t) >= 0) sc = 60;
      else if (n.length >= 3 && t.indexOf(n) >= 0) sc = 50;
      else if (re && re.test(n) && (perCat || !cats.length)) sc = 30;
      if (!sc) return;
      ris.push({ id: s.id, nome: s.name, punti: sc + (perCat ? 20 : 0) + (perDebole ? 10 : 0) });
    });
    ris.sort(function (a, b) { return b.punti - a.punti; });
    if (!ris.length) return null;
    // due candidati alla pari: nessun suggerimento
    if (ris[1] && ris[1].punti === ris[0].punti) return null;
    return ris[0];
  }

  /** Chiude un target e apre il successivo in programma, quello indicato, o nessuno. */
  function chiudiTarget(att, targetId, stato, data, prossimoId) {
    var t = (att.target || []).filter(function (x) { return x.id === targetId; })[0];
    if (!t) return null;
    var ora = new Date().toISOString();
    t.stato = CHIUSI.indexOf(stato) >= 0 ? stato : 'criterio';
    t.fine = data || oggi();
    t.modificato = ora;
    // prossimoId: undefined = il prossimo in programma, null = nessuno
    var prossimo = prossimoId === undefined ? prossimoTarget(att)
      : prossimoId ? att.target.filter(function (x) { return x.id === prossimoId; })[0] : null;
    if (prossimo) { prossimo.stato = 'attivo'; prossimo.inizio = prossimo.inizio || data || oggi(); prossimo.modificato = ora; }
    att.modificato = ora;
    return prossimo || null;
  }
  /** Rende corrente un target qualsiasi (anche riaprire uno chiuso). */
  function rendiCorrente(att, targetId) {
    var ora = new Date().toISOString();
    (att.target || []).forEach(function (x) {
      if (x.id === targetId) { x.stato = 'attivo'; x.inizio = x.inizio || oggi(); x.fine = null; x.modificato = ora; }
      else if (x.stato === 'attivo') { x.stato = 'pianificato'; x.modificato = ora; }
    });
    att.modificato = ora;
  }
  function spostaTarget(att, targetId, verso) {
    var t = att.target || [], i = -1;
    t.forEach(function (x, k) { if (x.id === targetId) i = k; });
    var j = i + verso;
    if (i < 0 || j < 0 || j >= t.length) return;
    var tmp = t[i]; t[i] = t[j]; t[j] = tmp;
    att.modificato = new Date().toISOString();
  }

  /** Attività da mostrare nella presa dati, nell'ordine del programma. */
  // ---------- colore e tipo di dato ----------
  // Lo stesso colore per l'attività sullo schermo e sui fogli stampati
  var PALETTE = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#148f77', '#a93279', '#5d6d7e', '#3949ab', '#8d6e63', '#d35400', '#0e6655'];
  function coloreDi(p, att, automatico) {
    if (!automatico && att && /^#[0-9a-f]{6}$/i.test(att.colore || '')) return att.colore;
    var i = p ? programma(p).attivita.indexOf(att) : -1;
    if (i < 0) {   // attività solo per oggi: dal nome
      var nome = String((att && att.nome) || ''), h = 0;
      for (var k = 0; k < nome.length; k++) h = (h * 31 + nome.charCodeAt(k)) % 997;
      i = h;
    }
    return PALETTE[i % PALETTE.length];
  }
  /**
   * In percentuale a ogni seduta: per scelta, o quando non c'è il numero di
   * prove della LU (il «target» del quaderno). Con le prove indicate si lavora a
   * LU anche senza stimoli specifici nel programma.
   */
  function inPercentuale(att) {
    return !!att && (att.scala === 'percentuale' || (!(+att.prove > 0) && !(att.target || []).length));
  }

  // ---------- learn unit contate: le prove aspettano di arrivare al numero previsto ----------
  // Un'attività a target con N prove per LU entra nei dati solo a blocchi di N:
  // il resto aspetta le sedute successive (att.inAttesa[targetId] = { seq, dal, note }).
  // In percentuale, a tempo o in task analysis il dato è sempre quello del giorno.
  function conAttesa(att, target) {
    return !!att && !att.temporanea && !inPercentuale(att) && +att.prove > 0 && !att.cronometro && !passiDi(target).length;
  }
  function chiaveAttesa(target, ms) { return (target ? target.id : '_') + (ms ? '~' + ms : ''); }
  function inAttesaDi(att, target, ms) {
    var x = (att && att.inAttesa || {})[chiaveAttesa(target, ms)];
    return x && x.seq ? x : null;
  }
  /** Le prove in attesa più quelle di oggi, in blocchi da n e il resto. */
  function dividiLU(prima, oggi, n) {
    var tutta = String(prima || '') + String(oggi || ''), blocchi = [], i = 0;
    while (n > 0 && tutta.length - i >= n) { blocchi.push(tutta.slice(i, i + n)); i += n; }
    return { blocchi: blocchi, resto: tutta.slice(i) };
  }
  function contaRisposte(seq) {
    var c = { v: 0, p: 0, e: 0, x: 0 };   // e = E- dell'echo to tact
    String(seq || '').split('').forEach(function (r) { if (r === 'V') c.v++; else if (r === 'P') c.p++; else if (r === 'E') c.e++; else if (r === 'X') c.x++; });
    return c;
  }

  function attiveOggi(p) {
    return programma(p).attivita.filter(function (a) { return a.stato === 'attivo'; });
  }

  return {
    STATI_TARGET: STATI_TARGET,
    nuovoId: nuovoId, giorno: giorno, oggi: oggi,
    programma: programma, attivita: attivita, nomeSet: nomeSet, modoTarget: modoTarget,
    targetCorrente: targetCorrente, prossimoTarget: prossimoTarget,
    secondiTD: secondi, tdDi: tdDi, impostaTD: impostaTD, tdDaDecisione: tdDaDecisione,
    passiDi: passiDi, nuoviPassi: nuoviPassi,
    PALETTE: PALETTE, coloreDi: coloreDi, inPercentuale: inPercentuale,
    conAttesa: conAttesa, chiaveAttesa: chiaveAttesa, inAttesaDi: inAttesaDi, dividiLU: dividiLU, contaRisposte: contaRisposte,
    sedute: sedute, criterioRaggiunto: criterioRaggiunto, criterioDi: criterioDi, seduta: seduta,
    setIdsDi: setIdsDi, setIdDi: setIdDi,
    collegaSet: collegaSet, scollegaSet: scollegaSet, suggerisciSet: suggerisciSet,
    nuovaAttivita: nuovaAttivita, aggiungiTarget: aggiungiTarget,
    chiudiTarget: chiudiTarget, rendiCorrente: rendiCorrente, spostaTarget: spostaTarget,
    attiveOggi: attiveOggi
  };
});
