# Corsia veloce su Firestore — decisioni di progetto (riusabili, p.es. per PsyDiary)

Obiettivo: far arrivare in tempo reale a più dispositivi dati **cifrati end-to-end**, tenendo il custode esistente (Apps Script + Drive) come base dati, archivio e riserva. Firestore è solo una strada più veloce: ogni dato passa sempre anche dal custode.

## Principi

1. **Firestore non vede mai dati in chiaro.** Le buste sono quelle del custode (AES-GCM con la chiave del centro). Le regole servono solo a decidere *chi riceve quali buste*.
2. **Fonte di verità dei permessi unica: il custode.** Le regole non possono leggere il Drive, quindi il custode scrive su Firestore una **copia degli accessi** (solo lui: via REST con `ScriptApp.getOAuthToken()` e scope `datastore`, che salta le regole; i client non hanno nessun permesso di scrittura su quelle raccolte). Il codice che calcola la copia (`copiaFirestore` in `custode/core.js`) è nello stesso file delle regole del custode (`utenteDa`, `vede`), così i due modelli non divergono; i test confrontano i due.
3. **Le regole non sono filtri.** Ogni query dell'app deve essere dimostrabile dalle regole: si progetta dalle query verso le regole. Verificato con l'emulatore: `aula ==` + `riservato == false` (chi vede tutta l'aula); `aula ==` + `riservato == false` + `pid in [≤30]` (chi vede alcuni bambini; si dimostra anche con i sottoinsiemi); un bambino alla volta per i riservati (`pid ==`, le regole leggono la copia del bambino). Una query più larga di quanto garantito è negata per intero.
4. **Riserva automatica.** Qualunque errore (quota `resource-exhausted`, permessi, rete, libreria non caricata) spegne la corsia; il custode riceve sempre tutto. Quota: spenta fino alla mezzanotte locale. Il resto: per la sessione, con tasto «Riprova» e ripartenza automatica quando torna la rete.
5. **Senza configurazione non esiste.** Blocco `firebase` vuoto in `tice-config.js` → nessun caricamento della libreria, nessuna riga nell'interfaccia.

## Schema dei dati

Raccolte scritte **solo dal custode**:

| Documento | Campi |
|---|---|
| `accessi/{email}` | `email`, `attivo` (sempre true: chi non è abilitato non ha il documento), `scadeIl` (timestamp: il giorno dopo la scadenza, 00:00 UTC; 2100 se senza scadenza), `proprietario`, `aule` (mappa aula→ruolo), `vedeTutte[]` (aule dove il ruolo «vede tutti»), `scrivono[]` (aule dove registra sedute), `gestisce[]` (aule dove gestisce accessi), `tutti` (bambini «*»), `pazienti[]` |
| `pazienti/{pid}` | `aula`, `riservato`, `creatoDa`, `condivisi[]`, `eliminato` |

Il proprietario ha tutte le aule come admin e `tutti`. I ruoli sono tradotti in liste di aule dal `PERMESSI` del custode: cambiare un ruolo non richiede di toccare le regole.

Raccolte scritte dai client (sempre con `scade` e campi vincolati dalle regole):

| Documento | Campi | Chi legge | Chi scrive |
|---|---|---|---|
| `modifiche/{pid}` | `pid`, `aula`, `riservato`, `v` (versione del custode), `da` (email), `disp`, `ts` (ora del server), `scade`, `n` | chi vede il bambino | chi vede il bambino ed è nel ruolo che registra sedute; `aula` e `riservato` devono coincidere con la copia; `da` = chi scrive |
| `buste/{pid}` | gli stessi + `busta` (cifrata, identica a quella del custode) | idem | idem |
| `richieste/{dispositivo}` | `email`, `aula`, `nome`, `pubblica` (chiave pubblica RSA), `ts`, `scade` | admin dell'aula (`gestisce`) e chi l'ha fatta | solo a nome proprio, per una propria aula |
| `consegne/{dispositivo}` | `email`, `kid`, `busta` (chiave del centro cifrata per quel dispositivo), `da`, `ts`, `scade` | **solo il richiedente** | un admin dell'aula della richiesta, per una richiesta esistente, a una persona abilitata |

Scelte:
- **Un solo documento per bambino** (ultima versione), non uno per modifica: la busta è lo stato completo, quindi basta l'ultima. Evita storici enormi e limita le letture all'avvio.
- **Avviso e busta separati.** Si ascolta solo `modifiche` (piccolo); la busta (centinaia di KB) si legge solo se la versione è più nuova di quella locale. All'apertura dell'app non si scarica nulla di inutile.
- **Niente `orderBy`/intervalli**: solo uguaglianze e `in`, quindi nessun indice composito da creare.
- **Pulizia**: `scade` = 3 giorni (richieste/consegne 2). Il custode cancella le scadute al risveglio; si può aggiungere un criterio TTL di Firestore sul campo `scade`. Il custode cancella anche `modifiche/{pid}` e `buste/{pid}` quando il bambino cambia aula o diventa riservato/condiviso diversamente (le vecchie buste non devono arrivare a chi non le deve più vedere).
- **Letture delle regole** (ogni `get()` conta): una query per aula costa 1 lettura di `accessi`; una per bambino riservato 2; scrivere una modifica 2. Il documento `accessi` della persona è letto una sola volta per valutazione.
- **Identità**: `request.auth.token.email` (minuscolo) con `email_verified == true` e provider `google.com`. Firebase Auth si collega con `signInWithCredential(GoogleAuthProvider.credential(idToken))` usando lo stesso ID token Google dell'app: nessun secondo accesso visibile. Workspace e Gmail personali vanno entrambi (bastano email e profilo). Il client OAuth dell'app deve essere nella whitelist di Authentication › Google se sta in un altro progetto Cloud. Senza popup né redirect (`initializeAuth` con la sola persistenza IndexedDB): nessuna pagina di Google aggiuntiva e CSP semplice.
- **Attivazione silenziosa**: se la corsia è spenta solo perché manca un ID token Google fresco, l'app prova (una volta per sessione, al massimo una volta al giorno dopo un fallimento, ricordato in `localStorage tice_veloce_silenzioso`) One Tap con FedCM + `auto_select` + `login_hint` (`Auth.accessoSilenzioso` in `tice-sync.js`; decisione in `decidiSilenzioso`/`creaSilenzioso` di `tice-veloce.js`). Un token con un'email diversa da quella collegata si scarta; non si tenta su desktop (Electron), APK (Capacitor), in sviluppo o senza HTTPS. Se fallisce resta il tasto «Attiva la corsia veloce».
- **Chiave**: il dispositivo nuovo scrive la richiesta con la sua chiave pubblica RSA; un admin con l'app aperta e la chiave **esportabile** (solo gli admin) la riceve in tempo reale, controlla che la persona sia nell'elenco accessi che già conosce e consegna la chiave cifrata per quel dispositivo (consegna automatica come prima, o con tasto). **Codice di verifica a 6 cifre** = primi 4 byte dello SHA-256 della chiave pubblica, modulo 10⁶, mostrato su entrambi i dispositivi: se un intermediario sostituisse la chiave pubblica, i due codici sarebbero diversi. Richiesta e consegna si cancellano dopo l'uso. Il percorso via custode resta (e il custode viene comunque aggiornato con `dispositivi.abilita`).
- **Applicazione delle modifiche**: la busta ricevuta passa dalla stessa funzione del custode (`applicaRemoto`: decifra, unisce a tre vie con `tice-unisci.js`, aggiorna `version` e `base`), quindi il giro con il custode converge sempre. Si applica solo se `v` è più nuova della versione locale; le proprie modifiche (`disp`) si ignorano. Con la corsia attiva il controllo periodico del custode si dirada a 5 minuti e l'invio parte dopo 0,8 s invece di 2,5.
- **Documenti troppo grandi** (busta > 900 000 caratteri, il limite è 1 MiB): non si pubblicano, restano sul custode.

## Cosa serve lato servizi

Firestore (modalità produzione, regione UE), Authentication con provider Google (+ client OAuth esterni se serve), Apps Script collegato allo stesso progetto Cloud con scope `https://www.googleapis.com/auth/datastore`, proprietà `FIREBASE_PROJECT_ID` (la imposta `impostaFirebase`). Libreria Firebase modulare da `https://www.gstatic.com/firebasejs/<versione esatta>/` con `import()` dinamico, solo se configurata (versione in `SDK_VERSIONE` di `js/tice-veloce.js`).

## Come riusarlo

Servono: (1) una funzione pura che dalla vostra fonte di permessi produce `accessi/*` e `pazienti/*` (o equivalenti); (2) un trasporto REST nel backend che le scrive con il token del proprietario; (3) `firestore.rules` con le vostre funzioni `legge`/`vedeCopia`; (4) `tice-veloce.js` (motore con backend e sincronizzazione iniettati: si prova senza rete). I test in `tools/test-firebase.js` confrontano ciò che il backend farebbe vedere con ciò che le regole fanno leggere, per ogni ruolo: da rifare uguali.

## Limiti noti

- Il piano gratuito ha quota giornaliera (50k letture / 20k scritture): oltre, la corsia si spegne fino al giorno dopo.
- Ogni persona abilitata ha un solo documento `accessi`; con più di ~1000 bambini assegnati a una persona servirebbe un'altra struttura (il custode già limita a 1000).
- Una modifica fatta mentre la persona è offline parte quando torna online; il documento Firestore non è un archivio: la verità è il custode.
- Non si usa App Check; la chiave `apiKey` della configurazione web non è segreta.
- Il controllo dei permessi nelle regole usa l'ora del server per la scadenza degli accessi; il resto (disattivazione, cambi di ruolo) arriva con la copia aggiornata dal custode (subito, a ogni cambio di accessi).
