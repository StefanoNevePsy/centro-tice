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
