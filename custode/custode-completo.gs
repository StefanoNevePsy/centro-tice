// ============================================================================
// Custode dell'edizione Centro TICE — FILE UNICO DA INCOLLARE IN APPS SCRIPT
// Generato da tools/componi-custode.js: non modificarlo a mano, modifica
// custode/core.js e custode/Code.gs e rigeneralo.
// ============================================================================

/**
 * Quaderno TICE — custode su Google Apps Script.
 *
 * Questo file collega la logica (core.gs, identica a custode/core.js) ai servizi
 * Google: Drive per i file, LockService per le scritture, UrlFetch per verificare
 * l'identita'. Tutte le regole su chi puo' fare cosa stanno in core.gs.
 *
 * Installazione: docs/configurazione.md. In breve:
 *   1. Proprieta' dello script: CARTELLA_RADICE, GOOGLE_CLIENT_ID
 *      (e GOOGLE_CLIENT_ID_DESKTOP per l'app installata su Mac e Windows).
 *   2. Esegui una volta `configura` dall'editor.
 *   3. Distribuisci come app web: "Esegui come: Me", "Chi ha accesso: Chiunque".
 */

var VERSIONE_CUSTODE = '2.0.0';
var PROP = PropertiesService.getScriptProperties();

// ---------------------------------------------------------------------------
// Ingresso HTTP
// ---------------------------------------------------------------------------
function doPost(e) {
  var risposta;
  try {
    var corpo = (e && e.postData && e.postData.contents) || '';
    if (corpo.length > 40 * 1024 * 1024) {
      risposta = { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta troppo grande.' };
    } else {
      var richiesta;
      try { richiesta = JSON.parse(corpo); } catch (e) { richiesta = undefined; }
      risposta = richiesta === undefined
        ? { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta non leggibile.' }
        : custode_().gestisci(richiesta);
    }
  } catch (err) {
    // Configurazione o servizi Google (Drive, cache) non disponibili: l'app riprova
    risposta = { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(err && err.message || err).slice(0, 300) };
  }
  return ContentService.createTextOutput(JSON.stringify(risposta)).setMimeType(ContentService.MimeType.JSON);
}

// Solo per verificare dal browser che il custode risponda. Non espone dati.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, servizio: 'custode Quaderno TICE', versione: VERSIONE_CUSTODE,
    configurato: !!(PROP.getProperty('CARTELLA_RADICE') && PROP.getProperty('GOOGLE_CLIENT_ID')),
  })).setMimeType(ContentService.MimeType.JSON);
}

// Chi ospita il custode, sempre admin. Lo si legge da Google una volta e lo si
// ricorda nelle proprieta' dello script: se Google per un attimo non lo dice,
// il proprietario non viene scambiato per uno sconosciuto.
var _proprietario = null;
function proprietario_() {
  if (_proprietario) return _proprietario;
  var p = PROP.getProperty('PROPRIETARIO');
  if (p) return (_proprietario = String(p).trim().toLowerCase());
  var e = '';
  try { e = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (x) { e = ''; }
  if (e) { try { PROP.setProperty('PROPRIETARIO', e); } catch (x) { /* si riprova la prossima volta */ } }
  return e;
}

var _custode = null;
function custode_() {
  if (_custode) return _custode;
  _custode = QT.creaCustode({
    archivio: archivioDrive_(),
    verificaToken: verificaToken_,
    creaSessione: creaSessione_,
    proprietario: proprietario_,
    ora: function () { return new Date().toISOString(); },
    sha256Hex: function (b64) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.base64Decode(b64))); },
    // Corsia rapida dello «stato del centro» (vedi core.js): chiavi gia' corte, valori < 100 KB, TTL max 6 ore
    cache: (function () {
      var c = cronoCache_(CacheService.getScriptCache());
      return {
        get: function (k) { return c.get(k); },
        getAll: function (chiavi) { return c.getAll(chiavi); },
        put: function (k, v, secondi) { c.put(k, v, Math.min(secondi || 600, 21600)); },
        remove: function (k) { c.remove(k); },
      };
    })(),
    // Risposte alle scritture gia' fatte, per i reinvii dell'app (10 minuti)
    ricordo: {
      leggi: function (k) { return CacheService.getScriptCache().get(chiaveCache_(k)); },
      scrivi: function (k, v) { CacheService.getScriptCache().put(chiaveCache_(k), v, 600); },
    },
  });
  return _custode;
}

// ---------------------------------------------------------------------------
// Identita': verifica dell'ID token di "Accedi con Google"
// ---------------------------------------------------------------------------
// Sessione del custode: «s1.<dati>.<firma>», firmata con un segreto che il custode
// crea da solo nelle proprietà dello script. Dura SESSIONE_GIORNI giorni.
var SESSIONE_GIORNI = 30;
function segretoSessione_() {
  var s = PROP.getProperty('SESSIONE_SEGRETO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); PROP.setProperty('SESSIONE_SEGRETO', s); }
  return s;
}
function firmaSessione_(dati) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(dati, segretoSessione_())).replace(/=+$/, '');
}
function creaSessione_(id) {
  var scade = Math.floor(Date.now() / 1000) + SESSIONE_GIORNI * 86400;
  var dati = Utilities.base64EncodeWebSafe(JSON.stringify({ e: id.email, n: id.nome, x: scade }), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return { token: 's1.' + dati + '.' + firmaSessione_(dati), scade: scade };
}
function verificaSessione_(token) {
  var p = token.split('.');
  if (p.length !== 3 || firmaSessione_(p[1]) !== p[2]) throw new Error('sessione non valida');
  var d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[1])).getDataAsString());
  if (!(d.x > Date.now() / 1000)) throw new Error('sessione scaduta');
  return { email: String(d.e).toLowerCase(), nome: d.n || d.e, sessione: true };
}

function verificaToken_(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new Error('token mancante');
  if (token.indexOf('s1.') === 0) return verificaSessione_(token);
  // Client dell'app web e, se c'è, dell'app desktop (accesso dal browser di sistema)
  var clientIds = [PROP.getProperty('GOOGLE_CLIENT_ID'), PROP.getProperty('GOOGLE_CLIENT_ID_DESKTOP')].filter(Boolean);
  if (!clientIds.length) throw new Error('GOOGLE_CLIENT_ID non configurato');

  // Un token si verifica una volta e poi si ricorda fino alla sua scadenza:
  // evita una chiamata a Google per ogni richiesta dell'app.
  var cache = CacheService.getScriptCache();
  var chiave = 'tok:' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var inCache = cache.get(chiave);
  if (inCache) return JSON.parse(inCache);

  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('token rifiutato da Google');
  var t = JSON.parse(r.getContentText());

  // Il token deve essere stato emesso da Google, per QUESTA app, non scaduto,
  // e riferito a un'email verificata.
  if (clientIds.indexOf(t.aud) < 0) throw new Error('token emesso per un\'altra app');
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw new Error('emittente non valido');
  if (String(t.email_verified) !== 'true') throw new Error('email non verificata');
  var adesso = Math.floor(Date.now() / 1000);
  var scade = Number(t.exp);
  if (!(scade > adesso)) throw new Error('token scaduto');

  var identita = { email: String(t.email).toLowerCase(), nome: t.name || t.given_name || t.email };
  var durata = Math.max(1, Math.min(21600, scade - adesso - 60));
  cache.put(chiave, JSON.stringify(identita), durata);
  return identita;
}

// Misure della richiesta in corso (per `fasi` nella risposta): millisecondi passati nella cache di
// Apps Script e numero di operazioni sui servizi Drive (ognuna costa da 0,3 a 1,5 secondi).
var _mCache = 0, _nDrive = 0;
function cronoCache_(c) {
  function t(fn) { var t0 = Date.now(); try { return fn(); } finally { _mCache += Date.now() - t0; } }
  return {
    get: function (k) { return t(function () { return c.get(k); }); },
    getAll: function (ks) { return t(function () { return c.getAll(ks); }); },
    put: function (k, v, s) { return t(function () { return c.put(k, v, s); }); },
    putAll: function (o, s) { return t(function () { return c.putAll(o, s); }); },
    remove: function (k) { return t(function () { return c.remove(k); }); },
  };
}

// Le chiavi della cache di Apps Script hanno un limite di lunghezza
function chiaveCache_(k) {
  return 'r:' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k));
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

