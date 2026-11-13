/**
 * Centro TICE — corsia veloce (Firestore).
 *
 * Accanto al custode (Apps Script + Drive, che resta la base dati e la fonte di verità) c'è una
 * seconda strada, più rapida e facoltativa:
 *   - ogni modifica di un bambino, già cifrata come la riceve il custode, viene scritta anche su
 *     Firestore; gli altri dispositivi la ricevono in tempo reale, la aprono e la uniscono con il
 *     meccanismo di sempre (tice-unisci.js). Poi il custode resta la verifica: al giro di
 *     sincronizzazione successivo i dati convergono comunque;
 *   - il dispositivo nuovo chiede la chiave del centro e la riceve in uno o due secondi da un
 *     amministratore che ha l'app aperta (la chiave viaggia cifrata per quel dispositivo);
 *   - qualunque errore (quota, rete, permessi, libreria non caricata) spegne la corsia e l'app
 *     funziona esattamente come prima. Il custode riceve sempre tutto.
 *
 * Senza il blocco `firebase` in tice-config.js non succede niente. La libreria di Firebase si
 * scarica solo se serve (import dinamico da gstatic), mai all'avvio dell'app senza configurazione.
 *
 * Il file si divide in tre parti, tutte provabili in Node:
 *   1. funzioni pure (piano delle richieste, codice di verifica, forma dei documenti);
 *   2. il «motore», che parla con un `backend` e con la sincronizzazione (tice-sync.js) solo tramite
 *      interfacce, così si prova senza rete con un backend finto;
 *   3. il backend vero (SDK di Firebase) e il collegamento nel browser.
 * Schema dei dati e delle regole: docs/firestore-progetto.md, regole: firestore.rules.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceVeloce = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Versione esatta della libreria: pubblicata da almeno due settimane. Per cambiarla basta questa riga.
  var SDK_VERSIONE = '13.1.0';
  var SDK_BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSIONE + '/';
  var RITENZIONE_MS = 3 * 86400000;      // le modifiche si cancellano dopo 3 giorni (chi manca da più si riallinea dal custode)
  var RICHIESTA_MS = 2 * 86400000;       // richieste e consegne della chiave: 2 giorni al massimo
  var MAX_BUSTA = 900000;                // caratteri della busta: Firestore accetta documenti fino a 1 MiB
  var MAX_IN = 30;                       // bambini per ogni richiesta «pid in [...]»
  var AULA_BASE = 'principale';
  var ORA = { $ora: true };              // «ora del server» (il backend lo traduce)

  function configurata(cfg) { return !!(cfg && cfg.projectId && cfg.apiKey && cfg.appId); }

  // ======================================================================
  // 1. Funzioni pure
  // ======================================================================
  function daB64(s) {
    var b = atob(s), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function sottile() { return (typeof crypto !== 'undefined' && crypto.subtle) || require('crypto').webcrypto.subtle; }

  /**
   * Codice di verifica a 6 cifre, derivato dall'impronta (SHA-256) della chiave pubblica del dispositivo.
   * Lo mostrano il dispositivo che chiede la chiave e quello dell'amministratore che la consegna: se
   * qualcuno si fosse infilato nel mezzo con un'altra chiave pubblica, i due codici sarebbero diversi.
   */
  function codiceVerifica(pubblicaB64) {
    return sottile().digest('SHA-256', daB64(pubblicaB64)).then(function (d) {
      var h = new Uint8Array(d);
      var n = (((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % 1000000;
      return String(n).padStart(6, '0');
    });
  }
  var formatoCodice = function (c) { return c ? c.slice(0, 3) + ' ' + c.slice(3) : ''; };

  /**
   * Quali ascolti servono a questa persona. Le regole non sono filtri: ogni richiesta deve essere
   * dimostrabile dalle regole, quindi si chiede solo quello che le regole garantiscono:
   *   - chi vede tutta l'aula (admin, o accesso a «tutti i bambini»): una richiesta per aula;
   *   - chi vede solo alcuni bambini: «pid in [...]» a gruppi di 30, sempre per aula;
   *   - i bambini riservati: una richiesta per bambino (le regole controllano chi l'ha creato e i condivisi).
   * ctx = { io, aulaDi: {pid: aula}, info: {pid: {riservato...}}, condivisi: [pid] }
   */
  function pianoAscolto(ctx) {
    var io = ctx.io || {}, aule = io.aule || {}, piano = [];
    var tutti = io.pazienti === '*';
    var info = ctx.info || {}, aulaDi = ctx.aulaDi || {};
    var visibili = Array.from(ctx.condivisi || []).filter(function (pid) { return aulaDi[pid]; });
    var perAula = {};
    visibili.forEach(function (pid) {
      if (info[pid] && info[pid].riservato) return;
      (perAula[aulaDi[pid]] = perAula[aulaDi[pid]] || []).push(pid);
    });
    Object.keys(aule).sort().forEach(function (a) {
      var vedeTutta = tutti || !!(aule[a].permessi && aule[a].permessi.vediTutti);
      if (vedeTutta) { piano.push({ coll: 'modifiche', filtri: [['aula', '==', a], ['riservato', '==', false]] }); return; }
      var l = (perAula[a] || []).slice().sort();
      for (var i = 0; i < l.length; i += MAX_IN) {
        piano.push({ coll: 'modifiche', filtri: [['aula', '==', a], ['riservato', '==', false], ['pid', 'in', l.slice(i, i + MAX_IN)]] });
      }
    });
    Object.keys(info).sort().forEach(function (pid) {
      if (!info[pid] || !info[pid].riservato || !aulaDi[pid] || !(ctx.condivisi && (ctx.condivisi.has ? ctx.condivisi.has(pid) : ctx.condivisi.indexOf(pid) >= 0))) return;
      piano.push({ coll: 'modifiche', filtri: [['aula', '==', aulaDi[pid]], ['riservato', '==', true], ['pid', '==', pid]] });
    });
    piano.forEach(function (s) { s.k = JSON.stringify(s.filtri); });
    return piano;
  }

  /** I due documenti di una modifica: il piccolo avviso (`modifiche/<pid>`) e la busta (`buste/<pid>`). */
  function costruisciModifica(o) {
    var comuni = { pid: o.pid, aula: o.aula || AULA_BASE, riservato: !!o.riservato, v: o.version, da: o.email, ts: ORA, scade: { $ms: o.adesso + RITENZIONE_MS } };
    var meta = Object.assign({}, comuni, { disp: String(o.disp || '').slice(0, 40) });
    var grandezza = JSON.stringify(o.busta).length;
    if (grandezza <= MAX_BUSTA) meta.n = grandezza;
    return { meta: meta, busta: Object.assign({}, comuni, { busta: o.busta }), troppoGrande: grandezza > MAX_BUSTA };
  }

  /** Cosa fare davanti a un errore di Firestore: spegnere la corsia, per quanto, e cosa dire. */
  function classificaErrore(e) {
    var c = String((e && (e.code || e.codice)) || '').replace(/^(firestore|auth)\//, '');
    var m = (e && e.message) || '';
    if (c === 'resource-exhausted') return { motivo: 'limite giornaliero di Firebase raggiunto: riprova domani', finoADomani: true };
    if (c === 'permission-denied') return { motivo: 'permessi non concessi da Firebase (le regole o la copia degli accessi non sono aggiornate)' };
    if (c === 'unauthenticated' || /credential|id-token|invalid-credential|user-token|requires-recent-login/.test(c)) return { motivo: 'accesso a Firebase non riuscito', serveAccesso: true };
    if (c === 'unavailable' || c === 'deadline-exceeded' || c === 'network-request-failed') return { motivo: 'nessuna connessione con Firebase', rete: true };
    if (c === 'sdk') return { motivo: 'non riesco a caricare la libreria di Firebase (rete?)', rete: true };
    if (c === 'failed-precondition') return { motivo: 'Firebase non è pronto (manca il database Firestore?)' };
    return { motivo: 'errore di Firebase' + (c ? ' (' + c + ')' : m ? ' (' + m.slice(0, 60) + ')' : '') };
  }
  var fineGiorno = function (ms) { var d = new Date(ms); d.setHours(24, 0, 0, 0); return d.getTime(); };

  // ---------- accesso silenzioso (One Tap / FedCM) ----------
  var SILENZIOSO_ATTESA_MS = 86400000;   // dopo un tentativo fallito si riprova al massimo una volta al giorno (raffreddamento di One Tap)

  /**
   * Conviene tentare ora l'accesso silenzioso? Solo se la corsia è configurata e spenta perché manca un accesso
   * Firebase fresco (non per quota, rete, configurazione o custode da aggiornare), il dispositivo è online,
   * l'ambiente supporta Google Identity Services, non si è già provato in questa sessione e l'ultimo tentativo
   * fallito risale a più di un giorno fa.
   * o = { configurata, stato: {attiva, serveAccesso, fisso}, email, online, disponibile, giaProvato, ultimoFallimento, ora }
   */
  function decidiSilenzioso(o) {
    o = o || {};
    var s = o.stato || {};
    if (!o.configurata) return { tenta: false, perche: 'non-configurata' };
    if (!o.email) return { tenta: false, perche: 'senza-email' };
    if (s.attiva) return { tenta: false, perche: 'gia-attiva' };
    if (s.fisso || !s.serveAccesso) return { tenta: false, perche: 'non-serve' };
    if (!o.disponibile) return { tenta: false, perche: 'ambiente' };
    if (!o.online) return { tenta: false, perche: 'offline' };
    if (o.giaProvato) return { tenta: false, perche: 'gia-provato' };
    var u = Number(o.ultimoFallimento || 0);
    if (u && o.ora - u < SILENZIOSO_ATTESA_MS && o.ora >= u) return { tenta: false, perche: 'raffreddamento' };
    return { tenta: true, perche: 'ok' };
  }
  /** L'email del token è quella della persona collegata? (altrimenti il token si scarta: l'identità non cambia) */
  function stessaEmail(a, b) {
    a = String(a || '').trim().toLowerCase(); b = String(b || '').trim().toLowerCase();
    return !!a && a === b;
  }
  /**
   * Tentativo silenzioso, una volta per sessione. dep = {
   *   configurata, stato(), email(), online(), disponibile(), ora(), memoria: {leggi, scrivi},
   *   tenta(email) -> Promise<{esito, email}>   (il lavoro con Google Identity Services),
   *   avvia() -> Promise<bool>                  (motore.avvia), avviso(testo) }
   * Restituisce una stringa col risultato (serve ai test): 'attivata' | 'ok-ma-spenta' | l'esito del tentativo | il motivo per cui non si prova.
   */
  function creaSilenzioso(dep) {
    var provato = false;
    return {
      prova: async function () {
        var email = dep.email();
        var d = decidiSilenzioso({ configurata: dep.configurata, stato: dep.stato(), email: email, online: dep.online(), disponibile: dep.disponibile(),
          giaProvato: provato, ultimoFallimento: dep.memoria.leggi('silenzioso'), ora: dep.ora() });
        if (!d.tenta) return d.perche;
        provato = true;
        var r;
        try { r = await dep.tenta(email); } catch (e) { r = { esito: 'errore' }; }
        r = r || { esito: 'errore' };
        if (r.esito === 'ok' && !stessaEmail(r.email, email)) r = { esito: 'diversa' };
        if (r.esito === 'non-disponibile') return r.esito;
        if (r.esito !== 'ok') { try { dep.memoria.scrivi('silenzioso', String(dep.ora())); } catch (e) { /* ok */ } return r.esito; }
        try { dep.memoria.scrivi('silenzioso', ''); } catch (e) { /* ok */ }
        var attiva = false;
        try { attiva = await dep.avvia(); } catch (e) { attiva = false; }
        if (attiva) { try { dep.avviso('Corsia veloce attivata'); } catch (e) { /* ok */ } return 'attivata'; }
        return 'ok-ma-spenta';
      }
    };
  }

  // ======================================================================
  // 2. Il motore
  // ======================================================================
  /**
   * dep = {
   *   cfg, backend, sync, ora(), memoria: { leggi(k), scrivi(k, v) }, setTimeout, clearTimeout
   * }
   * backend (asincrono):
   *   inizializza(), utente() -> {email}|null, accedi(idToken) -> {email}, esci(),
   *   scrivi(coll, id, dati), elimina(coll, id), leggi(coll, id) -> dati|null,
   *   pubblicaModifica(meta, busta),
   *   ascolta({coll, filtri}, suCambi([{tipo, id, dati}]), suErrore(e)) -> annulla()
   * sync (la sincronizzazione con il custode):
   *   contesto() -> { email, io, pronto, fase, aulaDi, info, condivisi, eAdmin, persone, chiaveEsportabile, kid, cfgChiave }
   *   idToken() -> ID token di Google o null;  dispositivo() -> {id, pubblica};  nomeDispositivo()
   *   versioneLocale(pid), applica(pid, versione, busta), chiaveRicevuta(bustaB64, kid), cifraChiaveA(pubblica),
   *   abilitaSuCustode({id, kid, busta, pubblica}), aggiornaPersone(), riallinea(), cambiato()
   */
  function creaMotore(dep) {
    var backend = dep.backend, sync = dep.sync, cfg = dep.cfg || {};
    var ora = dep.ora || Date.now;
    var memoria = dep.memoria || { leggi: function () { return null; }, scrivi: function () {} };
    var st = {
      stato: 'spenta', motivo: 'non avviata', serveAccesso: false, rete: false,
      avviando: null, iscrizioni: new Map(), visti: {}, elabora: Promise.resolve(),
      disp: null, email: null, richiestaId: null, codice: null, annullaConsegna: null,
      richieste: new Map(), codici: {}, consegnate: {}, pubblicate: 0, ricevute: 0, ultimoErrore: null, fisso: null
    };
    var log = dep.log || function () {};
    var notifica = function () { try { if (sync.cambiato) sync.cambiato(); } catch (e) { /* solo avviso */ } };
    var manuale = function () { return !!(sync.consegnaManuale && sync.consegnaManuale()); };

    function chiudi() {
      st.iscrizioni.forEach(function (annulla) { try { annulla(); } catch (e) { /* ok */ } });
      st.iscrizioni.clear();
      if (st.annullaConsegna) { try { st.annullaConsegna(); } catch (e) { /* ok */ } st.annullaConsegna = null; }
      st.richiestaId = null; st.richieste.clear();
    }
    /** Spegne la corsia: l'app torna a usare solo il custode. `fino` = ms, per la quota del giorno. */
    function spegni(motivo, opz) {
      opz = opz || {};
      var era = st.stato;
      chiudi();
      st.stato = 'spenta'; st.motivo = motivo; st.serveAccesso = !!opz.serveAccesso; st.rete = !!opz.rete;
      if (opz.finoADomani) { try { memoria.scrivi('fino', String(fineGiorno(ora()))); } catch (e) { /* ok */ } }
      st.avviando = null;
      log('corsia veloce spenta: ' + motivo);
      if (era !== 'spenta' || opz.notifica) notifica();
      return false;
    }
    function spegniPerErrore(e) {
      var c = classificaErrore(e);
      st.ultimoErrore = e;
      return spegni(c.motivo, c);
    }
    /** Spenta per una ragione che non passa da sola (configurazione o custode da aggiornare). */
    function spegniFisso(motivo) { st.fisso = motivo; spegni(motivo, { notifica: true }); }
    function riabilita() { if (st.fisso) { st.fisso = null; } }

    async function avvia(opz) {
      if (st.stato === 'attiva') return true;
      if (st.avviando) return st.avviando;
      if (!configurata(cfg)) return false;
      var c = sync.contesto();
      if (!c.io || !c.email) return false;
      if (!(c.io.funzioni || []).includes('veloce')) { spegniFisso('il custode del centro va aggiornato'); return false; }
      if (c.io.veloce && c.io.veloce.progetto && c.io.veloce.progetto !== cfg.projectId) { spegniFisso('il custode usa un altro progetto Firebase'); return false; }
      riabilita();
      var fino = Number(memoria.leggi('fino') || 0);
      if (fino > ora() && !(opz && opz.forza)) { st.motivo = 'limite giornaliero raggiunto: riprova domani'; notifica(); return false; }
      st.avviando = (async function () {
        try {
          st.stato = 'avvio'; st.motivo = 'in avvio'; notifica();
          await backend.inizializza();
          var u = backend.utente();
          if (!u || String(u.email || '').toLowerCase() !== c.email) {
            var t = sync.idToken();
            if (!t) { st.stato = 'spenta'; st.serveAccesso = true; st.motivo = 'serve un nuovo accesso con Google'; st.avviando = null; notifica(); return false; }
            if (u) await backend.esci();
            u = await backend.accedi(t);
            if (String(u.email || '').toLowerCase() !== c.email) { await backend.esci(); return spegni('l\'account Google non coincide con quello del centro'); }
          }
          // la copia degli accessi la scrive il custode: se non c'è ancora, le regole negherebbero tutto
          var mia = await backend.leggi('accessi', c.email);
          if (!mia) return spegni('il custode non ha ancora copiato gli accessi su Firebase: apri l\'app da un amministratore e riprova');
          st.email = c.email;
          st.disp = (await sync.dispositivo()).id;
          st.stato = 'attiva'; st.motivo = ''; st.serveAccesso = false; st.rete = false;
          st.avviando = null;
          notifica();
          ricalcola();
          avviaChiave();
          return true;
        } catch (e) { st.avviando = null; return spegniPerErrore(e); }
      })();
      return st.avviando;
    }

    function ferma(motivo) { chiudi(); if (backend.utente()) Promise.resolve(backend.esci()).catch(function () {}); st.stato = 'spenta'; st.motivo = motivo || 'uscito dal centro'; st.avviando = null; st.email = null; notifica(); }

    // ---------- modifiche ----------
    function ricalcola() {
      if (st.stato !== 'attiva') return;
      var c = sync.contesto();
      if (!c.io || c.email !== st.email) return;
      var voluti = new Map();
      if (c.pronto) pianoAscolto(c).forEach(function (s) { voluti.set(s.k, s); });
      Array.from(st.iscrizioni.keys()).forEach(function (k) {
        if (k.indexOf('r:') === 0 || voluti.has(k)) return;
        try { st.iscrizioni.get(k)(); } catch (e) { /* ok */ }
        st.iscrizioni.delete(k);
      });
      voluti.forEach(function (s, k) {
        if (st.iscrizioni.has(k)) return;
        st.iscrizioni.set(k, backend.ascolta(s, function (cambi) {
          cambi.forEach(function (x) { if (x.tipo === 'added' || x.tipo === 'modified') accoda(x.dati || {}); });
        }, spegniPerErrore));
      });
      ricalcolaRichieste();
    }
    function accoda(meta) {
      st.elabora = st.elabora.then(function () { return riceviModifica(meta); }).catch(function (e) { log('modifica non applicata: ' + (e && e.message)); });
    }
    async function riceviModifica(meta) {
      if (st.stato !== 'attiva' || !meta.pid || !(meta.v > 0)) return;
      if (meta.disp === st.disp) return;                         // l'ho scritta io
      if ((st.visti[meta.pid] || 0) >= meta.v) return;
      if ((await sync.versioneLocale(meta.pid)) >= meta.v) { st.visti[meta.pid] = meta.v; return; }   // l'ho già
      var b = await backend.leggi('buste', meta.pid);
      if (!b || !b.busta || !(b.v >= meta.v)) return;
      st.visti[meta.pid] = b.v;
      if (await sync.applica(meta.pid, b.v, b.busta)) { st.ricevute++; notifica(); }
    }
    /** Dopo che il custode ha accettato un salvataggio: lo stesso, subito, anche su Firestore. Mai un errore per chi chiama. */
    async function pubblica(rec) {
      if (st.stato !== 'attiva') return false;
      try {
        var c = sync.contesto();
        var info = (c.info || {})[rec.pid];
        var m = costruisciModifica({ pid: rec.pid, aula: (c.aulaDi || {})[rec.pid] || AULA_BASE, riservato: !!(info && info.riservato),
          version: rec.version, email: st.email, disp: st.disp, busta: rec.busta, adesso: ora() });
        if (m.troppoGrande) return false;                        // resta solo sul custode (arriva al giro di sincronizzazione)
        st.visti[rec.pid] = rec.version;
        await Promise.race([backend.pubblicaModifica(m.meta, m.busta), new Promise(function (ok, ko) { (dep.setTimeout || setTimeout)(function () { ko({ code: 'deadline-exceeded' }); }, 20000); })]);
        st.pubblicate++;
        return true;
      } catch (e) { spegniPerErrore(e); return false; }
    }

    // ---------- la chiave del centro ----------
    function avviaChiave() {
      var c = sync.contesto();
      if (st.stato !== 'attiva' || !c.io) return;
      if (c.fase === 'attesa' || c.fase === 'chiave') richiediChiave().catch(spegniPerErrore);
      ricalcolaRichieste();
    }
    async function richiediChiave() {
      if (st.richiestaId || st.stato !== 'attiva') return;
      var c = sync.contesto();
      if (!c.io.cifratura && !c.cfgChiave) return;
      var d = await sync.dispositivo();
      st.richiestaId = d.id;
      st.codice = await codiceVerifica(d.pubblica);
      var aule = Object.keys(c.io.aule || {});
      await backend.scrivi('richieste', d.id, { email: st.email, aula: aule.indexOf(AULA_BASE) >= 0 ? AULA_BASE : aule[0], nome: String(sync.nomeDispositivo()).slice(0, 80),
        pubblica: d.pubblica, ts: ORA, scade: { $ms: ora() + RICHIESTA_MS } });
      notifica();
      st.annullaConsegna = backend.ascolta({ coll: 'consegne', filtri: [['email', '==', st.email]] }, function (cambi) {
        cambi.forEach(function (x) {
          if ((x.tipo === 'added' || x.tipo === 'modified') && x.id === d.id && x.dati && x.dati.busta) riceviChiave(d.id, x.dati).catch(spegniPerErrore);
        });
      }, spegniPerErrore);
    }
    async function riceviChiave(id, d) {
      if (!(await sync.chiaveRicevuta(d.busta, d.kid))) return;
      await ripulisciRichiesta(id);
      notifica();
    }
    async function ripulisciRichiesta(id) {
      if (st.annullaConsegna) { try { st.annullaConsegna(); } catch (e) { /* ok */ } st.annullaConsegna = null; }
      st.richiestaId = null; st.codice = null;
      await Promise.all([backend.elimina('consegne', id), backend.elimina('richieste', id)].map(function (p) { return p.catch(function () {}); }));
    }
    /** La chiave è arrivata per un'altra strada (il custode): la richiesta non serve più. */
    function chiaveArrivata() {
      if (st.stato === 'attiva' && st.richiestaId) ripulisciRichiesta(st.richiestaId).then(notifica);
    }

    // l'amministratore con la chiave in mano ascolta le richieste delle sue aule
    function ricalcolaRichieste() {
      var c = sync.contesto();
      var puoConsegnare = st.stato === 'attiva' && c.eAdmin && c.pronto && c.chiaveEsportabile;
      var voluti = {};
      if (puoConsegnare) Object.keys(c.io.aule || {}).forEach(function (a) { if (c.io.aule[a].permessi && c.io.aule[a].permessi.gestisciAccessi) voluti['r:' + a] = a; });
      Array.from(st.iscrizioni.keys()).forEach(function (k) {
        if (k.indexOf('r:') !== 0 || voluti[k]) return;
        try { st.iscrizioni.get(k)(); } catch (e) { /* ok */ }
        st.iscrizioni.delete(k);
      });
      Object.keys(voluti).forEach(function (k) {
        if (st.iscrizioni.has(k)) return;
        st.iscrizioni.set(k, backend.ascolta({ coll: 'richieste', filtri: [['aula', '==', voluti[k]]] }, function (cambi) {
          cambi.forEach(function (x) {
            if (x.tipo === 'removed') { st.richieste.delete(x.id); return; }
            if (x.id === st.richiestaId || !x.dati) return;       // la mia stessa richiesta
            st.richieste.set(x.id, Object.assign({ id: x.id }, x.dati));
          });
          smista().catch(spegniPerErrore);
        }, spegniPerErrore));
      });
    }
    async function smista() {
      for (var r of Array.from(st.richieste.values())) {
        if (!(r.id in st.codici)) st.codici[r.id] = await codiceVerifica(r.pubblica).catch(function () { return ''; });
      }
      if (manuale()) { notifica(); return; }
      for (var q of Array.from(st.richieste.values())) { try { await consegna(q.id); } catch (e) { log('consegna non riuscita: ' + (e && e.message)); } }
      notifica();
    }
    /** Consegna la chiave a un dispositivo che l'ha chiesta, dopo aver controllato che la persona sia abilitata. */
    async function consegna(id) {
      var r = st.richieste.get(id);
      var c = sync.contesto();
      if (!r || !c.chiaveEsportabile || st.consegnate[id]) return false;
      var abilitata = function () { var e = String(r.email || '').toLowerCase(); return e === c.email || (sync.contesto().persone || []).some(function (p) { return String(p.email || '').toLowerCase() === e; }); };
      if (!abilitata()) { await sync.aggiornaPersone(); if (!abilitata()) return false; }
      st.consegnate[id] = true;
      try {
        var busta = await sync.cifraChiaveA(r.pubblica);
        await backend.scrivi('consegne', id, { email: String(r.email).toLowerCase(), kid: c.kid, busta: busta, da: c.email, ts: ORA, scade: { $ms: ora() + RICHIESTA_MS } });
      } catch (e) { delete st.consegnate[id]; throw e; }
      st.richieste.delete(id);
      // il custode resta allineato (chi è abilitato, a chi è stata consegnata) e la richiesta si toglie
      Promise.resolve(sync.abilitaSuCustode({ id: id, kid: c.kid, busta: busta, pubblica: r.pubblica })).catch(function () {});
      backend.elimina('richieste', id).catch(function () {});
      notifica();
      return true;
    }

    return {
      avvia: avvia, ferma: ferma, spegni: spegni, ricalcola: ricalcola, pubblica: pubblica, chiaveArrivata: chiaveArrivata, consegna: consegna,
      avviaChiave: avviaChiave, smista: smista,
      attiva: function () { return st.stato === 'attiva'; },
      stato: function () {
        return { stato: st.stato, attiva: st.stato === 'attiva', motivo: st.motivo, serveAccesso: st.serveAccesso, rete: st.rete, fisso: !!st.fisso,
          codice: st.codice, pubblicate: st.pubblicate, ricevute: st.ricevute };
      },
      richieste: function () { return Array.from(st.richieste.values()).map(function (r) { return Object.assign({}, r, { codice: st.codici[r.id] || '' }); }); },
      _st: st
    };
  }

  // ======================================================================
  // 3. Backend vero (SDK di Firebase) e collegamento nel browser
  // ======================================================================
  /** sdk = { app, auth, firestore }: i moduli «firebase-app», «firebase-auth», «firebase-firestore». */
  function creaBackendFirebase(sdk, cfg, opz) {
    opz = opz || {};
    var A = sdk.app, Au = sdk.auth, F = sdk.firestore, app, auth, db;
    function converti(d) {
      var o = {};
      Object.keys(d).forEach(function (k) {
        var v = d[k];
        if (v && v.$ora) o[k] = F.serverTimestamp();
        else if (v && typeof v.$ms === 'number') o[k] = F.Timestamp.fromMillis(v.$ms);
        else o[k] = v;
      });
      return o;
    }
    function semplice(d) {
      var o = {};
      Object.keys(d || {}).forEach(function (k) {
        var v = d[k];
        o[k] = v && typeof v.toMillis === 'function' ? v.toMillis() : v;
      });
      return o;
    }
    return {
      inizializza: async function () {
        if (db) return;
        app = A.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId }, opz.nome || 'tice-veloce');
        // senza risolutori di popup/redirect: niente pagine di Google caricate, basta signInWithCredential
        auth = Au.initializeAuth(app, { persistence: opz.persistenza === 'memoria' ? Au.inMemoryPersistence : Au.indexedDBLocalPersistence });
        db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
        if (cfg.emulatore) {
          Au.connectAuthEmulator(auth, cfg.emulatore.auth, { disableWarnings: true });
          var hp = String(cfg.emulatore.firestore).split(':');
          F.connectFirestoreEmulator(db, hp[0], Number(hp[1]));
        }
        if (auth.authStateReady) await auth.authStateReady();
      },
      utente: function () { return auth && auth.currentUser ? { email: auth.currentUser.email, uid: auth.currentUser.uid } : null; },
      accedi: async function (idToken) {
        var r = await Au.signInWithCredential(auth, Au.GoogleAuthProvider.credential(idToken));
        return { email: r.user.email, uid: r.user.uid };
      },
      esci: function () { return auth ? Au.signOut(auth) : Promise.resolve(); },
      scrivi: function (coll, id, dati) { return F.setDoc(F.doc(db, coll, id), converti(dati)); },
      elimina: function (coll, id) { return F.deleteDoc(F.doc(db, coll, id)); },
      leggi: async function (coll, id) {
        var s = await F.getDoc(F.doc(db, coll, id));
        return s.exists() ? semplice(s.data()) : null;
      },
      pubblicaModifica: function (meta, busta) {
        var b = F.writeBatch(db);
        b.set(F.doc(db, 'modifiche', meta.pid), converti(meta));
        b.set(F.doc(db, 'buste', meta.pid), converti(busta));
        return b.commit();
      },
      ascolta: function (spec, suCambi, suErrore) {
        var q = F.query.apply(null, [F.collection(db, spec.coll)].concat(spec.filtri.map(function (f) { return F.where(f[0], f[1], f[2]); })));
        return F.onSnapshot(q, function (snap) {
          suCambi(snap.docChanges().map(function (ch) { return { tipo: ch.type, id: ch.doc.id, dati: semplice(ch.doc.data()) }; }));
        }, suErrore);
      },
      _db: function () { return db; }, _auth: function () { return auth; }
    };
  }

  function caricaSdk(base) {
    base = base || SDK_BASE;
    return Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(function (f) { return import(base + f); }))
      .then(function (m) { return { app: m[0], auth: m[1], firestore: m[2] }; })
      .catch(function (e) { var x = new Error('libreria di Firebase non caricata: ' + (e && e.message)); x.code = 'sdk'; throw x; });
  }

  /**
   * Nel browser: collega il motore alla sincronizzazione (TiceSync). Non fa niente senza configurazione
   * né senza TiceSync. Restituisce l'oggetto che l'app usa (stato, richieste, attivazione manuale).
   */
  function avviaNelBrowser() {
    var w = typeof window !== 'undefined' ? window : null;
    if (!w || !w.TiceSync || !w.TiceCifra) return null;
    var Y = w.TiceSync, C = w.TiceCifra, cfg = (w.TICE_CONFIG || {}).firebase;
    if (!configurata(cfg)) return null;
    var X = Y.interno;
    var backend = (function () {
      var vero = null;
      function ottieni() {
        if (vero) return Promise.resolve(vero);
        return caricaSdk(cfg.sdkBase).then(function (sdk) { vero = creaBackendFirebase(sdk, cfg); return vero; });
      }
      var metodi = ['inizializza', 'esci', 'scrivi', 'elimina', 'leggi', 'pubblicaModifica', 'accedi'];
      var b = { utente: function () { return vero ? vero.utente() : null; }, ascolta: function (spec, ok, ko) {
        var annulla = null, chiuso = false;
        ottieni().then(function (v) { if (!chiuso) annulla = v.ascolta(spec, ok, ko); }, ko);
        return function () { chiuso = true; if (annulla) annulla(); };
      } };
      metodi.forEach(function (m) { b[m] = function () { var a = arguments; return ottieni().then(function (v) { return v[m].apply(v, a); }); }; });
      return b;
    })();
    var sync = {
      contesto: function () { return X.contesto(); },
      idToken: function () { return X.idTokenPerFirebase(); },
      dispositivo: function () { return C.dispositivo(); },
      nomeDispositivo: function () { return X.nomeDispositivo(); },
      versioneLocale: function (pid) { return X.versioneLocale(pid); },
      applica: function (pid, v, busta) { return X.applicaLive(pid, v, busta); },
      chiaveRicevuta: function (busta, kid) { return X.chiaveRicevuta(busta, kid); },
      cifraChiaveA: function (pubblica) { return X.cifraChiaveA(pubblica); },
      abilitaSuCustode: function (x) { return X.abilitaSuCustode(x); },
      aggiornaPersone: function () { return Y.aggiornaPersone(); },
      consegnaManuale: function () { try { return localStorage.getItem('tice_consegna_manuale') === '1'; } catch (e) { return false; } },
      cambiato: function () { X.notifica('veloce'); }
    };
    var motore = creaMotore({
      cfg: cfg, backend: backend, sync: sync, ora: Date.now,
      memoria: { leggi: function (k) { try { return localStorage.getItem('tice_veloce_' + k); } catch (e) { return null; } },
        scrivi: function (k, v) { try { localStorage.setItem('tice_veloce_' + k, v); } catch (e) { /* ok */ } } },
      log: function (m) { try { console.info('[corsia veloce] ' + m); } catch (e) { /* ok */ } }
    });
    var silenzioso = creaSilenzioso({
      configurata: true,
      stato: function () { return motore.stato(); },
      email: function () { var u = Y.Auth.utente(); var c = X.contesto(); return (c && c.email) || (u && u.email) || null; },
      online: function () { return typeof navigator === 'undefined' || navigator.onLine !== false; },
      disponibile: function () { return !!(Y.Auth.silenziosoDisponibile && Y.Auth.silenziosoDisponibile()); },
      ora: Date.now,
      memoria: { leggi: function (k) { try { return localStorage.getItem('tice_veloce_' + k); } catch (e) { return null; } },
        scrivi: function (k, v) { try { localStorage.setItem('tice_veloce_' + k, v); } catch (e) { /* ok */ } } },
      tenta: function (email) { return Y.Auth.accessoSilenzioso(email); },
      avvia: function () { return motore.avvia(); },
      avviso: function (t) { try { var T = w.TiceHome && w.TiceHome.strumenti; if (T && T.avviso) T.avviso(t); } catch (e) { /* ok */ } }
    });
    function provaSilenzioso() { return silenzioso.prova().catch(function () { return 'errore'; }); }
    var timer = null;
    function aggiorna() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var c = X.contesto();
        if (!c.io || c.fase === 'fuori' || c.fase === 'spento') { if (motore.stato().stato !== 'spenta' || motore.stato().motivo !== 'uscito dal centro') motore.ferma('uscito dal centro'); return; }
        if (motore.attiva()) { motore.ricalcola(); if (c.fase === 'pronto') motore.chiaveArrivata(); else motore.avviaChiave(); }
        else Promise.resolve(motore.avvia()).then(provaSilenzioso, function () {});
      }, 250);
    }
    Y.alCambio(function (cosa) { if (cosa !== 'veloce') aggiorna(); });
    w.addEventListener('online', function () { var s = motore.stato(); if (!s.attiva && s.rete) Promise.resolve(motore.avvia({ forza: true })).then(provaSilenzioso, function () {}); else provaSilenzioso(); });
    var api = {
      attiva: motore.attiva, stato: motore.stato, richieste: motore.richieste, consegna: motore.consegna,
      pubblica: motore.pubblica, chiaveArrivata: motore.chiaveArrivata,
      /** Dopo un accesso con Google nuovo o rinnovato (o con il tasto «Attiva la corsia veloce»). */
      riprova: function () { return motore.avvia({ forza: true }); },
      attivaConAccesso: function () {
        return Y.Auth.rinnovaGoogle().then(function () { return motore.avvia({ forza: true }); });
      },
      codiceVerifica: codiceVerifica, formatoCodice: formatoCodice,
      esci: function () { motore.ferma('uscito dal centro'); },
      _motore: motore
    };
    aggiorna();
    return api;
  }

  var api = {
    SDK_VERSIONE: SDK_VERSIONE, SDK_BASE: SDK_BASE, RITENZIONE_MS: RITENZIONE_MS, RICHIESTA_MS: RICHIESTA_MS, MAX_BUSTA: MAX_BUSTA, MAX_IN: MAX_IN, ORA: ORA,
    configurata: configurata, decidiSilenzioso: decidiSilenzioso, stessaEmail: stessaEmail, creaSilenzioso: creaSilenzioso, SILENZIOSO_ATTESA_MS: SILENZIOSO_ATTESA_MS, codiceVerifica: codiceVerifica, formatoCodice: formatoCodice, pianoAscolto: pianoAscolto,
    costruisciModifica: costruisciModifica, classificaErrore: classificaErrore, creaMotore: creaMotore,
    creaBackendFirebase: creaBackendFirebase, caricaSdk: caricaSdk, avviaNelBrowser: avviaNelBrowser
  };
  // nel browser, con TiceSync già caricato: la corsia parte da sola (senza configurazione non fa niente)
  if (typeof window !== 'undefined' && window.TiceSync && window.TiceSync.interno) api.app = avviaNelBrowser();
  return api;
});
