# Corsia veloce (Firebase) — guida passo per passo

La corsia veloce è un **extra facoltativo**: le modifiche arrivano agli altri dispositivi in circa un secondo, e un dispositivo nuovo riceve la chiave del centro in un paio di secondi. Il custode (Apps Script + Drive) resta la base dei dati, l'archivio con le versioni precedenti e la **riserva automatica**: se la corsia veloce non funziona (limite giornaliero, rete, errore) l'app si comporta esattamente come prima e non si perde niente.

I dati su Firebase sono **sempre cifrati** con la chiave del centro, come sul Drive: Google non può leggerli.

Il progetto Firebase del centro è già creato (Firestore in Europa, accesso Google attivo, sito autorizzato). Restano questi passi, **nell'ordine**.

## 1. Pubblica le regole

1. Console Firebase › il progetto › **Firestore Database** › scheda **Regole**.
2. Cancella tutto, incolla il contenuto del file `firestore.rules` del repository, premi **Pubblica**.

Le regole fanno vedere a ciascuno solo i bambini che il custode farebbe vedere (stesse aule, stessi ruoli, stessi bambini assegnati, stessi riservati).

## 2. Consenti il client Google dell'app

L'accesso con Google dell'app usa un client OAuth che sta in un altro progetto Cloud. Firebase deve fidarsi dei suoi accessi:

1. Console Firebase › **Authentication** › **Metodo di accesso** › **Google** › apri la sezione **Configurazione SDK web** (o «Whitelist client IDs from external projects»).
2. In **ID client da progetti esterni** aggiungi:
   `838795760240-hhjuro8tq34mdekktjobo3399k2sufll.apps.googleusercontent.com`
3. Salva.

Senza questo passo la corsia resta spenta con il messaggio «accesso a Firebase non riuscito».

## 3. Aggiorna il custode e collegalo al progetto Firebase

Fai tutto con **l'account che ospita il custode** (il proprietario). L'ordine conta, così l'autorizzazione si chiede una volta sola:

1. Apri il progetto su script.google.com. Incolla il contenuto di `custode/custode-completo.gs` al posto del codice, e in **Impostazioni progetto** spunta «Mostra il file manifest appsscript.json»: sostituisci il suo contenuto con quello di `custode/appsscript.json` (aggiunge il permesso `datastore`).
2. **Impostazioni progetto** › **Progetto Google Cloud Platform** › **Cambia progetto** › scrivi il numero del progetto Firebase: **829054606350**. Serve perché lo script possa scrivere su Firestore (collegato allo *stesso* progetto).
3. Schermata di consenso OAuth di quel progetto (console Google Cloud › API e servizi › Schermata consenso OAuth):
   - se il tuo account è **Google Workspace**, scegli tipo **Interno**;
   - altrimenti pubblica l'app **In produzione** (non lasciarla in «Test»: in Test le autorizzazioni scadono ogni 7 giorni e la corsia si spegnerebbe).
4. Nell'editor di Apps Script aggiungi in fondo al codice questa riga:
   ```
   function avviaFirebase() { impostaFirebase('black-nucleus-510308-f9'); }
   ```
   poi scegli `avviaFirebase` nel menu delle funzioni e premi **Esegui**. Alla prima esecuzione Google chiede i permessi (Drive, richieste esterne, **Cloud Datastore**): accetta. La funzione copia su Firestore gli accessi e l'elenco dei bambini (nel registro vedrai «Corsia veloce attiva…»).
5. **Distribuisci › Gestisci distribuzioni › modifica › Versione: Nuova versione › Distribuisci.** L'indirizzo `/exec` non cambia.

Da quel momento il custode aggiorna da solo la copia degli accessi a ogni cambio (persone, aule, bambini riservati, spostamenti). Se un giorno vuoi rifarla da zero: `riallineaFirebase()`. Per spegnere la corsia dal custode: `disattivaFirebase()`.

> Il «risveglio» facoltativo del custode (`attivaRisveglio`) cancella anche le modifiche vecchie di Firebase; se non lo usi, vedi il passo 4.

## 4. Pulizia automatica (facoltativa ma consigliata)

Le modifiche su Firebase durano **3 giorni** e poi vanno cancellate (chi manca da più tempo si allinea dal custode). Due strade, usa quella che preferisci (anche tutte e due):

- **Automatica di Firebase (TTL)**: Firestore › **Dati** › scheda **TTL** (Criteri di durata) › **Crea criterio**, per ciascuna di queste quattro raccolte, campo `scade`: `modifiche`, `buste`, `richieste`, `consegne`.
- **Dal custode**: se hai attivato il risveglio (`attivaRisveglio`), cancella da solo ciò che è scaduto.

## 5. Cosa mandare allo sviluppatore

Niente di segreto. Serve solo la **configurazione web** del progetto (`apiKey`, `authDomain`, `projectId`, `appId`…), che è già in `tice-config.js`: se cambi progetto, rimandala (Impostazioni progetto › Le tue app › app web › Configurazione SDK). Non mandare mai chiavi di servizio o password.

## 6. Come verificare che funzioni

1. Apri l'app su due dispositivi con due persone diverse. Su ciascuno: **Collegamento con il centro** › riga **«Corsia veloce: attiva»**.
2. Su un dispositivo aggiungi una seduta: sull'altro compare in circa un secondo.
3. Accedi da un dispositivo nuovo mentre un amministratore ha l'app aperta: la chiave arriva in un paio di secondi e il dispositivo nuovo mostra un **codice di verifica a 6 cifre**. Nelle Impostazioni (Dispositivi) l'amministratore può scegliere «Consegna la chiave solo quando tocco Consegna»: allora vede lo stesso codice e controlla che coincida.
4. Se la riga dice **«spenta (motivo)»**, il motivo spiega cosa manca:
   - «il custode va aggiornato»: passo 3;
   - «il custode non ha ancora copiato gli accessi»: esegui `impostaFirebase(...)` o `riallineaFirebase()` (passo 3);
   - «accesso a Firebase non riuscito» / «serve un nuovo accesso con Google»: passo 2, oppure tocca **Attiva la corsia veloce** (chiede un accesso Google al volo, senza uscire dall'app). I dispositivi già collegati la attivano da soli al prossimo accesso con Google;
   - «permessi non concessi»: le regole (passo 1) o la copia degli accessi non sono aggiornate;
   - «limite giornaliero raggiunto»: il piano gratuito ha 50.000 letture e 20.000 scritture al giorno; la corsia riparte il giorno dopo e intanto va tutto col custode.

## Provare tutto in locale (per chi sviluppa)

Serve Java e Node. Le librerie si installano una volta fuori dal repository:

```
sh tools/test-firebase.sh            # (usa ~/.cache/tice-firebase, o FB_DIR=<cartella>)
```
Avvia gli emulatori di Firestore e Auth, prova le regole contro il custode vero (chi vede cosa per ogni ruolo, aula, riservato, scadenza; nessuno scrive la copia; richiesta e consegna della chiave) e, se c'è Playwright, due browser con l'app vera: consegna della chiave, modifica visibile sull'altro dispositivo, riserva. Non fa mai chiamate al progetto vero. Per provare a mano: `node tools/custode-mock.js --dev --firestore 127.0.0.1:8085 --progetto demo-tice` con gli emulatori accesi.