// ---------------------------------------------------------------------------
// Archivio su Drive, con percorsi tipo "Pazienti/pz_x/paziente.json"
// ---------------------------------------------------------------------------
function archivioDrive_() {
  var radiceId = PROP.getProperty('CARTELLA_RADICE');
  if (!radiceId) throw new Error('CARTELLA_RADICE non configurata');
  var cache = cronoCache_(CacheService.getScriptCache());
  var memoria = {};   // cache della singola richiesta
  var gen = generazioneCache_();

  // Ogni chiamata ai servizi Drive passa di qui: serve solo a contarle
  function D(fn) { _nDrive++; return fn(); }

  function radice() { return memoria.radice || (memoria.radice = D(function () { return DriveApp.getFolderById(radiceId); })); }

  // Gli id di file e cartelle si ricordano 6 ore. Quelli dei file cambiano generazione con
  // svuotaCache(): un file spostato a mano nel cestino non resta mai in uso.
  function chiaveF(p) { return 'f' + gen + ':' + p; }

  // Cartella di un percorso ("Pazienti/pz_x"), creandola se serve.
  function cartella(percorso, crea) {
    if (!percorso) return radice();
    var m = memoria['d:' + percorso];
    if (m) return m;
    if (m === null && !crea) return null;   // gia' cercata in questa richiesta: non c'e'
    var parti = percorso.split('/');
    var nome = parti.pop();
    if (m === undefined) {
      var id = cache.get('d:' + percorso);
      if (id) {
        try {
          var f = D(function () { return DriveApp.getFolderById(id); });
          memoria['d:' + percorso] = f;
          return f;
        } catch (e) { cache.remove('d:' + percorso); }
      }
    }
    var genitore = cartella(parti.join('/'), crea);
    if (!genitore) { memoria['d:' + percorso] = null; return null; }
    var trovata = null;
    if (m !== null) {   // (se gia' cercata e assente, per crearla non si cerca di nuovo)
      var it = D(function () { return genitore.getFoldersByName(nome); });
      trovata = D(function () { return it.hasNext() ? it.next() : null; });
    }
    if (!trovata && crea) trovata = D(function () { return genitore.createFolder(nome); });
    if (trovata) {
      cache.put('d:' + percorso, trovata.getId(), 21600);
      memoria['d:' + percorso] = trovata;
    } else memoria['d:' + percorso] = null;
    return trovata;
  }

  function file(percorso) {
    if (memoria['f:' + percorso] !== undefined) return memoria['f:' + percorso];
    var id = cache.get(chiaveF(percorso));
    if (id) {
      // l'id e' stato scritto da noi o trovato in una ricerca per nome: se il file e' stato tolto dal
      // custode (elimina) l'id non c'e' piu'; un file tolto a mano si ritrova con svuotaCache()
      try {
        var f = D(function () { return DriveApp.getFileById(id); });
        memoria['f:' + percorso] = f;
        return f;
      } catch (e) { /* rimosso: si cerca per nome */ }
      cache.remove(chiaveF(percorso));
    }
    var parti = percorso.split('/');
    var nome = parti.pop();
    var dir = cartella(parti.join('/'), false);
    var trovato = null;
    if (dir) {
      var it = D(function () { return dir.getFilesByName(nome); });
      while (D(function () { return it.hasNext(); })) {
        var cand = D(function () { return it.next(); });
        if (!D(function () { return cand.isTrashed(); })) { trovato = cand; break; }
      }
    }
    if (trovato) cache.put(chiaveF(percorso), trovato.getId(), 21600);
    memoria['f:' + percorso] = trovato;
    return trovato;
  }

  // Il contenuto dei file JSON si tiene anche nella cache di Apps Script (molto
  // più veloce di Drive) e si aggiorna a ogni scrittura, che passa sempre di qui.
  // I file grandi in pezzi da 90 KB (fino a ~900 KB); le versioni precedenti
  // dei pazienti no (si leggono di rado). Un pezzo perso o una cache svuotata
  // fanno rileggere da Drive, mai mezzo file.
  var PEZZO = 90000, MAX_PEZZI = 10;
  var daTenere = function (p) { return !/\/versioni\//.test(p); };
  // la generazione cambia con svuotaCache(): da lì tutto si rilegge da Drive
  function chiaveC(p) { return 'c' + gen + ':' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p)).slice(0, 40); }
  // undefined: la cache non sa niente; null: il file non c'è; testo: il contenuto
  function daCache(p) {
    if (!daTenere(p)) return undefined;
    var k = chiaveC(p), testa = cache.get(k);
    if (!testa) return undefined;
    try {
      var t = JSON.parse(testa);
      if (t.assente) return null;
      var chiavi = [];
      for (var i = 0; i < t.n; i++) chiavi.push(k + ':' + t.tag + ':' + i);
      var pezzi = cache.getAll(chiavi), out = '';
      for (var j = 0; j < chiavi.length; j++) { if (pezzi[chiavi[j]] == null) return undefined; out += pezzi[chiavi[j]]; }
      return out.length === t.len ? out : undefined;
    } catch (e) { return undefined; }
  }
  // true se il contenuto e' in cache (per i file rimandati: la cache e' l'unica copia aggiornata)
  function inCache(p, testo) {
    if (!daTenere(p)) return false;
    var k = chiaveC(p);
    try {
      if (testo == null) { cache.put(k, JSON.stringify({ assente: true }), 21600); return true; }
      if (testo.length > PEZZO * MAX_PEZZI) { cache.remove(k); return false; }
      var tag = Math.random().toString(36).slice(2, 8), n = Math.ceil(testo.length / PEZZO), pezzi = {};
      for (var i = 0; i < n; i++) pezzi[k + ':' + tag + ':' + i] = testo.slice(i * PEZZO, (i + 1) * PEZZO);
      cache.putAll(pezzi, 21600);
      cache.put(k, JSON.stringify({ tag: tag, n: n, len: testo.length }), 21600);
      return true;
    } catch (e) { try { cache.remove(k); } catch (x) { /* solo una comodità */ } return false; }
  }

  // --- Scritture rimandate -------------------------------------------------------
  // Alcuni file sono ricostruibili da altri (l'elenco dei bambini, l'indice delle versioni di
  // ciascuno): durante il lavoro si tengono aggiornati nella cache, e su Drive si scrivono al
  // massimo ogni RITARDO_MS (o dal risveglio periodico). Nelle proprieta' dello script resta
  // scritto quali file hanno su Drive una copia indietro: se la cache li perde, il custode non
  // si fida di Drive e li ricostruisce. Anche le versioni superate da eliminare aspettano il
  // risveglio. Si scrive sempre dentro il lucchetto delle scritture.
  var RITARDO_MS = 10 * 60000, MAX_PROP = 7000, MAX_DA_ELIMINARE = 30;
  var rinv = null;
  function rinvCarica() {
    if (rinv) return rinv;
    try { rinv = JSON.parse(PROP.getProperty('RINVIATI') || 'null'); } catch (e) { rinv = null; }
    if (!rinv || typeof rinv !== 'object') rinv = {};
    if (!rinv.s || typeof rinv.s !== 'object') rinv.s = {};
    if (!Array.isArray(rinv.d)) rinv.d = [];
    return rinv;
  }
  function rinvSalva() {
    var r = rinvCarica();
    if (!Object.keys(r.s).length && !r.d.length) PROP.deleteProperty('RINVIATI');
    else PROP.setProperty('RINVIATI', JSON.stringify(r));
  }
  function inRitardo(p) { return !!rinvCarica().s[p]; }
  function leggiNonRinviato(p) {
    var testo = testoDaDrive(p);
    return testo == null ? null : JSON.parse(testo);
  }

  // Una copia letta da Drive entra in cache solo se nessuno può scrivere intanto:
  // dentro il lucchetto delle scritture, o prendendolo se è libero. Altrimenti una
  // lettura lenta potrebbe rimettere in cache la versione vecchia di un file
  // appena salvato da un'altra persona.
  var inLock = false;
  function testoDrive(p) { var f = file(p); return f ? D(function () { return f.getBlob().getDataAsString('UTF-8'); }) : null; }
  function testoDaDrive(p) {
    if (inRitardo(p)) return testoDrive(p);   // copia indietro: non va in cache
    if (inLock || !daTenere(p)) { var t = testoDrive(p); if (inLock) inCache(p, t); return t; }
    var lock = LockService.getScriptLock();
    if (lock.tryLock(0)) {
      try { var t2 = testoDrive(p); inCache(p, t2); return t2; } finally { lock.releaseLock(); }
    }
    return testoDrive(p);
  }

  // nuovo: il file non esiste ancora (una versione precedente col suo numero): niente ricerca per nome
  function scriviTesto(percorso, contenuto, mime, nuovo) {
    var f = (nuovo && !cache.get(chiaveF(percorso))) ? null : file(percorso);
    if (f) {
      D(function () { return f.setContent(contenuto); });
      inCache(percorso, contenuto);
      return;
    }
    var parti = percorso.split('/');
    var nome = parti.pop();
    var dir = cartella(parti.join('/'), true);
    var nuovoF = D(function () { return dir.createFile(nome, contenuto, mime); });
    cache.put(chiaveF(percorso), nuovoF.getId(), 21600);
    memoria['f:' + percorso] = nuovoF;
    inCache(percorso, contenuto);
  }

  // Elimina davvero (nel cestino di Drive: recuperabile per 30 giorni)
  function eliminaSubito(percorso) {
    var f = file(percorso);
    if (!f) return;
    D(function () { return f.setTrashed(true); });
    cache.remove(chiaveF(percorso));
    memoria['f:' + percorso] = null;
    inCache(percorso, null);
  }

  return {
    leggiJSON: function (percorso) {
      var c = daCache(percorso);
      if (c !== undefined) return c === null ? null : JSON.parse(c);
      return leggiNonRinviato(percorso);
    },
    // Come leggiJSON, ma `undefined` se la copia su Drive e' indietro e la cache l'ha persa
    leggiAggiornato: function (percorso) {
      var c = daCache(percorso);
      if (c !== undefined) return c === null ? null : JSON.parse(c);
      if (inRitardo(percorso)) return undefined;
      return leggiNonRinviato(percorso);
    },
    scriviJSON: function (percorso, oggetto, opz) {
      var testo = JSON.stringify(oggetto);
      if (opz && opz.rinvia && daTenere(percorso) && testo.length <= PEZZO * MAX_PEZZI) {
        var r = rinvCarica(), da = r.s[percorso], adesso = Date.now();
        // la copia su Drive e' indietro da meno di RITARDO_MS: si aggiorna solo la cache
        if (!(da && adesso - da > RITARDO_MS)) {
          var primaVolta = !da;
          var spazio = JSON.stringify(r).length < MAX_PROP;
          if (!primaVolta || spazio) {
            if (primaVolta) { r.s[percorso] = adesso; rinvSalva(); }
            if (inCache(percorso, testo)) return;
          }
        }
      }
      scriviTesto(percorso, testo, 'application/json', opz && opz.nuovo);
      if (inRitardo(percorso)) { delete rinvCarica().s[percorso]; rinvSalva(); }
    },
    elenca: function (percorso) {
      var dir = cartella(percorso, false);
      var out = { file: [], cartelle: [] };
      if (!dir) return out;
      var fi = D(function () { return dir.getFiles(); });
      while (D(function () { return fi.hasNext(); })) { var f = D(function () { return fi.next(); }); if (!D(function () { return f.isTrashed(); })) out.file.push(D(function () { return f.getName(); })); }
      var di = D(function () { return dir.getFolders(); });
      while (D(function () { return di.hasNext(); })) { var d = D(function () { return di.next(); }); if (!D(function () { return d.isTrashed(); })) out.cartelle.push(D(function () { return d.getName(); })); }
      return out;
    },
    leggiBinario: function (percorso) {
      var f = file(percorso);
      if (!f) return null;
      var blob = D(function () { return f.getBlob(); });
      return { base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
    },
    scriviBinario: function (percorso, base64, mime) {
      if (file(percorso)) return;   // le immagini sono nominate dal contenuto: se c'e', e' identica
      var parti = percorso.split('/');
      var nome = parti.pop();
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, nome);
      var dir = cartella(parti.join('/'), true);
      var nuovo = D(function () { return dir.createFile(blob); });
      cache.put(chiaveF(percorso), nuovo.getId(), 21600);
      memoria['f:' + percorso] = nuovo;
    },
    esiste: function (percorso) { var c = daCache(percorso); return c !== undefined ? c !== null : !!file(percorso); },
    // Solo i nomi, con una ricerca sola (senza chiedere a Drive file per file se e' nel cestino)
    nomiFile: function (percorso) {
      var dir = cartella(percorso, false);
      var out = [];
      if (!dir) return out;
      var cerca = !!dir.searchFiles;
      var it = D(function () { return cerca ? dir.searchFiles('trashed = false') : dir.getFiles(); });
      while (D(function () { return it.hasNext(); })) { var f = D(function () { return it.next(); }); if (cerca || !D(function () { return f.isTrashed(); })) out.push(D(function () { return f.getName(); })); }
      return out;
    },
    // Nel cestino di Drive, non cancellato per sempre: resta recuperabile per 30 giorni.
    // Con `rinvia` (versioni superate) la cancellazione aspetta il risveglio periodico.
    elimina: function (percorso, opz) {
      if (opz && opz.rinvia) {
        var r = rinvCarica();
        if (r.d.indexOf(percorso) >= 0) { memoria['f:' + percorso] = null; return; }
        if (r.d.length < MAX_DA_ELIMINARE && JSON.stringify(r).length < MAX_PROP) {
          r.d.push(percorso); rinvSalva();
          memoria['f:' + percorso] = null;
          return;
        }
      }
      eliminaSubito(percorso);
    },
    // --- per smaltisci() del custode: il risveglio periodico e svuotaCache ---
    rinviate: function () { return Object.keys(rinvCarica().s); },
    // scrive su Drive la copia in cache di un file rimandato; false se la cache l'ha persa
    scarica: function (percorso) {
      var c = daCache(percorso);
      if (c === undefined || c === null) return false;
      scriviTesto(percorso, c, 'application/json');
      delete rinvCarica().s[percorso]; rinvSalva();
      return true;
    },
    dimentica: function (percorso) { delete rinvCarica().s[percorso]; rinvSalva(); },
    eliminaRinviati: function () {
      var r = rinvCarica(), fatte = 0, restano = [];
      r.d.forEach(function (p) {
        try { memoria['f:' + p] = undefined; eliminaSubito(p); fatte++; } catch (e) { restano.push(p); }
      });
      if (fatte || restano.length !== r.d.length) { r.d = restano; rinvSalva(); }
      return fatte;
    },
    misure: function () { return { cache: _mCache, drive: _nDrive }; },
    azzeraMisure: function () { _mCache = 0; _nDrive = 0; },
    // Come conLock ma senza aspettare: se qualcuno sta scrivendo, non fa niente
    provaLock: function (fn) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(0)) return false;
      var prima = inLock;
      inLock = true;
      try { fn(); return true; } finally { inLock = prima; lock.releaseLock(); }
    },
    conLock: function (fn) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) {
        var e = new Error('Il custode e\' occupato: riprova tra qualche secondo.');
        e.occupato = true;
        throw e;
      }
      inLock = true;
      try { return fn(); } finally { inLock = false; lock.releaseLock(); }
    },
  };
}

// ---------------------------------------------------------------------------
// Da eseguire a mano dall'editor
// ---------------------------------------------------------------------------

/** Prepara le cartelle nel Drive condiviso e verifica la configurazione. */
function configura() {
  var radiceId = PROP.getProperty('CARTELLA_RADICE');
  var clientId = PROP.getProperty('GOOGLE_CLIENT_ID');
  if (!radiceId) throw new Error('Imposta la proprieta\' CARTELLA_RADICE (id della cartella nel Drive condiviso).');
  if (!clientId) throw new Error('Imposta la proprieta\' GOOGLE_CLIENT_ID (dalla console Google Cloud).');
  var radice = DriveApp.getFolderById(radiceId);
  ['_config', 'Pazienti', 'Materiali', 'Materiali/set', 'Materiali/immagini'].forEach(function (p) {
    var dir = radice;
    p.split('/').forEach(function (nome) {
      var it = dir.getFoldersByName(nome);
      dir = it.hasNext() ? it.next() : dir.createFolder(nome);
    });
  });
  var proprietario = proprietario_();
  Logger.log('Cartella radice: ' + radice.getName());
  Logger.log('Proprietario (sempre admin): ' + proprietario);
  Logger.log('Client ID: ' + clientId);
  Logger.log('Client ID desktop: ' + (PROP.getProperty('GOOGLE_CLIENT_ID_DESKTOP') || '(nessuno: accesso solo dal browser)'));
  Logger.log('Pronto. Ora: Distribuisci > Nuova distribuzione > App web.');
}

/** Ricostruisce l'elenco dei pazienti dai loro file. */
function ricostruisciCache() {
  svuotaCache();
  _custode = null;
  var n = custode_().ricostruisci();
  Logger.log('Cache ricostruite per ' + n + ' pazienti.');
}

/**
 * Facoltativo, per un custode più pronto. Apps Script, quando nessuno lo usa
 * per un po', alla prima richiesta impiega qualche secondo a ripartire: un
 * risveglio ogni 10 minuti nelle ore di lavoro lo tiene pronto e rinfresca la
 * cache dei file di configurazione. Esegui una volta `attivaRisveglio` dall'editor
 * (chiede il permesso di creare un attivatore); `disattivaRisveglio` lo toglie.
 */
function attivaRisveglio() {
  disattivaRisveglio();
  ScriptApp.newTrigger('risveglio').timeBased().everyMinutes(10).create();
  Logger.log('Risveglio attivo: ogni 10 minuti, dalle 7 alle 21.');
}
function disattivaRisveglio() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'risveglio') ScriptApp.deleteTrigger(t); });
}
function risveglio() {
  var ora = Number(Utilities.formatDate(new Date(), 'Europe/Rome', 'H'));
  if (ora < 7 || ora >= 21) return;
  // prima quello che i salvataggi hanno rimandato (elenco, indici delle versioni, versioni da eliminare)
  try { custode_().smaltisci(); } catch (e) { /* al prossimo giro */ }
  var a = archivioDrive_();
  ['_config/accessi.json', '_config/cifratura.json', '_config/dispositivi.json', 'Pazienti/_elenco.json', 'Materiali/indice.json', '_config/modalita.json']
    .forEach(function (p) { try { a.leggiJSON(p); } catch (e) { /* al prossimo giro */ } });
  // accessi scaduti: le chiavi dei loro dispositivi si revocano (scrive solo se ce n'è)
  try { custode_().revocaScaduti(); } catch (e) { /* al prossimo giro */ }
  // la corsia rapida dello stato (se la cache e' scaduta si rinnova la revisione)
  try { custode_().scalda(); } catch (e) { /* al prossimo giro */ }
}

// Dopo una modifica fatta a mano sui file in Drive (da evitare: es. un file
// ripristinato da una versione precedente) il custode continuerebbe a usare la
// copia in cache per qualche ora. svuotaCache, eseguita dall'editor, la fa
// rileggere tutta da Drive.
var _generazione = null;
function generazioneCache_() {
  if (_generazione == null) _generazione = PropertiesService.getScriptProperties().getProperty('GENERAZIONE_CACHE') || '0';
  return _generazione;
}
function svuotaCache() {
  // quello che i salvataggi hanno rimandato va su Drive prima di dimenticare la cache
  try { custode_().smaltisci(); } catch (e) { /* si ricostruira' dai file dei bambini */ }
  // anche le risposte dello stato del centro: senza revisione, nessuna vale piu'
  try { CacheService.getScriptCache().remove(QT.CHIAVE_STATO_REV); } catch (e) { /* scade da sola entro 6 ore */ }
  _generazione = Date.now().toString(36);
  PropertiesService.getScriptProperties().setProperty('GENERAZIONE_CACHE', _generazione);
  Logger.log('Cache svuotata: il custode rilegge tutto da Drive.');
}

// ============================================================================
// Logica del custode (custode/core.js)
// ============================================================================

/**
 * Quaderno TICE — logica del custode.
 *
 * Questo file NON usa nessun servizio Google: riceve dall'esterno un "ambiente"
 * (archivio, verifica del token, orologio) e decide tutto il resto. Cosi' la
 * stessa identica logica gira:
 *   - su Google Apps Script (Code.gs le passa Drive, LockService, UrlFetch);
 *   - in locale con tools/custode-mock.js, dove viene testata.
 *
 * Qui dentro stanno le regole che contano per la sicurezza: chi e'
 * autorizzato, a quali pazienti, cosa puo' fare. L'app mostra; decide il custode.
 *
 * I dati dei pazienti arrivano GIA' CIFRATI dall'app (AES-256-GCM, con la
 * chiave del centro che il custode non conosce): qui si vedono solo buste
 * opache con qualche metadato (identificativo, versione, chi e quando ha
 * salvato). Chi apre il Drive, compresi gli amministratori del dominio, vede
 * solo quelle. Per ogni paziente il custode tiene anche le versioni precedenti.
 *
 * Tutto e' sincrono di proposito: in Apps Script lo sono anche Drive e UrlFetch.
 */
var QT = (function () {
  'use strict';

  var SCHEMA = 2;

  // Chi puo' fare cosa. E' l'unico posto da cambiare per modificare i ruoli.
  // "programmi" e "importa" sono rispettati dall'app: il custode non legge il
  // contenuto cifrato, quindi controlla chi puo' salvare un paziente, non cosa.
  var PERMESSI = {
    admin: {
      vediTutti: true, registraSedute: true, modificaSeduteAltrui: true,
      programmi: true, creaPazienti: true, importa: true, eliminaPazienti: true,
      pubblicaMateriali: true, eliminaMateriali: true, gestisciAccessi: true,
    },
    professionista: {
      vediTutti: false, registraSedute: true, modificaSeduteAltrui: true,
      programmi: true, creaPazienti: true, importa: true, eliminaPazienti: false,
      pubblicaMateriali: true, eliminaMateriali: false, gestisciAccessi: false,
    },
    tirocinante: {
      vediTutti: false, registraSedute: true, modificaSeduteAltrui: false,
      programmi: false, creaPazienti: false, importa: false, eliminaPazienti: false,
      pubblicaMateriali: false, eliminaMateriali: false, gestisciAccessi: false,
    },
  };
  var RUOLI = Object.keys(PERMESSI);
  var GRADO = { tirocinante: 1, professionista: 2, admin: 3 };

  // Aule: gruppi separati dentro lo stesso centro. Ogni bambino sta in un'aula, ogni
  // persona ha un ruolo in una o più aule e vede (e gestisce, se admin) solo quelle.
  // Solo il proprietario le vede tutte e le crea. Senza aule configurate c'è la sola
  // aula di partenza, che è il centro di prima: niente cambia per chi non le usa.
  var AULA_BASE = 'principale';

  // Versioni precedenti di ogni paziente: le ultime RECENTI, piu' l'ultima di
  // ciascun giorno per GIORNI giorni. Un errore si recupera anche settimane dopo.
  var VERSIONI = { recenti: 20, giorni: 60 };
  // salvataggi della stessa persona entro 30 minuti: una versione precedente sola
  var BOZZE_MS = 30 * 60000;
  // …ed entro 3 minuti non se ne scrive nemmeno una nuova: resta quella di poco prima
  var RAFFICA_MS = 3 * 60000;

  var P = {
    accessi: '_config/accessi.json',
    cifratura: '_config/cifratura.json',
    dispositivi: '_config/dispositivi.json',
    elenco: 'Pazienti/_elenco.json',
    paziente: function (pid) { return 'Pazienti/' + pid + '/paziente.json'; },
    versioni: function (pid) { return 'Pazienti/' + pid + '/versioni'; },
    indiceVersioni: function (pid) { return 'Pazienti/' + pid + '/versioni.json'; },
    versione: function (pid, v) { return 'Pazienti/' + pid + '/versioni/v' + ('00000000' + v).slice(-8) + '.json'; },
    indiceMateriali: 'Materiali/indice.json',
    modalita: '_config/modalita.json',
    turni: function (k, aula) { return aula && aula !== AULA_BASE ? 'Turni/' + aula + '/' + k + '.json' : 'Turni/' + k + '.json'; },
    cartellaImmagini: 'Materiali/immagini',
    set: function (id) { return 'Materiali/set/' + id + '.json'; },
    immagine: function (hash, ext) { return 'Materiali/immagini/' + hash + '.' + ext; },
  };

  var RE = {
    pz: /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/,
    set: /^[A-Za-z0-9_-]{1,80}$/,
    hash: /^[a-f0-9]{64}$/,
    data: /^\d{4}-\d{2}-\d{2}$/,
    email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/,
    kid: /^[a-z0-9-]{1,40}$/,
    aula: /^[a-z0-9][a-z0-9-]{0,39}$/,
    dispositivo: /^[a-z0-9]{8,40}$/,
    b64: /^[A-Za-z0-9+/]*={0,2}$/,
    versione: /^v(\d{8})\.json$/,
    dataUrl: /^data:((?:image\/(?:png|jpeg|webp|gif))|(?:audio\/(?:mpeg|mp4|webm|ogg|wav|x-m4a)));base64,([A-Za-z0-9+/=]+)$/,
  };
  // Tipi ammessi nell'archivio dei materiali. Niente SVG: puo' contenere script.
  var EST = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  };

  // ------------------------------------------------------------------------
  // Errori
  // ------------------------------------------------------------------------
  function Errore(codice, messaggio, extra) {
    this.codice = codice;
    this.message = messaggio || codice;
    this.extra = extra || null;
  }
  function err(codice, messaggio, extra) { return new Errore(codice, messaggio, extra); }

  // ------------------------------------------------------------------------
  // Validazione: whitelist dei campi. L'endpoint e' pubblico, quindi ogni dato
  // che entra nel Drive passa di qui e i campi sconosciuti vengono scartati.
  // ------------------------------------------------------------------------
  function testoV(v, max, obbligatorio, campo) {
    if (v === undefined || v === null || v === '') {
      if (obbligatorio) throw err('richiesta-non-valida', 'Manca ' + campo);
      return obbligatorio ? '' : null;
    }
    if (typeof v !== 'string') throw err('richiesta-non-valida', campo + ' deve essere testo');
    if (v.length > max) throw err('richiesta-non-valida', campo + ' troppo lungo (max ' + max + ')');
    return v;
  }
  function interoV(v, min, max, campo, nullable) {
    if (v === null || v === undefined) {
      if (nullable) return null;
      throw err('richiesta-non-valida', 'Manca ' + campo);
    }
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < min || v > max) {
      throw err('richiesta-non-valida', campo + ' deve essere un intero tra ' + min + ' e ' + max);
    }
    return v;
  }

  function idV(v, re, campo) {
    if (typeof v !== 'string' || !re.test(v)) throw err('richiesta-non-valida', campo + ' non valido');
    return v;
  }
  function dataV(v, campo, nullable) {
    if ((v === null || v === undefined || v === '') && nullable) return null;
    if (typeof v !== 'string' || !RE.data.test(v)) throw err('richiesta-non-valida', campo + ' deve essere AAAA-MM-GG');
    return v;
  }

  function unoTra(v, valori, campo, predefinito) {
    if ((v === undefined || v === null) && predefinito !== undefined) return predefinito;
    if (valori.indexOf(v) < 0) throw err('richiesta-non-valida', campo + ' deve essere uno tra: ' + valori.join(', '));
    return v;
  }
  function listaV(v, max, campo) {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw err('richiesta-non-valida', campo + ' deve essere una lista');
    if (v.length > max) throw err('richiesta-non-valida', campo + ': troppi elementi (max ' + max + ')');
    return v;
  }
  function oggettoV(v, campo) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw err('richiesta-non-valida', campo + ' mancante o non valido');
    return v;
  }

  // Busta cifrata prodotta dall'app: il custode ne controlla solo la forma.
  function bustaV(b, maxCaratteri, campo) {
    oggettoV(b, campo);
    if (b.v !== 1 || b.alg !== 'A256GCM') throw err('richiesta-non-valida', campo + ': formato di cifratura non supportato');
    var kid = idV(b.kid, RE.kid, campo + '.kid');
    var iv = testoV(b.iv, 24, true, campo + '.iv');
    var dati = testoV(b.dati, maxCaratteri, true, campo + '.dati');
    if (!RE.b64.test(iv) || iv.length !== 16) throw err('richiesta-non-valida', campo + '.iv non valido');
    if (!RE.b64.test(dati) || dati.length % 4) throw err('richiesta-non-valida', campo + '.dati non valido');
    return { v: 1, alg: 'A256GCM', kid: kid, iv: iv, comp: unoTra(b.comp, ['gzip', 'no'], campo + '.comp', 'no'), dati: dati };
  }
  var MAX_PAZIENTE = 30 * 1024 * 1024;   // caratteri base64 (~22 MB): anni di sedute
  var MAX_ETICHETTA = 4096;
  var MAX_RISPOSTA = 8 * 1024 * 1024;     // caratteri: oltre, le immagini arrivano in piu' risposte

  // Scritture che l'app puo' ripetere quando la risposta si perde per strada
  // (con Apps Script capita: l'azione e' fatta ma l'app vede un errore).
  // Con lo stesso identificativo di richiesta il custode restituisce la
  // risposta di allora invece di rifare l'azione.
  var RIPETIBILI = {
    'cifratura.imposta': true, 'dispositivo.registra': true, 'dispositivi.abilita': true, 'dispositivo.togli': true,
    'paziente.crea': true, 'paziente.salva': true, 'paziente.archivia': true, 'paziente.condivisione': true,
    'materiali.caricaImmagini': true, 'materiali.pubblica': true, 'materiali.elimina': true, 'accessi.salva': true,
    'modalita.aggiorna': true, 'turni.salva': true, 'paziente.aula': true,
  };
  var RE_RICHIESTA = /^[A-Za-z0-9_-]{8,64}$/;
  var QT_CHIAVE_STATO_REV = 'qt:stato:rev';
  var TTL_STATO = 21600;   // 6 ore: il massimo della cache di Apps Script

  function validaCifratura(c) {
    oggettoV(c, 'cifratura');
    var kdf = oggettoV(c.kdf, 'cifratura.kdf');
    if (kdf.nome !== 'PBKDF2-SHA256') throw err('richiesta-non-valida', 'Derivazione della chiave non supportata');
    var sale = testoV(kdf.sale, 100, true, 'sale');
    if (!RE.b64.test(sale) || sale.length < 22) throw err('richiesta-non-valida', 'sale non valido');
    return {
      schema: SCHEMA,
      kid: idV(c.kid, RE.kid, 'kid'),
      kdf: { nome: 'PBKDF2-SHA256', iterazioni: interoV(kdf.iterazioni, 100000, 5000000, 'iterazioni'), sale: sale },
      verifica: bustaV(c.verifica, 1000, 'verifica'),
      suggerimento: testoV(c.suggerimento, 200, false, 'suggerimento'),
    };
  }

  function validaAccessi(a) {
    oggettoV(a, 'accessi');
    var auleIn = a.aule ? oggettoV(a.aule, 'accessi.aule') : {};
    var aule = {};
    Object.keys(auleIn).forEach(function (id) {
      idV(id, RE.aula, 'aula');
      var x = oggettoV(auleIn[id], 'aula ' + id);
      aule[id] = { nome: testoV(x.nome, 60, true, 'nome dell\'aula') };
    });
    if (Object.keys(aule).length > 50) throw err('richiesta-non-valida', 'Al massimo 50 aule.');
    if (!aule[AULA_BASE]) aule[AULA_BASE] = { nome: (auleIn[AULA_BASE] && auleIn[AULA_BASE].nome) || 'Centro' };
    var utenti = oggettoV(a.utenti || {}, 'accessi.utenti');
    var out = {};
    Object.keys(utenti).forEach(function (email) {
      var e = String(email).trim().toLowerCase();
      if (!RE.email.test(e)) throw err('richiesta-non-valida', 'Email non valida: ' + email);
      var u = oggettoV(utenti[email], 'utente ' + email);
      var pazienti = u.pazienti === '*' ? '*' : listaV(u.pazienti, 1000, 'pazienti').map(function (p) { return idV(p, RE.pz, 'pazienti'); });
      // il ruolo in ogni aula; chi non ne ha (accessi di prima) sta nell'aula di partenza
      var ua = {};
      if (u.aule) {
        var x = oggettoV(u.aule, 'aule di ' + e);
        Object.keys(x).forEach(function (id) {
          idV(id, RE.aula, 'aula');
          if (!aule[id]) throw err('richiesta-non-valida', 'Aula sconosciuta: ' + id);
          ua[id] = unoTra(x[id], RUOLI, 'ruolo in ' + id);
        });
      } else ua[AULA_BASE] = unoTra(u.ruolo, RUOLI, 'ruolo');
      if (!Object.keys(ua).length) throw err('richiesta-non-valida', e + ': serve almeno un\'aula.');
      out[e] = {
        nome: testoV(u.nome, 60, false, 'nome') || e.split('@')[0],
        // il ruolo «più alto», per le app e i custodi di prima che non conoscono le aule
        ruolo: ruoloPiuAlto(ua),
        aule: ua,
        pazienti: pazienti,
        attivo: u.attivo !== false,
        scadenza: dataV(u.scadenza, 'scadenza', true),
      };
    });
    return { schema: SCHEMA, aule: aule, utenti: out };
  }
  function ruoloPiuAlto(ua) {
    return Object.keys(ua).reduce(function (m, k) { return !m || GRADO[ua[k]] > GRADO[m] ? ua[k] : m; }, null) || 'tirocinante';
  }
  // Le aule di una persona negli accessi salvati (quelli di prima: l'aula di partenza col ruolo unico)
  function auleDiVoce(v) {
    if (v && v.aule && typeof v.aule === 'object') return v.aule;
    var o = {}; o[AULA_BASE] = (v && v.ruolo) || 'tirocinante'; return o;
  }
  function auleDelCentro(accessi) {
    var a = (accessi && accessi.aule) || {};
    if (!a[AULA_BASE]) { a = JSON.parse(JSON.stringify(a)); a[AULA_BASE] = { nome: 'Centro' }; }
    return a;
  }

  function validaSet(s) {
    oggettoV(s, 'set');
    var id = idV(s.id, RE.set, 'set.id');
    var items = listaV(s.items, 2000, 'set.items').map(function (it, i) {
      oggettoV(it, 'items[' + i + ']');
      return it;
    });
    // Immagini e audio viaggiano per riferimento (img:<hash>), mai incorporati:
    // si controlla ogni stringa, anche annidata (variantUrls, maschere, audio...).
    (function visita(v, percorso) {
      if (typeof v === 'string') {
        if (v.indexOf('data:') === 0) {
          throw err('richiesta-non-valida', percorso + ': immagini e audio vanno caricati a parte e riferiti come img:<hash>');
        }
      } else if (Array.isArray(v)) v.forEach(function (x, j) { visita(x, percorso + '[' + j + ']'); });
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { visita(v[k], percorso + '.' + k); });
    })(s, 'set');
    var testo = JSON.stringify(s);
    if (testo.length > 2 * 1024 * 1024) throw err('richiesta-non-valida', 'Set troppo grande');
    var o = JSON.parse(testo);
    o.id = id;
    o.items = items;
    return o;
  }

  // Riferimenti img:<hash> dentro un set (in qualunque campo, anche annidato)
  function hashRiferiti(obj) {
    var trovati = {};
    (function visita(v) {
      if (typeof v === 'string') {
        var m = /^img:([a-f0-9]{64})(?:\.([a-z0-9]+))?$/.exec(v);
        if (m) trovati[m[1]] = true;
      } else if (Array.isArray(v)) v.forEach(visita);
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { visita(v[k]); });
    })(obj);
    return Object.keys(trovati);
  }

  // JSON con chiavi ordinate: serve a riconoscere un reinvio identico.
  function stabile(v) {
    if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stabile(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  // ------------------------------------------------------------------------
  // Il custode
  // ------------------------------------------------------------------------
  /**
   * amb = {
   *   archivio: { leggiJSON, scriviJSON, elenca, leggiBinario, scriviBinario, esiste, elimina, conLock },
   *   verificaToken(token) -> { email, nome }   (lancia se non valido)
   *   proprietario() -> email dell'account su cui gira il custode
   *   ora() -> ISO string
   *   sha256Hex(base64) -> hex dei byte decodificati
   *   ricordo?: { leggi(chiave) -> testo|null, scrivi(chiave, testo) }   (facoltativo)
   * }
   * archivio.nomiFile?(percorso) -> [nomi]  (facoltativo: elenco veloce dei soli file)
   * Facoltativi, solo per l'archivio su Drive (nel mock non servono: si scrive sempre subito):
   *   scriviJSON(p, o, { nuovo }) e (p, o, { rinvia }), elimina(p, { rinvia }), leggiAggiornato(p),
   *   rinviate(), scarica(p), dimentica(p), eliminaRinviati(), misure(), azzeraMisure()
   */
  function creaCustode(amb) {
    var A0 = amb.archivio;

    // --- Corsia rapida: lo «stato del centro» in cache -------------------------
    // La domanda piu' frequente e' «c'e' qualcosa di nuovo?» (sincronizza.stato).
    // Per rispondere «no» senza aprire alcun file, per ogni persona si tiene in
    // cache la risposta (profilo + impronta dell'elenco) insieme al numero di
    // revisione del centro. Il numero di revisione cambia a OGNI scrittura dei
    // file da cui la risposta dipende (accessi, elenco, chiave, dispositivi):
    //   - prima della scrittura diventa «w» (scrittura in corso: nessuna risposta
    //     dalla cache, e chi legge intanto non salva niente);
    //   - a scrittura finita, ancora dentro il lucchetto, un valore nuovo.
    // Una risposta in cache vale solo se porta la revisione attuale: tutto quello
    // che e' stato scritto dopo di lei la rende inutilizzabile. Se la cache manca
    // o e' scaduta (max 6 ore) si risponde leggendo i file, come sempre.
    // amb.cache = { get(k), put(k, testo, secondi), remove(k), getAll?(chiavi) } (facoltativa).
    var C = amb.cache || null;
    var REV = QT_CHIAVE_STATO_REV;
    var FILE_STATO = {};
    [P.accessi, P.elenco, P.cifratura, P.dispositivi].forEach(function (p) { FILE_STATO[p] = true; });
    var sporco = false, senzaInvalidare = false;
    function cGet(k) { if (!C) return null; try { var v = C.get(k); return v == null ? null : v; } catch (e) { return null; } }
    function cGetAll(chiavi) {
      var out = {};
      if (!C) return out;
      try {
        if (C.getAll) { var m = C.getAll(chiavi) || {}; chiavi.forEach(function (k) { out[k] = m[k] == null ? null : m[k]; }); return out; }
      } catch (e) { /* una alla volta */ }
      chiavi.forEach(function (k) { out[k] = cGet(k); });
      return out;
    }
    function cPut(k, v) { if (!C) return false; try { C.put(k, v, TTL_STATO); return true; } catch (e) { return false; } }
    function nuovaRev() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
    function prima(p) {
      if (!C || !FILE_STATO[p] || senzaInvalidare) return false;
      if (!sporco) {
        sporco = true;
        if (!cPut(REV, 'w')) { try { C.remove(REV); } catch (e) { /* senza revisione non si risponde dalla cache */ } }
      }
      return true;
    }
    function chiudiStato() {
      if (!sporco) return;
      sporco = false;
      if (!cPut(REV, nuovaRev())) { try { C.remove(REV); } catch (e) { /* idem */ } }
    }
    // Ogni scrittura dei file di stato passa di qui (e il lucchetto, chiudendosi, rinnova la revisione).
    // `opz` (facoltativo, lo capisce solo l'archivio su Drive): { nuovo: true } = file che non esiste
    // ancora, niente ricerca per nome; { rinvia: true } = la copia su Drive puo' restare indietro
    // rispetto alla cache per qualche minuto (file ricostruibili: elenco e indice delle versioni).
    var A = {};
    Object.keys(A0).forEach(function (k) { A[k] = A0[k]; });

    // Profilo della richiesta: dove va il tempo (lo restituisce `gestisci` in `fasi`)
    var PROF = null;
    function nomeFile(p) { return String(p).split('/').pop(); }
    function cron(tipo, p, fn) {
      if (!PROF) return fn();
      var t = Date.now();
      try { return fn(); } finally {
        var d = Date.now() - t;
        if (tipo === 'L') { PROF.letture += d; PROF.nLetture++; } else { PROF.scritture += d; PROF.nScritture++; }
        var k = (tipo === 'L' ? 'let ' : 'scr ') + nomeFile(p);
        PROF.file[k] = (PROF.file[k] || 0) + d;
      }
    }
    function chiudiProfilo(ms) {
      var f = PROF; PROF = null;
      var m = (A0.misure && A0.misure()) || {};
      var file = Object.keys(f.file).filter(function (k) { return f.file[k] >= 5; })
        .sort(function (a, b) { return f.file[b] - f.file[a]; }).slice(0, 10)
        .map(function (k) { return k + ':' + f.file[k]; });
      return {
        attesaLock: f.attesaLock, letture: f.letture, scritture: f.scritture, cache: m.cache || 0,
        altro: Math.max(0, ms - f.attesaLock - f.letture - f.scritture),
        nLetture: f.nLetture, nScritture: f.nScritture, nDrive: m.drive || 0, file: file,
      };
    }
    A.leggiJSON = function (p) { return cron('L', p, function () { return A0.leggiJSON(p); }); };
    A.leggiBinario = function (p) { return cron('L', p, function () { return A0.leggiBinario(p); }); };
    A.scriviBinario = function (p, b, m) { return cron('S', p, function () { return A0.scriviBinario(p, b, m); }); };
    A.esiste = function (p) { return cron('L', p, function () { return A0.esiste(p); }); };
    A.elenca = function (p) { return cron('L', p, function () { return A0.elenca(p); }); };
    if (A0.nomiFile) A.nomiFile = function (p) { return cron('L', p, function () { return A0.nomiFile(p); }); };
    A.scriviJSON = function (p, o, opz) {
      var t = prima(p);
      try { return cron('S', p, function () { return A0.scriviJSON(p, o, opz); }); } finally { if (t && !inLock) chiudiStato(); }
    };
    A.elimina = function (p, opz) {
      var t = prima(p);
      try { return cron('S', p, function () { return A0.elimina(p, opz); }); } finally { if (t && !inLock) chiudiStato(); }
    };
    // Un file ricostruibile letto da quello che e' in cache; `undefined` = la copia su Drive puo'
    // essere indietro e la cache l'ha persa: va ricostruito. null = non c'e'.
    function leggiRinviabile(p) {
      if (!A0.leggiAggiornato) return A.leggiJSON(p);
      return cron('L', p, function () { return A0.leggiAggiornato(p); });
    }

    // Lock rientrante: una ricostruzione di cache puo' partire sia da una
    // scrittura (gia' sotto lock) sia da una lettura (no). Tutte le scritture
    // passano di qui, cosi' non si sovrappongono mai.
    var inLock = false;
    function conLock(fn) {
      if (inLock) return fn();
      var tLock = Date.now();
      return A0.conLock(function () {
        if (PROF) PROF.attesaLock += Date.now() - tLock;
        inLock = true; sporco = false;
        try { return fn(); } finally { inLock = false; chiudiStato(); }
      });
    }
    // Revisione assente (cache scaduta o svuotata) o rimasta «w» per un'esecuzione
    // interrotta: la si rinnova, ma solo avendo il lucchetto (nessuno sta scrivendo).
    function ripristinaRev() {
      if (!C) return;
      var r = cGet(REV);
      if (r && r !== 'w') return;
      var rinnova = function () { var r2 = cGet(REV); if (!r2 || r2 === 'w') cPut(REV, nuovaRev()); };
      try {
        if (inLock) rinnova();
        else if (A0.provaLock) A0.provaLock(rinnova);
        else A0.conLock(rinnova);
      } catch (e) { /* al prossimo giro */ }
    }

    function oggi() { return amb.ora().slice(0, 10); }

    function leggiAccessi() {
      return A.leggiJSON(P.accessi) || { schema: SCHEMA, version: 0, utenti: {} };
    }

    function utenteDa(identita) {
      var email = String(identita.email || '').toLowerCase();
      var proprietario = String(amb.proprietario() || '').toLowerCase();
      var accessi = leggiAccessi();
      var voce = accessi.utenti[email];
      if (email && email === proprietario) {
        // Chi ospita il custode e' sempre admin: il primo accesso non richiede
        // configurazioni a mano e nessuno puo' chiuderlo fuori per errore.
        var tutte = {};
        Object.keys(auleDelCentro(accessi)).forEach(function (id) { tutte[id] = 'admin'; });
        // La voce (se c'e') serve SOLO per il nome: ruolo, aule, stato e scadenza non contano.
        var nomeProp = (voce && typeof voce.nome === 'string' && voce.nome.trim()) || identita.nome || email;
        return { email: email, nome: nomeProp, ruolo: 'admin', aule: tutte, pazienti: '*', proprietario: true, scadenza: null };
      }
      if (!voce) throw err('non-autorizzato', 'L\'account ' + email + ' non è abilitato. Chiedi a un amministratore di aggiungerti.');
      if (voce.attivo === false) { revocaSeServe(email); throw err('disattivato', 'L\'account ' + email + ' è stato disattivato.'); }
      if (voce.scadenza && oggi() > voce.scadenza) { revocaSeServe(email); throw err('scaduto', 'L\'accesso di ' + email + ' è scaduto il ' + voce.scadenza + '.'); }
      var esistenti = auleDelCentro(accessi), mie = {};
      var va = auleDiVoce(voce);
      Object.keys(va).forEach(function (id) { if (esistenti[id] && PERMESSI[va[id]]) mie[id] = va[id]; });
      return { email: email, nome: voce.nome || identita.nome || email, ruolo: ruoloPiuAlto(mie), aule: mie, pazienti: voce.pazienti, proprietario: false, scadenza: voce.scadenza || null };
    }

    // Revoca della chiave: chi non è più abilitato (scaduto, disattivato) perde
    // la busta con la chiave del centro su tutti i suoi dispositivi. Se torna
    // abilitato, un admin gliela riconsegna in automatico come a un nuovo dispositivo.
    function revocaChiavi() {
      var disp = leggiDispositivi(), n = 0;
      Object.keys(disp.dispositivi).forEach(function (id) {
        var r = disp.dispositivi[id];
        if (r.chiavi && Object.keys(r.chiavi).length && !abilitato(r.email)) {
          r.chiavi = {}; r.revocatoIl = amb.ora(); delete r.abilitatoDa; delete r.abilitatoIl; n++;
        }
      });
      if (n) A.scriviJSON(P.dispositivi, disp);
      return n;
    }
    function revocaSeServe(email) {
      var dd = leggiDispositivi().dispositivi;
      var ha = Object.keys(dd).some(function (id) { return dd[id].email === email && dd[id].chiavi && Object.keys(dd[id].chiavi).length; });
      if (!ha) return;
      try { conLock(revocaChiavi); } catch (e) { /* al prossimo tentativo, o al risveglio */ }
    }

    // Il ruolo conta aula per aula: si è admin di un'aula, non del centro (tranne il proprietario).
    function ruoloIn(u, aula) { return u.proprietario ? 'admin' : ((u.aule || {})[aula] || null); }
    function permessiIn(u, aula) { var r = ruoloIn(u, aula); return r ? PERMESSI[r] : null; }
    function puoIn(u, aula, cosa) {
      var x = permessiIn(u, aula);
      if (!x) throw err('vietato', 'Non fai parte di quest\'aula.');
      if (!x[cosa]) throw err('vietato', 'Il tuo ruolo in quest\'aula (' + ruoloIn(u, aula) + ') non consente questa operazione.');
    }
    // Le aule in cui la persona può fare una cosa
    function auleCon(u, cosa) { return Object.keys(u.aule || {}).filter(function (a) { var x = permessiIn(u, a); return x && x[cosa]; }); }
    // Per le cose comuni a tutto il centro (materiali, modalità): basta poterlo fare in un'aula
    function permessi(u) {
      var out = {};
      Object.keys(PERMESSI.admin).forEach(function (k) { out[k] = auleCon(u, k).length > 0; });
      return out;
    }
    function puo(u, cosa) {
      if (!permessi(u)[cosa]) throw err('vietato', 'Il tuo ruolo (' + u.ruolo + ') non consente questa operazione.');
    }
    function soloProprietario(u) { if (!u.proprietario) throw err('vietato', 'Solo il proprietario del custode può farlo.'); }
    // Chi condivide un'aula (amministrata da u, se `admin`) con la persona di quell'email
    function inMieAule(u, voce, admin) {
      if (u.proprietario) return true;
      var va = auleDiVoce(voce);
      return Object.keys(va).some(function (a) { return admin ? auleCon(u, 'gestisciAccessi').indexOf(a) >= 0 : !!ruoloIn(u, a); });
    }
    // Un bambino «non dell'aula» (riservato) lo vedono solo chi l'ha creato e le persone
    // con cui è condiviso: nemmeno gli amministratori o chi vede tutti gli altri.
    // In ogni caso solo chi fa parte dell'aula del bambino.
    var elencoRichiesta = null;   // l'elenco letto una volta per richiesta
    function voceDi(pid) {
      if (!elencoRichiesta) elencoRichiesta = leggiElenco();
      return elencoRichiesta.pazienti[pid] || null;
    }
    function aulaDi(pid) { var v = voceDi(pid); return (v && v.aula) || AULA_BASE; }
    function vedeRiservato(u, v) {
      return v.creatoDa === u.email || (Array.isArray(v.condivisi) && v.condivisi.indexOf(u.email) >= 0);
    }
    function vede(u, pid) {
      var v = voceDi(pid);
      var x = permessiIn(u, (v && v.aula) || AULA_BASE);
      if (!x) return false;
      if (v && v.riservato) return vedeRiservato(u, v);
      return x.vediTutti || u.pazienti === '*' || (Array.isArray(u.pazienti) && u.pazienti.indexOf(pid) >= 0);
    }
    function richiediVisibile(u, pid) {
      if (!vede(u, pid)) throw err('vietato', 'Non sei assegnato a questo paziente.');
    }

    // --- Pazienti ---------------------------------------------------------------
    // Un file per paziente: { id, version, busta, etichetta, creato..., aggiornato... }.
    // L'elenco e' una cache ricostruibile dai file dei pazienti.
    function leggiRecord(pid) {
      var r = A.leggiJSON(P.paziente(pid));
      if (!r) throw err('non-trovato', 'Paziente non trovato.');
      return r;
    }
    function voceElenco(r) {
      var v = {
        id: r.id, version: r.version, etichetta: r.etichetta,
        aggiornato: r.aggiornato, aggiornatoDa: r.aggiornatoDa, eliminato: !!r.eliminato,
      };
      if (r.riservato) { v.riservato = true; v.creatoDa = r.creatoDa; v.condivisi = r.condivisi || []; }
      v.aula = r.aula || AULA_BASE;
      return v;
    }
    function leggiElenco() {
      var e = leggiRinviabile(P.elenco);
      return e || conLock(ricostruisciElenco);
    }
    function ricostruisciElenco() {
      var elenco = { schema: SCHEMA, pazienti: {} };
      A.elenca('Pazienti').cartelle.forEach(function (pid) {
        if (!RE.pz.test(pid)) return;
        var r = A.leggiJSON(P.paziente(pid));
        if (r) elenco.pazienti[pid] = voceElenco(r);
      });
      A.scriviJSON(P.elenco, elenco);
      elencoRichiesta = elenco;
      return elenco;
    }
    // Con `rinvia` la copia su Drive puo' restare indietro di qualche minuto: la cache e' sempre aggiornata
    // e, se la cache si perde, l'elenco si ricostruisce dai file dei bambini (che sono sempre scritti subito).
    function aggiornaElenco(r, rinvia) {
      var elenco = leggiElenco();
      elenco.pazienti[r.id] = voceElenco(r);
      A.scriviJSON(P.elenco, elenco, rinvia ? { rinvia: true } : undefined);
      elencoRichiesta = elenco;
    }

    // Le versioni precedenti di un paziente hanno un piccolo indice (numero, quando,
    // chi): per elencarle e potarle non si rileggono più i file uno per uno.
    function leggiIndiceVersioni(pid) {
      var x = leggiRinviabile(P.indiceVersioni(pid));
      if (x && Array.isArray(x.versioni)) return x;
      // la prima volta, o dopo che la cache ha perso un indice non ancora scritto su Drive: dalle
      // versioni già nella cartella (lette una volta sola)
      var costruisci = function () {
        var idx = { schema: SCHEMA, versioni: elencoVersioni(pid).map(function (v) {
          var r = A.leggiJSON(P.versioni(pid) + '/' + v.nome) || {};
          return { v: v.version, il: r.aggiornato || null, da: r.aggiornatoDa || null };
        }) };
        if (x === undefined) A.scriviJSON(P.indiceVersioni(pid), idx);
        return idx;
      };
      return x === undefined ? conLock(costruisci) : costruisci();
    }
    // Prima di sovrascrivere, la versione attuale va nelle versioni precedenti.
    // Più salvataggi della stessa persona a pochi minuti l'uno dall'altro (si sta
    // lavorando al programma) sono una versione sola: se ne tiene l'ultima.
    // L'indice e l'eliminazione delle versioni superate si possono rimandare di qualche minuto
    // (rinvia): il file del bambino e la nuova versione sono scritti subito.
    function archiviaVersione(r) {
      var idx = leggiIndiceVersioni(r.id), l = idx.versioni, prec = l[0];
      var voce = { v: r.version, il: r.aggiornato || null, da: r.aggiornatoDa || null };
      var RINVIA = { rinvia: true };
      // Salvataggi a raffica della stessa persona (si sta ritoccando il programma): la versione
      // precedente di pochi minuti fa basta, non si scrive niente su Drive oltre al paziente
      if (prec && prec.v !== voce.v && prec.da && prec.da === voce.da && prec.il && voce.il &&
          Math.abs(Date.parse(voce.il) - Date.parse(prec.il)) < RAFFICA_MS) {
        // le versioni troppo vecchie si potano comunque (l'indice si riscrive solo se ne è uscita qualcuna)
        var quante = l.length;
        potaVersioni(r.id, idx);
        if (idx.versioni.length !== quante) A.scriviJSON(P.indiceVersioni(r.id), idx, RINVIA);
        return;
      }
      A.scriviJSON(P.versione(r.id, r.version), r, { nuovo: true });
      if (prec && prec.v !== voce.v && prec.da && prec.da === voce.da && prec.il && voce.il &&
          Math.abs(Date.parse(voce.il) - Date.parse(prec.il)) < BOZZE_MS) {
        A.elimina(P.versione(r.id, prec.v), RINVIA);
        l[0] = voce;
      } else if (!prec || prec.v !== voce.v) l.unshift(voce);
      potaVersioni(r.id, idx);
      A.scriviJSON(P.indiceVersioni(r.id), idx, RINVIA);
    }
    function elencoVersioni(pid) {
      return A.elenca(P.versioni(pid)).file
        .map(function (nome) { var m = RE.versione.exec(nome); return m ? { nome: nome, version: parseInt(m[1], 10) } : null; })
        .filter(Boolean)
        .sort(function (a, b) { return b.version - a.version; });
    }
    function potaVersioni(pid, idx) {
      var tutte = idx.versioni;
      if (tutte.length <= VERSIONI.recenti) return;
      var limite = new Date(Date.parse(amb.ora()) - VERSIONI.giorni * 86400000).toISOString().slice(0, 10);
      var giorniVisti = {}, tenute = [];
      tutte.forEach(function (x, i) {
        if (i < VERSIONI.recenti) { tenute.push(x); return; }
        var giorno = x.il ? x.il.slice(0, 10) : '';
        // si tiene la piu' recente di ogni giorno (le versioni sono in ordine decrescente)
        if (giorno && giorno >= limite && !giorniVisti[giorno]) { giorniVisti[giorno] = true; tenute.push(x); return; }
        A.elimina(P.versione(pid, x.v), { rinvia: true });
      });
      idx.versioni = tenute;
    }

    // --- Azioni ---------------------------------------------------------------
    var azioni = {};

    azioni['io'] = function (u) {
      var c = A.leggiJSON(P.cifratura);
      // agli admin: quanti dispositivi aspettano la chiave (l'app chiede l'elenco solo se serve)
      var inAttesa;
      if (permessi(u).gestisciAccessi && c) {
        inAttesa = 0;
        var dd = leggiDispositivi().dispositivi, acc = leggiAccessi();
        Object.keys(dd).forEach(function (id) { var x = dd[id]; if (!(x.chiavi && x.chiavi[c.kid]) && abilitato(x.email) && dispositivoMio(u, x, acc)) inAttesa++; });
      }
      var nomi = auleDelCentro(leggiAccessi()), aule = {};
      Object.keys(u.aule || {}).forEach(function (a) { aule[a] = { nome: (nomi[a] || {}).nome || a, ruolo: u.aule[a], permessi: PERMESSI[u.aule[a]] }; });
      return {
        email: u.email, nome: u.nome, ruolo: u.ruolo, pazienti: u.pazienti,
        proprietario: u.proprietario, scadenza: u.scadenza, permessi: permessi(u),
        aule: aule, cifratura: !!c, kid: (c || {}).kid || null, cfg: c || null, inAttesa: inAttesa, funzioni: ['riservati', 'aule', 'etichette', 'stato'],
      };
    };

    // La configurazione della chiave non e' segreta: sale e busta di verifica
    // servono a derivare la chiave dalla frase e a controllare che sia giusta.
    azioni['cifratura.leggi'] = function () { return A.leggiJSON(P.cifratura); };

    azioni['cifratura.imposta'] = function (u, d) {
      puo(u, 'gestisciAccessi');
      var c = validaCifratura(d.cifratura);
      return conLock(function () {
        var attuale = A.leggiJSON(P.cifratura);
        if (attuale) {
          // Reinvio identico (rete caduta dopo il salvataggio)
          if (stabile(attuale.verifica) === stabile(c.verifica) && attuale.kid === c.kid) return attuale;
          // Cambio della chiave: solo dichiarando quale si sostituisce. La
          // precedente resta descritta (non la chiave: sale e verifica) per
          // aprire le versioni vecchie con la frase di allora.
          if (!u.proprietario && Object.keys(auleDelCentro(leggiAccessi())).length > 1) soloProprietario(u);
          if (!d.sostituisci || d.kidAttuale !== attuale.kid) {
            throw err('conflitto', 'La chiave del centro esiste già.', { attuale: attuale });
          }
          if (c.kid === attuale.kid || (attuale.precedenti || []).some(function (x) { return x.kid === c.kid; })) {
            throw err('richiesta-non-valida', 'Identificativo della chiave già usato.');
          }
          c.precedenti = [{ kid: attuale.kid, kdf: attuale.kdf, verifica: attuale.verifica, creato: attuale.creato, sostituita: amb.ora() }]
            .concat(attuale.precedenti || []);
          // I dispositivi abilitati con la vecchia chiave la perdono: gli admin la riconsegnano
          var disp = leggiDispositivi();
          Object.keys(disp.dispositivi).forEach(function (id) { disp.dispositivi[id].chiavi = {}; });
          A.scriviJSON(P.dispositivi, disp);
        }
        c.creato = amb.ora();
        c.creatoDa = u.email;
        A.scriviJSON(P.cifratura, c);
        return c;
      });
    };

    function richiediCifratura() {
      var c = A.leggiJSON(P.cifratura);
      if (!c) throw err('senza-chiave', 'Prima un amministratore deve creare la chiave del centro.');
      return c;
    }
    // Dopo un cambio di chiave nessuno salva piu' con quella vecchia
    function richiediChiaveAttuale(cfg) {
      for (var i = 1; i < arguments.length; i++) {
        var b = arguments[i];
        if (b && b.kid !== cfg.kid) throw err('chiave-cambiata', 'La chiave del centro è cambiata: l\'app si aggiorna e riprova.', { kid: cfg.kid });
      }
    }

    // --- Dispositivi ------------------------------------------------------------
    // Ogni dispositivo ha una coppia di chiavi RSA creata nel browser: la parte
    // privata non esce dal dispositivo. Un admin gli consegna la chiave del
    // centro cifrata con la parte pubblica: il dispositivo la usa senza che
    // nessuno la veda. Il custode conserva solo buste che non puo' aprire.
    function leggiDispositivi() {
      return A.leggiJSON(P.dispositivi) || { schema: SCHEMA, dispositivi: {} };
    }
    function abilitato(email) {
      if (email === String(amb.proprietario() || '').toLowerCase()) return true;
      var v = leggiAccessi().utenti[email];
      return !!v && v.attivo !== false && !(v.scadenza && oggi() > v.scadenza);
    }
    // Il dispositivo è di una persona di un'aula che u amministra (o di u stesso)
    function dispositivoMio(u, r, accessi) {
      if (u.proprietario || r.email === u.email) return true;
      var voce = (accessi || leggiAccessi()).utenti[r.email];
      return !!voce && inMieAule(u, voce, true);
    }
    function mioDispositivo(u, id) {
      var disp = leggiDispositivi();
      var r = disp.dispositivi[id];
      if (!r || r.email !== u.email) throw err('non-trovato', 'Dispositivo non registrato.');
      return { disp: disp, r: r };
    }
    function b64V(v, max, campo) {
      var t = testoV(v, max, true, campo);
      if (!RE.b64.test(t) || t.length % 4) throw err('richiesta-non-valida', campo + ' non valido');
      return t;
    }

    azioni['dispositivo.registra'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      var pubblica = b64V(d.pubblica, 2000, 'pubblica');
      var nome = testoV(d.nome, 80, false, 'nome') || 'Dispositivo';
      return conLock(function () {
        var disp = leggiDispositivi();
        var r = disp.dispositivi[id];
        if (r && r.email !== u.email) throw err('conflitto', 'Identificativo di dispositivo già usato.');
        var ora = amb.ora();
        if (!r) r = disp.dispositivi[id] = { email: u.email, creato: ora, chiavi: {} };
        if (r.pubblica !== pubblica) { r.pubblica = pubblica; r.chiavi = {}; }
        r.nome = nome;
        r.ultimoAccesso = ora;
        A.scriviJSON(P.dispositivi, disp);
        return { id: id, abilitato: Object.keys(r.chiavi).length > 0 };
      });
    };

    azioni['dispositivo.chiave'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      var m = mioDispositivo(u, id);
      var cfg = A.leggiJSON(P.cifratura);
      // l'ultimo accesso si aggiorna al massimo una volta l'ora: non si riscrive a ogni sincronizzazione
      if (!m.r.ultimoAccesso || Date.parse(amb.ora()) - Date.parse(m.r.ultimoAccesso) > 3600000) {
        conLock(function () {
          var disp = leggiDispositivi();
          // solo la data dell'ultimo accesso: non cambia niente di quanto la corsia rapida conserva
          senzaInvalidare = true;
          try { if (disp.dispositivi[id]) { disp.dispositivi[id].ultimoAccesso = amb.ora(); A.scriviJSON(P.dispositivi, disp); } }
          finally { senzaInvalidare = false; }
        });
      }
      return { kid: cfg ? cfg.kid : null, chiavi: m.r.chiavi || {} };
    };

    azioni['dispositivi.elenco'] = function (u) {
      puo(u, 'gestisciAccessi');
      var disp = leggiDispositivi(), cfg = A.leggiJSON(P.cifratura), acc = leggiAccessi();
      return Object.keys(disp.dispositivi).filter(function (id) { return dispositivoMio(u, disp.dispositivi[id], acc); }).map(function (id) {
        var r = disp.dispositivi[id];
        return {
          id: id, email: r.email, nome: r.nome, pubblica: r.pubblica, creato: r.creato, ultimoAccesso: r.ultimoAccesso,
          abilitato: !!(cfg && r.chiavi && r.chiavi[cfg.kid]), abilitatoDa: r.abilitatoDa || null, abilitatoIl: r.abilitatoIl || null,
          personaAbilitata: abilitato(r.email),
        };
      });
    };

    azioni['dispositivi.abilita'] = function (u, d) {
      puo(u, 'gestisciAccessi');
      var id = idV(d.id, RE.dispositivo, 'id');
      var kid = idV(d.kid, RE.kid, 'kid');
      var busta = b64V(d.chiave, 2000, 'chiave');
      return conLock(function () {
        var cfg = richiediCifratura();
        if (kid !== cfg.kid) throw err('chiave-cambiata', 'La chiave del centro è cambiata nel frattempo.');
        var disp = leggiDispositivi();
        var r = disp.dispositivi[id];
        if (!r || !dispositivoMio(u, r)) throw err('non-trovato', 'Dispositivo non registrato.');
        if (!abilitato(r.email)) throw err('vietato', 'La persona di questo dispositivo non è abilitata.');
        if (d.pubblica !== r.pubblica) throw err('conflitto', 'Il dispositivo ha cambiato chiavi: riprova.');
        r.chiavi = {};
        r.chiavi[kid] = busta;
        r.abilitatoDa = u.email;
        r.abilitatoIl = amb.ora();
        A.scriviJSON(P.dispositivi, disp);
        return { id: id, abilitato: true };
      });
    };

    azioni['dispositivo.togli'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      return conLock(function () {
        var disp = leggiDispositivi();
        var r = disp.dispositivi[id];
        if (!r) return true;
        if (r.email !== u.email) { puo(u, 'gestisciAccessi'); if (!dispositivoMio(u, r)) throw err('vietato', 'Questo dispositivo non è di una persona delle tue aule.'); }
        delete disp.dispositivi[id];
        A.scriviJSON(P.dispositivi, disp);
        return true;
      });
    };

    azioni['pazienti.elenco'] = function (u) {
      var elenco = leggiElenco();
      return Object.keys(elenco.pazienti)
        .filter(function (pid) { return vede(u, pid); })
        .map(function (pid) { return elenco.pazienti[pid]; });
    };

    // Tutto quello che serve a un giro di sincronizzazione in una richiesta sola: profilo ed
    // elenco dei bambini. Se l'elenco è uguale a quello che l'app ha già (stessa impronta) non
    // viene rimandato: il giro «niente di nuovo» è una risposta di poche righe.
    function impronta(voci) {
      var t = voci.map(function (v) { return [v.id, v.version, v.eliminato ? 1 : 0, v.aula || '', v.riservato ? 1 : 0, v.creatoDa || '', (v.condivisi || []).join(',')].join(':'); }).sort().join('|');
      var h = 5381;
      for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
      return voci.length + '-' + h.toString(36);
    }
    // La revisione letta PRIMA di consultare qualunque file: la risposta si mette in cache
    // solo se, a lavoro finito, e' ancora la stessa (nessuno ha scritto nel frattempo).
    var revInizio = null, identitaStato = null;
    azioni['sincronizza.stato'] = function (u, d) {
      var rev0 = revInizio, idn = identitaStato;
      revInizio = identitaStato = null;
      var voci = azioni['pazienti.elenco'](u), imp = impronta(voci);
      var uguale = typeof d.impronta === 'string' && d.impronta === imp;
      var io = azioni['io'](u);
      if (C && rev0 && rev0 !== 'w' && idn) {
        // l'accesso a tempo scade a mezzanotte: la risposta in cache vale fino al giorno della prima scadenza
        var fino = null, accessi = leggiAccessi();
        Object.keys(accessi.utenti || {}).forEach(function (e) {
          var sc = accessi.utenti[e] && accessi.utenti[e].scadenza;
          if (sc && sc >= oggi() && (!fino || sc < fino)) fino = sc;
        });
        if (cGet(REV) === rev0) {
          var testo = JSON.stringify({ rev: rev0, email: u.email, nomeId: idn.nome || '', prop: String(amb.proprietario() || '').toLowerCase(), fino: fino, io: io, impronta: imp });
          if (testo.length < 90000) cPut(chiaveStato(u.email), testo);
        }
      }
      return { io: io, impronta: imp, elenco: uguale ? null : voci };
    };
    function chiaveStato(email) { return 'qt:stato:u:' + String(email).slice(0, 200); }
    // Il «niente di nuovo» senza aprire un solo file: la persona e' gia' stata riconosciuta
    // (token verificato), il suo accesso, l'elenco e la chiave non sono stati toccati da
    // nessuna scrittura (stessa revisione) e nessuna scadenza e' passata.
    function statoVeloce(identita, richiesta) {
      if (!C) return null;
      var imp = richiesta.dati && richiesta.dati.impronta;
      var email = String(identita.email || '').toLowerCase();
      if (typeof imp !== 'string' || !imp || !email) return null;
      var k = chiaveStato(email), v = cGetAll([REV, k]), rev = v[REV];
      if (!rev || rev === 'w' || !v[k]) return null;
      var e;
      try { e = JSON.parse(v[k]); } catch (x) { return null; }
      if (!e || e.rev !== rev || e.email !== email || e.impronta !== imp || e.nomeId !== (identita.nome || '')) return null;
      if (e.prop !== String(amb.proprietario() || '').toLowerCase()) return null;
      if (e.fino && oggi() > e.fino) return null;
      return { io: e.io, impronta: e.impronta, elenco: null };
    }

    azioni['paziente.leggi'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      return leggiRecord(pid);
    };

    // Più bambini in una richiesta (la prima sincronizzazione di un dispositivo):
    // si fermano prima di superare la dimensione massima della risposta, e quelli
    // rimasti fuori l'app li richiede subito dopo.
    azioni['pazienti.leggi'] = function (u, d) {
      var ids = listaV(d.ids, 100, 'ids').map(function (x) { return idV(x, RE.pz, 'ids'); });
      var out = [], peso = 0;
      for (var i = 0; i < ids.length; i++) {
        if (!vede(u, ids[i])) continue;
        var r = A.leggiJSON(P.paziente(ids[i]));
        if (!r) continue;
        var n = JSON.stringify(r).length;
        if (out.length && peso + n > MAX_RISPOSTA) break;
        out.push(r); peso += n;
      }
      return out;
    };

    azioni['paziente.crea'] = function (u, d) {
      var aula = d.aula ? idV(d.aula, RE.aula, 'aula') : (auleCon(u, 'creaPazienti').indexOf(AULA_BASE) >= 0 ? AULA_BASE : auleCon(u, 'creaPazienti')[0]);
      if (!aula) throw err('vietato', 'Il tuo ruolo non consente di creare bambini.');
      puoIn(u, aula, 'creaPazienti');
      var cfg = richiediCifratura();
      var pid = idV(d.id, RE.pz, 'id');
      var busta = bustaV(d.busta, MAX_PAZIENTE, 'busta');
      var etichetta = bustaV(d.etichetta, MAX_ETICHETTA, 'etichetta');
      richiediChiaveAttuale(cfg, busta, etichetta);
      return conLock(function () {
        var esistente = A.leggiJSON(P.paziente(pid));
        if (esistente) {
          // Reinvio della stessa creazione (rete caduta dopo il salvataggio)
          if (esistente.creatoDa === u.email && esistente.version === 1 && stabile(esistente.busta) === stabile(busta)) return esistente;
          throw err('conflitto', 'Esiste già un paziente con questo identificativo.', { attuale: vede(u, pid) ? esistente : null });
        }
        var ora = amb.ora();
        var r = { schema: SCHEMA, id: pid, version: 1, busta: busta, etichetta: etichetta,
          creato: ora, creatoDa: u.email, aggiornato: ora, aggiornatoDa: u.email };
        if (aula !== AULA_BASE) r.aula = aula;
        if (d.riservato === true) { r.riservato = true; r.condivisi = []; }
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r, true);
        if (!r.riservato) assegnaSeServe(u, pid);
        return r;
      });
    };

    // Chi crea un paziente senza vederli tutti se lo ritrova assegnato.
    function assegnaSeServe(u, pid) {
      if (vede(u, pid) || u.proprietario) return;
      var accessi = leggiAccessi();
      var voce = accessi.utenti[u.email];
      if (!voce || voce.pazienti === '*') return;
      voce.pazienti = (voce.pazienti || []).concat([pid]);
      accessi.version = (accessi.version || 0) + 1;
      accessi.aggiornato = amb.ora();
      accessi.aggiornatoDa = u.email;
      A.scriviJSON(P.accessi, accessi);
      u.pazienti = voce.pazienti;
    }

    // Salvataggio con controllo di versione: se nel frattempo un altro
    // dispositivo ha salvato, risponde "conflitto" con la versione attuale e
    // l'app unisce le due (lei puo' leggerle, il custode no) e riprova.
    azioni['paziente.salva'] = function (u, d) {
      var cfg = richiediCifratura();
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      puoIn(u, aulaDi(pid), 'registraSedute');
      var busta = bustaV(d.busta, MAX_PAZIENTE, 'busta');
      var etichetta = d.etichetta ? bustaV(d.etichetta, MAX_ETICHETTA, 'etichetta') : null;
      richiediChiaveAttuale(cfg, busta, etichetta);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var attuale = leggiRecord(pid);
        if (attuale.version !== base) {
          throw err('conflitto', 'Nel frattempo qualcun altro ha modificato questo paziente.', { attuale: attuale });
        }
        if (attuale.eliminato && !(permessiIn(u, attuale.aula || AULA_BASE) || {}).eliminaPazienti) throw err('vietato', 'Questo paziente è stato archiviato.');
        archiviaVersione(attuale);
        var ora = amb.ora();
        var r = { schema: SCHEMA, id: pid, version: attuale.version + 1, busta: busta, etichetta: etichetta || attuale.etichetta,
          creato: attuale.creato, creatoDa: attuale.creatoDa, aggiornato: ora, aggiornatoDa: u.email };
        if (attuale.eliminato) r.eliminato = true;   // resta archiviato anche se ricifrato
        if (attuale.riservato) { r.riservato = true; r.condivisi = attuale.condivisi || []; }
        if (attuale.aula) r.aula = attuale.aula;
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r, true);
        return { id: r.id, version: r.version, aggiornato: r.aggiornato, aggiornatoDa: r.aggiornatoDa };
      });
    };

    azioni['paziente.versioni'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      return leggiIndiceVersioni(pid).versioni.map(function (x) {
        return { version: x.v, aggiornato: x.il, aggiornatoDa: x.da };
      });
    };

    azioni['paziente.versione'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      var r = A.leggiJSON(P.versione(pid, interoV(d.version, 1, 1e9, 'version')));
      if (!r) throw err('non-trovato', 'Versione non trovata.');
      return r;
    };

    // Archivia (non cancella): il file resta, con tutte le versioni, e un admin
    // puo' riattivarlo. Sparisce dai dispositivi alla sincronizzazione successiva.
    azioni['paziente.archivia'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      puoIn(u, aulaDi(pid), 'eliminaPazienti');
      var archiviato = d.archiviato !== false;
      return conLock(function () {
        var r = leggiRecord(pid);
        if (!!r.eliminato === archiviato) return voceElenco(r);
        archiviaVersione(r);
        r.version += 1;
        r.eliminato = archiviato;
        r.aggiornato = amb.ora();
        r.aggiornatoDa = u.email;
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r);
        return voceElenco(r);
      });
    };

    /**
     * Dell'aula o riservato, e con chi è condiviso. Un riservato lo cambia solo chi l'ha
     * creato; un bambino dell'aula lo può rendere riservato chi l'ha creato o un
     * amministratore che lo vede (che allora resta fra le persone con cui è condiviso).
     */
    azioni['paziente.condivisione'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      var riservato = d.riservato === true;
      var condivisi = listaV(d.condivisi || [], 50, 'condivisi').map(function (e) {
        e = String(e || '').trim().toLowerCase();
        if (!RE.email.test(e)) throw err('richiesta-non-valida', 'Email non valida: ' + e);
        return e;
      });
      return conLock(function () {
        var r = leggiRecord(pid);
        var creatore = r.creatoDa === u.email;
        if (r.riservato && !creatore) throw err('vietato', 'Solo chi ha creato il bambino ne cambia la condivisione.');
        if (!r.riservato && !creatore && !(permessiIn(u, r.aula || AULA_BASE) || {}).vediTutti) throw err('vietato', 'Solo chi l\'ha creato o un amministratore può renderlo riservato.');
        // si condivide solo con persone della stessa aula
        var acc = leggiAccessi(), aulaR = r.aula || AULA_BASE, prop = String(amb.proprietario() || '').toLowerCase();
        condivisi.forEach(function (e) {
          if (e !== prop && !(acc.utenti[e] && auleDiVoce(acc.utenti[e])[aulaR])) throw err('vietato', e + ' non fa parte dell\'aula di questo bambino.');
        });
        if (riservato) {
          if (!creatore && condivisi.indexOf(u.email) < 0) condivisi.push(u.email);
          r.riservato = true;
          r.condivisi = condivisi.filter(function (e, i) { return e !== r.creatoDa && condivisi.indexOf(e) === i; });
        } else { delete r.riservato; delete r.condivisi; }
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r);
        return voceElenco(r);
      });
    };

    // Un bambino passa a un'altra aula: lo fa chi amministra entrambe (o il proprietario).
    // Chi non fa parte della nuova aula lo perde alla sincronizzazione successiva.
    azioni['paziente.aula'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      var nuova = idV(d.aula, RE.aula, 'aula');
      richiediVisibile(u, pid);
      if (!auleDelCentro(leggiAccessi())[nuova]) throw err('non-trovato', 'Aula inesistente.');
      puoIn(u, aulaDi(pid), 'gestisciAccessi');
      puoIn(u, nuova, 'gestisciAccessi');
      return conLock(function () {
        var r = leggiRecord(pid);
        if ((r.aula || AULA_BASE) === nuova) return voceElenco(r);
        // un riservato resta condiviso solo con chi fa parte della nuova aula
        if (r.riservato) {
          var acc = leggiAccessi();
          r.condivisi = (r.condivisi || []).filter(function (e) { return e === String(amb.proprietario() || '').toLowerCase() || (acc.utenti[e] && auleDiVoce(acc.utenti[e])[nuova]); });
        }
        if (nuova === AULA_BASE) delete r.aula; else r.aula = nuova;
        r.aggiornato = amb.ora(); r.aggiornatoDa = u.email;
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r);
        return voceElenco(r);
      });
    };

    // --- Materiali ------------------------------------------------------------
    function leggiIndiceMateriali() {
      return A.leggiJSON(P.indiceMateriali) || { schema: SCHEMA, version: 0, sets: {} };
    }

    azioni['materiali.indice'] = function () { return leggiIndiceMateriali(); };

    azioni['materiali.set'] = function (u, d) {
      var id = idV(d.id, RE.set, 'id');
      var voce = leggiIndiceMateriali().sets[id];
      if (!voce) throw err('non-trovato', 'Set non trovato.');
      return A.leggiJSON(P.set(id));
    };

    azioni['materiali.mancanti'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var hashes = listaV(d.hashes, 5000, 'hashes');
      hashes.forEach(function (h) { idV(h, RE.hash, 'hash'); });
      preparaImmagini(hashes.length);
      return hashes.filter(function (h) { return !immagineEsiste(h); });
    };

    // Quali immagini ci sono: con molti hash un solo elenco della cartella
    // costa molto meno di una ricerca per ogni hash e per ogni estensione.
    // Vale per la sola richiesta in corso (si azzera in gestisci).
    var registroImmagini = null;
    function preparaImmagini(quante) {
      if (registroImmagini || quante < 4) return;
      var nomi = A.nomiFile ? A.nomiFile(P.cartellaImmagini) : A.elenca(P.cartellaImmagini).file;
      registroImmagini = {};
      nomi.forEach(function (n) { var m = /^([a-f0-9]{64})\.(\w+)$/.exec(n); if (m) registroImmagini[m[1]] = m[2]; });
    }
    function immagineEsiste(hash) {
      if (registroImmagini) return registroImmagini[hash] || null;
      for (var mime in EST) if (A.esiste(P.immagine(hash, EST[mime]))) return EST[mime];
      return null;
    }

    azioni['materiali.caricaImmagini'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var imm = oggettoV(d.immagini, 'immagini');
      var chiavi = Object.keys(imm);
      if (chiavi.length > 40) throw err('richiesta-non-valida', 'Al massimo 40 immagini per richiesta.');
      preparaImmagini(chiavi.length);
      var caricate = [];
      chiavi.forEach(function (h) {
        idV(h, RE.hash, 'hash');
        var m = RE.dataUrl.exec(String(imm[h] || ''));
        if (!m) throw err('richiesta-non-valida', 'File ' + h.slice(0, 8) + ': solo immagini PNG/JPEG/WebP/GIF o audio.');
        if (m[2].length > 14 * 1024 * 1024) throw err('richiesta-non-valida', 'File ' + h.slice(0, 8) + ' troppo grande (max ~10 MB).');
        // L'hash lo ricalcola il custode: un client non puo' salvare un file
        // sotto il nome di un altro e contaminare le cache degli altri.
        if (amb.sha256Hex(m[2]) !== h) throw err('richiesta-non-valida', 'L\'hash del file ' + h.slice(0, 8) + ' non corrisponde al contenuto.');
        if (!immagineEsiste(h)) {
          A.scriviBinario(P.immagine(h, EST[m[1]]), m[2], m[1]);
          if (registroImmagini) registroImmagini[h] = EST[m[1]];
        }
        caricate.push(h);
      });
      return caricate;
    };

    azioni['materiali.immagini'] = function (u, d) {
      var hashes = listaV(d.hashes, 40, 'hashes');
      hashes.forEach(function (h) { idV(h, RE.hash, 'hash'); });
      preparaImmagini(hashes.length);
      // Risposte troppo grosse si perdono per strada: oltre ~8 MB ci si ferma e
      // l'app richiede le restanti (le trova assenti da questa risposta).
      var out = {}, peso = 0;
      for (var i = 0; i < hashes.length && peso < MAX_RISPOSTA; i++) {
        var ext = immagineEsiste(hashes[i]);
        if (!ext) continue;
        var b = A.leggiBinario(P.immagine(hashes[i], ext));
        if (b) { out[hashes[i]] = 'data:' + b.mime + ';base64,' + b.base64; peso += b.base64.length; }
      }
      return out;
    };

    azioni['materiali.pubblica'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var set = validaSet(d.set);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      var hashes = hashRiferiti(set);
      preparaImmagini(hashes.length);
      return conLock(function () {
        var mancanti = hashes.filter(function (h) { return !immagineEsiste(h); });
        if (mancanti.length) throw err('immagini-mancanti', 'Mancano ' + mancanti.length + ' immagini: caricale prima di pubblicare.', { mancanti: mancanti });
        var indice = leggiIndiceMateriali();
        var prima = indice.sets[set.id];
        var versioneAttuale = prima ? prima.versione : 0;
        if (versioneAttuale !== base) {
          throw err('conflitto', 'Questo set è stato aggiornato da ' + (prima && prima.aggiornatoDa) + ' nel frattempo.', { versioneAttuale: versioneAttuale });
        }
        var ora = amb.ora();
        set.versione = versioneAttuale + 1;
        set.aggiornato = ora; set.aggiornatoDa = u.email;
        A.scriviJSON(P.set(set.id), set);
        indice.sets[set.id] = {
          nome: String(set.name || set.nome || set.id).slice(0, 120),
          categoria: String(set.category || set.categoria || '').slice(0, 80),
          versione: set.versione, immagini: hashes,
          nItems: (set.items || []).length,
          aggiornato: ora, aggiornatoDa: u.email,
          pubblicatoDa: prima ? prima.pubblicatoDa : u.email,
        };
        indice.version = (indice.version || 0) + 1;
        indice.aggiornato = ora;
        A.scriviJSON(P.indiceMateriali, indice);
        return indice.sets[set.id];
      });
    };

    azioni['materiali.elimina'] = function (u, d) {
      puo(u, 'eliminaMateriali');
      var id = idV(d.id, RE.set, 'id');
      return conLock(function () {
        var indice = leggiIndiceMateriali();
        if (!indice.sets[id]) throw err('non-trovato', 'Set non trovato.');
        delete indice.sets[id];   // il file del set resta nel Drive: si puo' recuperare
        indice.version = (indice.version || 0) + 1;
        indice.aggiornato = amb.ora();
        A.scriviJSON(P.indiceMateriali, indice);
        return true;
      });
    };

    // --- Modalità e sinonimi del centro ------------------------------------------
    // Un solo dizionario per tutti: come si chiamano nei quaderni le modalità
    // (TACT, Intensive tact, Mandi sì/no...) e in quale categoria stanno. Non
    // contiene dati dei bambini: nomi di programmi, quindi in chiaro.
    var RE_MOD = /^[a-z0-9][a-z0-9-]{0,47}$/;
    function leggiModalita() {
      return A.leggiJSON(P.modalita) || { schema: SCHEMA, version: 0, categorie: [], modalita: [], sinonimi: {}, modi: {} };
    }
    azioni['modalita.leggi'] = function () { return leggiModalita(); };

    // Aggiunte, non sostituzioni: due persone che importano insieme non si
    // cancellano a vicenda. Un sinonimo o un modo a null si toglie.
    azioni['modalita.aggiorna'] = function (u, d) {
      if (!permessi(u).importa && !permessi(u).programmi) throw err('vietato', 'Non puoi modificare le modalità del centro.');
      var cat = listaV(d.categorie || [], 50, 'categorie').map(function (c) {
        oggettoV(c, 'categoria');
        var cc = { id: idV(c.id, RE_MOD, 'categoria.id'), nome: testoV(c.nome, 60, true, 'categoria.nome') };
        if (c.nascosta === true) cc.nascosta = true;
        return cc;
      });
      var mod = listaV(d.modalita || [], 200, 'modalita').map(function (m) {
        oggettoV(m, 'modalita');
        var mm = { id: idV(m.id, RE_MOD, 'modalita.id'), nome: testoV(m.nome, 60, true, 'modalita.nome'), categoria: idV(m.categoria, RE_MOD, 'modalita.categoria') };
        if (m.nascosta === true) mm.nascosta = true;
        return mm;
      });
      // etichette delle note del diario (Seduta, Famiglia…): nomi, non dati dei bambini
      var eti = listaV(d.etichette || [], 60, 'etichette').map(function (e) {
        oggettoV(e, 'etichetta');
        var ee = { id: idV(e.id, RE_MOD, 'etichetta.id'), nome: testoV(e.nome, 40, true, 'etichetta.nome') };
        if (e.colore) { ee.colore = testoV(e.colore, 7, false, 'etichetta.colore'); if (!/^#[0-9a-fA-F]{6}$/.test(ee.colore)) throw err('richiesta-non-valida', 'Colore non valido'); }
        if (e.nascosta === true) ee.nascosta = true;
        return ee;
      });
      var sin = {}, modi = {};
      var sinIn = d.sinonimi ? oggettoV(d.sinonimi, 'sinonimi') : {};
      var chiaviSin = Object.keys(sinIn);
      if (chiaviSin.length > 500) throw err('richiesta-non-valida', 'Troppi sinonimi in una volta.');
      chiaviSin.forEach(function (k) {
        var kk = idV(k, /^[a-z0-9][a-z0-9 ]{0,79}$/, 'sinonimo');
        var v = sinIn[k];
        if (v === null) { sin[kk] = null; return; }
        oggettoV(v, 'sinonimo');
        sin[kk] = { modalita: idV(v.modalita, RE_MOD, 'sinonimo.modalita') };
        if (v.variante) sin[kk].variante = testoV(v.variante, 80, false, 'sinonimo.variante');
      });
      var modiIn = d.modi ? oggettoV(d.modi, 'modi') : {};
      Object.keys(modiIn).forEach(function (k) {
        idV(k, /^[a-z0-9_]{1,40}$/, 'modo');
        modi[k] = modiIn[k] === null ? null : idV(modiIn[k], RE_MOD, 'modi.modalita');
      });
      return conLock(function () {
        var x = leggiModalita();
        x.categorie = x.categorie || []; x.modalita = x.modalita || []; x.sinonimi = x.sinonimi || {}; x.modi = x.modi || {};
        cat.forEach(function (c) {
          var i = -1; x.categorie.forEach(function (y, k) { if (y.id === c.id) i = k; });
          if (i >= 0) x.categorie[i] = c; else x.categorie.push(c);
        });
        mod.forEach(function (m) {
          var i = -1; x.modalita.forEach(function (y, k) { if (y.id === m.id) i = k; });
          if (i >= 0) x.modalita[i] = m; else x.modalita.push(m);
        });
        x.etichette = x.etichette || [];
        eti.forEach(function (e) {
          var i = -1; x.etichette.forEach(function (y, k) { if (y.id === e.id) i = k; });
          if (i >= 0) x.etichette[i] = e; else x.etichette.push(e);
        });
        if (x.etichette.length > 60) throw err('richiesta-non-valida', 'Troppe etichette.');
        Object.keys(sin).forEach(function (k) { if (sin[k] === null) delete x.sinonimi[k]; else x.sinonimi[k] = sin[k]; });
        Object.keys(modi).forEach(function (k) { if (modi[k] === null) delete x.modi[k]; else x.modi[k] = modi[k]; });
        if (Object.keys(x.sinonimi).length > 3000 || x.modalita.length > 500) throw err('richiesta-non-valida', 'Il dizionario delle modalità è troppo grande.');
        x.schema = SCHEMA;
        x.version = (x.version || 0) + 1;
        x.aggiornato = amb.ora();
        x.aggiornatoDa = u.email;
        A.scriviJSON(P.modalita, x);
        return x;
      });
    };

    // --- Turni -------------------------------------------------------------------
    // Chi segue quale bambino e quando: una busta cifrata con la chiave del
    // centro per ogni settimana (chiave = il lunedì) e una per le persone dei
    // turni e una per la settimana tipo. Li leggono tutti, li cambia chi gestisce i programmi.
    var RE_TURNI = /^(persone|modello|\d{4}-\d{2}-\d{2})$/;
    var MAX_TURNI = 2 * 1024 * 1024;
    function aulaTurni(u, d) {
      var aula = d.aula ? idV(d.aula, RE.aula, 'aula') : AULA_BASE;
      if (!ruoloIn(u, aula)) throw err('vietato', 'Non fai parte di quest\'aula.');
      return aula;
    }
    azioni['turni.leggi'] = function (u, d) {
      var k = idV(d.chiave, RE_TURNI, 'chiave');
      var x = A.leggiJSON(P.turni(k, aulaTurni(u, d)));
      return x ? { chiave: k, version: x.version, busta: x.busta, aggiornato: x.aggiornato, aggiornatoDa: x.aggiornatoDa } : { chiave: k, version: 0, busta: null };
    };
    azioni['turni.salva'] = function (u, d) {
      var aula = aulaTurni(u, d);
      puoIn(u, aula, 'programmi');
      var cfg = richiediCifratura();
      var k = idV(d.chiave, RE_TURNI, 'chiave');
      var b = bustaV(d.busta, MAX_TURNI, 'busta');
      richiediChiaveAttuale(cfg, b);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var x = A.leggiJSON(P.turni(k, aula));
        if (((x && x.version) || 0) !== base) {
          throw err('conflitto', 'I turni sono stati cambiati da ' + ((x && x.aggiornatoDa) || 'un\'altra persona') + ' nel frattempo.', { attuale: x });
        }
        var n = { chiave: k, version: base + 1, busta: b, aggiornato: amb.ora(), aggiornatoDa: u.email };
        A.scriviJSON(P.turni(k, aula), n);
        return { chiave: k, version: n.version, aggiornato: n.aggiornato };
      });
    };

    // --- Accessi ----------------------------------------------------------------
    // Le persone del centro (nome ed email, niente ruoli né bambini): per scegliere con chi
    // condividere un bambino riservato. Le vede chiunque sia abilitato.
    azioni['persone.elenco'] = function (u, d) {
      var a = leggiAccessi(), out = [], prop = String(amb.proprietario() || '').toLowerCase();
      var sola = d && d.aula ? idV(d.aula, RE.aula, 'aula') : null;
      if (sola && !ruoloIn(u, sola)) throw err('vietato', 'Non fai parte di quest\'aula.');
      Object.keys(a.utenti).forEach(function (e) {
        var x = a.utenti[e];
        // il proprietario e' sempre attivo e in tutte le aule, qualunque cosa dica la sua voce
        var delProp = e === prop;
        if (!delProp && (x.attivo === false || (x.scadenza && oggi() > x.scadenza))) return;
        var va = delProp ? auleDelCentro(a) : auleDiVoce(x);
        var comuni = Object.keys(va).filter(function (k) { return (sola ? k === sola : true) && !!ruoloIn(u, k); });
        if (!comuni.length) return;
        out.push({ email: e, nome: x.nome || e, aule: comuni });
      });
      if (prop && !a.utenti[prop]) out.push({ email: prop, nome: prop, aule: Object.keys(u.aule || {}) });
      return out;
    };

    // Quello che un admin vede degli accessi: le sue aule, le persone che ne fanno parte
    // (con il solo ruolo in quelle aule) e i bambini assegnati di quelle aule.
    function accessiVisti(u, a) {
      if (u.proprietario) return a;
      var mie = auleCon(u, 'gestisciAccessi'), tutte = auleDelCentro(a), aule = {}, utenti = {};
      mie.forEach(function (k) { if (tutte[k]) aule[k] = tutte[k]; });
      var pidMiei = {}, el = leggiElenco().pazienti;
      Object.keys(el).forEach(function (pid) { if (mie.indexOf(el[pid].aula || AULA_BASE) >= 0) pidMiei[pid] = true; });
      Object.keys(a.utenti).forEach(function (e) {
        var x = a.utenti[e], va = auleDiVoce(x), qui = {};
        Object.keys(va).forEach(function (k) { if (mie.indexOf(k) >= 0) qui[k] = va[k]; });
        if (!Object.keys(qui).length) return;
        utenti[e] = { nome: x.nome, ruolo: ruoloPiuAlto(qui), aule: qui, attivo: x.attivo !== false, scadenza: x.scadenza || null,
          pazienti: x.pazienti === '*' ? '*' : (x.pazienti || []).filter(function (pid) { return pidMiei[pid]; }) };
        if (Object.keys(va).length > Object.keys(qui).length) utenti[e].altreAule = true;
      });
      return { schema: SCHEMA, version: a.version || 0, aule: aule, utenti: utenti, aggiornato: a.aggiornato, aggiornatoDa: a.aggiornatoDa };
    }
    azioni['accessi.leggi'] = function (u) {
      puo(u, 'gestisciAccessi');
      var a = accessiVisti(u, leggiAccessi());
      a.proprietario = String(amb.proprietario() || '').toLowerCase();
      if (u.proprietario) a.aule = auleDelCentro(a);
      return a;
    };

    // Il proprietario salva tutto (aule comprese). Un admin cambia solo le sue aule:
    // quello che riguarda le altre aule resta com'era, anche se non lo vede.
    function unisciAccessiAdmin(u, attuale, nuovo) {
      var mie = auleCon(u, 'gestisciAccessi');
      var esistenti = auleDelCentro(attuale);
      var out = { schema: SCHEMA, aule: esistenti, utenti: {} };
      var el = leggiElenco().pazienti;
      var mioPid = function (pid) { return mie.indexOf((el[pid] && el[pid].aula) || AULA_BASE) >= 0; };
      // le persone che l'admin non vede restano come sono
      var propAdm = String(amb.proprietario() || '').toLowerCase();
      Object.keys(attuale.utenti || {}).forEach(function (e) {
        var x = attuale.utenti[e], va = auleDiVoce(x);
        if (e === propAdm) { out.utenti[e] = x; return; }   // la voce del proprietario la cambia solo lui
        var mia = Object.keys(va).some(function (k) { return mie.indexOf(k) >= 0; });
        if (!mia) { out.utenti[e] = x; return; }
        var n = nuovo.utenti[e];
        var altre = {};
        Object.keys(va).forEach(function (k) { if (mie.indexOf(k) < 0) altre[k] = va[k]; });
        var qui = {};
        if (n) Object.keys(n.aule).forEach(function (k) { if (mie.indexOf(k) >= 0) qui[k] = n.aule[k]; });
        var aule = Object.assign({}, altre, qui);
        if (!Object.keys(aule).length) return;   // tolta da tutte le aule: esce
        var soloMie = !Object.keys(altre).length;
        var pz = x.pazienti === '*' || (n && n.pazienti === '*') ? (n ? n.pazienti : x.pazienti)
          : (x.pazienti || []).filter(function (pid) { return !mioPid(pid); }).concat(((n && n.pazienti) || []).filter(mioPid));
        out.utenti[e] = {
          // nome, attivo e scadenza valgono in tutte le aule: li cambia chi ha la persona solo nelle sue
          nome: soloMie && n ? n.nome : x.nome, attivo: soloMie && n ? n.attivo : x.attivo !== false,
          scadenza: soloMie && n ? n.scadenza : (x.scadenza || null),
          aule: aule, ruolo: ruoloPiuAlto(aule), pazienti: pz,
        };
      });
      // persone nuove: solo nelle aule dell'admin; chi esiste già in altre aule non si può prendere da qui
      Object.keys(nuovo.utenti).forEach(function (e) {
        if (attuale.utenti && attuale.utenti[e]) return;
        if (e === propAdm) return;   // un admin non crea ne' tocca la voce del proprietario
        var n = nuovo.utenti[e], qui = {};
        Object.keys(n.aule).forEach(function (k) { if (mie.indexOf(k) >= 0) qui[k] = n.aule[k]; });
        if (!Object.keys(qui).length) throw err('vietato', e + ': puoi aggiungere persone solo alle tue aule.');
        out.utenti[e] = { nome: n.nome, attivo: n.attivo, scadenza: n.scadenza, aule: qui, ruolo: ruoloPiuAlto(qui),
          pazienti: n.pazienti === '*' ? '*' : (n.pazienti || []).filter(mioPid) };
      });
      return out;
    }

    azioni['accessi.salva'] = function (u, d) {
      puo(u, 'gestisciAccessi');
      var arrivati = validaAccessi(d.accessi);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var attuale = leggiAccessi();
        if ((attuale.version || 0) !== base) {
          throw err('conflitto', 'Gli accessi sono stati modificati da ' + (attuale.aggiornatoDa || 'un altro admin') + ' nel frattempo.', { attuale: accessiVisti(u, attuale) });
        }
        var nuovo = u.proprietario ? arrivati : unisciAccessiAdmin(u, attuale, arrivati);
        // La voce del proprietario vale solo per il nome: il resto e' sempre «admin di tutto».
        var propS = String(amb.proprietario() || '').toLowerCase();
        if (nuovo.utenti[propS]) {
          var tuttiAdmin = {};
          Object.keys(auleDelCentro(nuovo)).forEach(function (k) { tuttiAdmin[k] = 'admin'; });
          nuovo.utenti[propS] = { nome: nuovo.utenti[propS].nome, ruolo: 'admin', aule: tuttiAdmin, pazienti: '*', attivo: true, scadenza: null };
        }
        if (u.proprietario) {
          // un'aula si toglie solo se non ha più bambini
          var el = leggiElenco().pazienti;
          Object.keys(auleDelCentro(attuale)).forEach(function (k) {
            if (nuovo.aule[k]) return;
            if (k === AULA_BASE) throw err('richiesta-non-valida', 'L\'aula di partenza non si può togliere.');
            if (Object.keys(el).some(function (pid) { return (el[pid].aula || AULA_BASE) === k && !el[pid].eliminato; })) throw err('richiesta-non-valida', 'L\'aula «' + auleDelCentro(attuale)[k].nome + '» ha ancora dei bambini: spostali prima di toglierla.');
          });
        }
        // Un admin non puo' togliersi da solo il ruolo: eviterebbe di restare
        // senza nessuno che gestisca gli accessi (il proprietario resta comunque admin).
        if (!u.proprietario) {
          var io = nuovo.utenti[u.email];
          var prima = auleCon(u, 'gestisciAccessi');
          if (!io || !io.attivo || prima.some(function (k) { return auleDiVoce(io)[k] !== 'admin'; })) {
            throw err('richiesta-non-valida', 'Non puoi togliere a te stesso il ruolo di admin.');
          }
        }
        nuovo.version = (attuale.version || 0) + 1;
        nuovo.aggiornato = amb.ora();
        nuovo.aggiornatoDa = u.email;
        A.scriviJSON(P.accessi, nuovo);
        // Chi esce dall'elenco perde anche la chiave consegnata ai suoi dispositivi
        var disp = leggiDispositivi(), cambiati = false;
        Object.keys(disp.dispositivi).forEach(function (id) {
          var e = disp.dispositivi[id].email;
          if (e !== String(amb.proprietario() || '').toLowerCase() && !nuovo.utenti[e]) { delete disp.dispositivi[id]; cambiati = true; }
        });
        if (cambiati) A.scriviJSON(P.dispositivi, disp);
        revocaChiavi();
        return accessiVisti(u, nuovo);
      });
    };

    azioni['manutenzione.ricostruisci'] = function (u) {
      soloProprietario(u);
      return conLock(function () { return { ricostruiti: Object.keys(ricostruisciElenco().pazienti).length }; });
    };

    // --- Ingresso -------------------------------------------------------------
    // Ogni risposta porta `ms`: i millisecondi passati dentro il custode (il resto,
    // per chi chiama, e' rete e avvio di Apps Script) e `fasi`: dove sono andati (attesa del
    // lucchetto, letture e scritture dei file, cache, altro) con quante operazioni e i file piu' lenti.
    function gestisci(richiesta) {
      var t0 = Date.now();
      PROF = { attesaLock: 0, letture: 0, scritture: 0, nLetture: 0, nScritture: 0, file: {} };
      if (A0.azzeraMisure) A0.azzeraMisure();
      var r;
      try { r = gestisciInterno(richiesta); }
      finally { var ms = Date.now() - t0; var fasi = PROF ? chiudiProfilo(ms) : null; }
      if (r && typeof r === 'object') { r.ms = ms; r.fasi = fasi; }
      return r;
    }
    function gestisciInterno(richiesta) {
      try {
        if (!richiesta || typeof richiesta !== 'object') throw err('richiesta-non-valida', 'Richiesta vuota.');
        if (richiesta.v !== 1) throw err('richiesta-non-valida', 'Versione del protocollo non supportata: aggiorna l\'app.');
        var fn = azioni[richiesta.azione];
        if (!fn && !(richiesta.azione === 'sessione.crea' && amb.creaSessione)) throw err('richiesta-non-valida', 'Azione sconosciuta: ' + String(richiesta.azione).slice(0, 40));
        var identita;
        try { identita = amb.verificaToken(richiesta.token); }
        catch (e) { throw err('non-autenticato', 'Accesso scaduto o non valido: rientra con Google.'); }
        var stato = null;
        if (richiesta.azione === 'sincronizza.stato') {
          stato = statoVeloce(identita, richiesta);
          if (stato) return { ok: true, dati: stato };
          // niente in cache o qualcosa di nuovo: si risponde dai file, e se serve si rinnova la revisione
          ripristinaRev();
          revInizio = cGet(REV); identitaStato = identita;
        }
        var u = utenteDa(identita);
        // Accesso lungo sul dispositivo: dopo un accesso con Google (non da un'altra
        // sessione) il custode rilascia un suo gettone firmato, valido qualche settimana.
        // Chi viene disattivato o scade resta fuori lo stesso: utenteDa si controlla sempre.
        if (richiesta.azione === 'sessione.crea') {
          if (identita.sessione) throw err('richiesta-non-valida', 'Serve un accesso con Google.');
          return { ok: true, dati: amb.creaSessione({ email: u.email, nome: u.nome }) };
        }
        var dati = richiesta.dati && typeof richiesta.dati === 'object' ? richiesta.dati : {};
        registroImmagini = null;
        elencoRichiesta = null;
        var chiave = amb.ricordo && RIPETIBILI[richiesta.azione] && typeof richiesta.rid === 'string' && RE_RICHIESTA.test(richiesta.rid)
          ? 'rid:' + u.email + ':' + richiesta.azione + ':' + richiesta.rid : null;
        if (chiave) {
          var gia = null;
          try { gia = amb.ricordo.leggi(chiave); } catch (e0) { gia = null; }
          if (gia) return JSON.parse(gia);
        }
        var risposta = { ok: true, dati: fn(u, dati) };
        if (chiave) {
          var testo = JSON.stringify(risposta);
          // la cache di Apps Script tiene valori fino a 100 KB
          if (testo.length < 90000) { try { amb.ricordo.scrivi(chiave, testo); } catch (e1) { /* solo una comodita' */ } }
        }
        return risposta;
      } catch (e) {
        if (e instanceof Errore) return { ok: false, errore: e.codice, messaggio: e.message, extra: e.extra };
        if (e && e.occupato) return { ok: false, errore: 'occupato', messaggio: 'Il custode è occupato con un\'altra richiesta: riprova tra qualche secondo.' };
        return { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(e && e.message || e).slice(0, 300) };
      }
    }

    // Manutenzione richiamabile solo dal codice del server (editor di Apps
    // Script, test): non passa da gestisci, quindi non e' raggiungibile via HTTP.
    function ricostruisci() {
      return conLock(function () { return Object.keys(ricostruisciElenco().pazienti).length; });
    }

    /** Dal risveglio periodico: le chiavi di chi è scaduto si revocano anche se non si ripresenta. */
    function revocaScaduti() { return conLock(revocaChiavi); }

    /** Dal risveglio periodico: tiene pronta la corsia rapida anche se la cache e' scaduta. */
    function scalda() { ripristinaRev(); }

    /**
     * Dal risveglio periodico (e prima di svuotare la cache): scrive su Drive quello che i salvataggi
     * hanno rimandato (elenco, indici delle versioni, versioni superate da eliminare). Se la cache
     * ha perso un file rimandato lo ricostruisce dai file dei bambini.
     */
    function smaltisci() {
      if (!A0.rinviate) return 0;
      return conLock(function () {
        var n = 0;
        A0.rinviate().forEach(function (p) {
          if (A0.scarica(p)) { n++; return; }
          var m = /^Pazienti\/([^\/]+)\/versioni\.json$/.exec(p);
          if (p === P.elenco) { ricostruisciElenco(); n++; }
          else if (m) { leggiIndiceVersioni(m[1]); n++; }
          else A0.dimentica(p);
        });
        if (A0.eliminaRinviati) n += A0.eliminaRinviati();
        return n;
      });
    }

    return { gestisci: gestisci, azioni: Object.keys(azioni), ricostruisci: ricostruisci, revocaScaduti: revocaScaduti, scalda: scalda, smaltisci: smaltisci };
  }

  return {
    SCHEMA: SCHEMA, PERMESSI: PERMESSI, RUOLI: RUOLI, AULA_BASE: AULA_BASE, PERCORSI: P, RE: RE, VERSIONI: VERSIONI,
    CHIAVE_STATO_REV: QT_CHIAVE_STATO_REV,
    creaCustode: creaCustode, stabile: stabile, hashRiferiti: hashRiferiti, bustaV: bustaV,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QT;
