# Centro TICE — guida per riprendere il lavoro

Documento per chi (persona o assistente) prende in mano lo sviluppo senza aver visto le sessioni precedenti. Descrive lo stato del codice al branch `claude/quaderno-tice` (circa 380 commit; ultimo: «Nome del proprietario, nomi uniformi ovunque, «Tutti i bambini» nella home»). Ogni nome di file e di funzione citato è stato verificato nel codice; se cambia qualcosa, aggiorna questo file.

Documenti da leggere insieme a questo:
- `docs/quaderno-tice.md`: progetto, cifratura, ruoli, import, app installata (parte più vecchia, non cita le aule e le ultime schermate).
- `docs/configurazione.md`: configurazione passo per passo di Drive, Google e custode.
- `docs/DESIGN.md`: il design system «Taccuino» (colori, font, componenti).
- `docs/grafici-scc.md`: celeration chart.
- `PRODUCT.md`: descrive l'app **personale** da cui questo branch deriva (tablet, giochi lessicali); non è il Centro TICE. Utile solo per capire l'origine.

---

## 1. Cos'è l'app e per chi

**Centro TICE** è un'app web (PWA, anche Electron e APK) per un centro che segue bambini con interventi di tipo ABA: **terapisti** (professioniste), **tirocinanti** e **amministratori**. È un ramo dell'app personale «Ampliamento Lessicale» (giochi di stimolazione con set di carte): i giochi, i set e la cartella clinica vecchia ci sono ancora, ma la schermata di partenza è la **presa dati** e il cuore è il programma di ogni bambino.

Concetti di dominio che servono per leggere il codice:
- **Learn unit (LU)**: unità di apprendimento (presentazione di uno stimolo con la risposta). In seduta si segna ✓ (V) / P (aiutata, prompt) / ✗ (X). Con il **time delay (T/D)** si segnano i secondi di ritardo del prompt.
- **Attività**: una riga del programma (es. «Tact», «Problem solving»), con **modalità** (Tact, Mand, Indicare…) dentro una **categoria** (Speaker, Listener, Motricità…), uno o più **target** in sequenza (es. «Set 1», «Set 2»), un **criterio** (soglia %, numero di sedute di fila). Quando un target arriva a criterio l'app *propone* il successivo, non lo decide da sola.
- **Task analysis (TA)**: attività con **passi**; in seduta si segna un passo alla volta.
- **Comportamenti problema**: si segna se e quando avvengono (frequenza, durata, intensità, ABC), non risposte giuste/sbagliate; non entrano nelle statistiche delle LU.
- **Diario**: note del bambino (una voce per nota, con autrice, ora, etichetta, «Da tenere a mente»).
- **Turni**: il calendario di chi prende quale bambino in quale fascia oraria.
- **Aule**: gruppi separati dentro lo stesso centro; ogni bambino sta in un'aula, ogni persona ha un ruolo per aula.

Funzioni viste dall'utente (le viste sono registrate in `VISTE`, vedi sezione 2):
- **Turni di oggi** (schermata iniziale, vista `turni`) e **settimana tipo** (`turni-modello`); da lì si apre il bambino.
- **Elenco dei bambini** (`bambini`, anche «Tutti i bambini»), nuovo bambino, aule, bambini «non dell'aula» (riservati, visibili solo a chi li crea e alle persone con cui li condivide).
- **Seduta** (`seduta`): attività del bambino con target in corso, tasti ✓/P/✗ (✓/E+/E-/✗ nell'echo to tact), task analysis, strisce dei comportamenti, nota, «chi ha svolto» (dal calendario o scelta), fine seduta con proposta del target successivo e unione delle attività aggiunte solo per oggi, bozza che sopravvive alle chiusure, scorciatoie da tastiera.
- **Programma** (`programma`): attività, target, criterio, modalità, condizioni, set numerati, stampa delle griglie A4, programmi di gruppo.
- **Cartella** (`cartella`): Giornate (chi ha svolto, prove, percentuale), Attività (scheda con andamento), Comportamenti; solo lettura.
- **Grafici** (`grafici`): percentuali, celeration chart (SCC), viste dei programmi (target nel tempo, acquisiti, sedute al criterio), comportamenti.
- **Diario** (`diario`), **classifica/riordino modalità** (`classifica`), **import dei quaderni Numbers** (`import`).
- **Account e sincronizzazione, persone e accessi, versioni precedenti, materiali condivisi, dispositivi** (viste di `js/tice-centro.js`).
- Menu: aspetto «quaderno» o «classico», tema, schermo intero, giochi e archivio set (le funzioni dell'app personale).
- Versione semplificata per le **tirocinanti** (`limitato()`): presa dati, giochi, cartella in sola lettura.

---

## 2. Architettura

Nessun bundler per il codice dell'app: sono script classici caricati da `index.html` (`build.js` copia i file in `www/`, scrive nel `sw.js` versione ed elenco dei file e, con `TICE_CSP=1`, aggiunge la Content Security Policy). Quindi:
- **un file nuovo va aggiunto a `index.html`** nel punto giusto dell'ordine;
- `tools/test-tutti.sh` controlla la sintassi con `node --check` su `js/tice-*.js` (e altri), quindi i file `js/tice-*.js` nuovi sono coperti.

### Ordine di caricamento (da `index.html`, dopo l'app personale)

1. App personale: `orario.js`, `db.js`, `state.js`, `patients.js`, `dataviz.js`, `dataviz-extra.js`, `dataviz-tice.js`, `scc.js`, `scc-grafico.js`, `scc-viz.js`, `editor.js`, … `game-modes.js`, `backup.js`, sincronizzazioni dirette, `nvidia/gemini/pollinations`, poi `app.js`.
2. `tice-config.js` (`window.TICE_CONFIG`: `custodeUrl`, `googleClientId`, `googleDesktopClientId`, `dev`; nessuno è segreto).
3. Moduli **puri** (UMD, provabili in Node, niente DOM): `numbers-reader.js`, `tice-import.js`, `tice-modalita.js`, `tice-stampa.js`, `tice-programma.js`, `tice-cifra.js`, `tice-unisci.js`, `tice-comportamenti.js`, `tice-note.js`; `tice-gioco.js`, `tice-azioni.js` e `tice-intensive.js` sono puri ma si caricano **prima di `app.js`** (li usa il gioco).
4. `tice-sync.js` (motore di sincronizzazione, espone `window.TiceSync`), `tice-morph.js` (`window.TiceMorph`).
5. **`tice-home.js`** (nucleo, espone `window.TiceHome`), poi i suoi moduli, **in quest'ordine**: `tice-home-comportamenti`, `-correzioni`, `-grafici`, `-tastiera`, `-modalita`, `-import`, `-classifica`, `-modulo-attivita`, `-programma`, `-salvataggio`, `-giochi`.
6. Estensioni di schermata: `tice-diario.js`, `tice-cartella.js`, `tice-centro.js`, `tice-turni.js` (dati, puro), `tice-turni-vista.js` (schermata), `tice-pallino.js`, `tice-pwa.js`, infine `firebase-sync.js`.

CSS in `index.html`: `styles.css` (app personale), `tice.css`, font Taccuino, `taccuino.css` (temi), `tice-quaderno.css` (aspetto «quaderno»), `scc.css`.

### Ruolo dei file principali

| File | Ruolo |
|---|---|
| `js/tice-home.js` (~1950 righe) | Nucleo: stato `T`, modello HTML (`h`, `grezzo`, `icona`, escape automatico), `foglio` (finestre), `conferma`, `avviso`, `barra`, bozza della seduta, vista bambini e seduta, `disegna`, `azioni` (gestori dei `data-a`), cronologia «indietro» (`agganciaIndietro`), `avvia`. |
| `js/tice-home-*.js` | Pezzi spostati fuori dal nucleo: comportamenti (striscia, foglio, sezione), correzione dati a posteriori, grafici, tastiera di seduta, modalità, import, riordino modalità, modulo attività e target, programma, salvataggio e fine seduta. |
| `js/tice-programma.js` | Programma, attività, target, criterio, `seduta(...)` (crea la voce di `history`), task analysis, time delay. Puro. |
| `js/tice-gioco.js` / `js/tice-home-giochi.js` | Giochi con **più set insieme** (`setIds` nel target, `unisciSet`, `dettaglio` per set e per stimolo) e **gioco avviato direttamente** (la seduta salvata dal gioco entra nella bozza di oggi come attività una tantum, `aggiungiInBozza`/`applicaGioco`). Il primo è puro; il secondo ha il gancio su `DB.savePatient`, l'avviso con «Apri» e la scheda del risultato in seduta. Vedi la sezione «Giochi» più sotto. |
| `js/tice-intensive.js` | «Intensive tact»: coda degli stimoli con riproposizione dei non autonomi, quattro risposte (✓/E+/E-/✗), annulla, altro giro, riepilogo per stimolo e per set. Puro, caricato prima di `app.js`. Vedi «Giochi» → «Intensive tact». |
| `js/tice-azioni.js` | «Chi lo fa?» e «Cosa fa?»: gruppi per azione/soggetto, mazzo dei bersagli, field, dettaglio per stimolo e per set. Puro, caricato prima di `app.js`. Vedi «Giochi» → «Chi lo fa?». |
| `js/tice-data.js` | La data delle voci: `quando(giorno, ora)` (il momento da scrivere in una seduta salvata: ora reale solo se il giorno è oggi, altrimenti l'ora scelta o le 12:00), `spostaVoce`, `spostaGiornata` (voci, episodi dei comportamenti, note, `dailyNotes`, tabelle importate; con `annulla()`), `contenuto`. Puro, provato in `tools/test-tice-data.js`. Le voci senza `id` lo ricevono prima dello spostamento (`TiceUnisci.assegnaId`), altrimenti sull'altro dispositivo restano in doppio. |
| `js/tice-modalita.js` | Dizionario modalità/categorie/sinonimi (di serie + del centro). Puro. |
| `js/tice-comportamenti.js`, `js/tice-note.js` | Dati e calcoli di comportamenti e diario. Puri. |
| `js/tice-import.js`, `js/numbers-reader.js` | Lettura dei file `.numbers` e trasformazione in programma e sedute. Puri. |
| `js/tice-stampa.js` | Griglie A4 da stampare. Puro. |
| `js/tice-turni.js` / `js/tice-turni-vista.js` | Dati dei turni (settimane, settimana tipo, conflitti) / schermata. |
| `js/tice-cifra.js` | Frase del centro, PBKDF2, AES-GCM, coppia RSA per consegnare la chiave ai dispositivi. |
| `js/tice-unisci.js` | Fusione a tre vie di un bambino modificato su due dispositivi (`PER_ID`: `history`, `programma.attivita`, `programma.attivita.target`, `fasi`, `comportamenti`, `diario`). |
| `js/tice-sync.js` | Accesso Google (`Auth`), chiamate al custode, coda, ciclo di sincronizzazione, chiave, nomi delle persone, aule, turni, modalità. |
| `js/tice-centro.js` | Schermate di account, persone e accessi, versioni, materiali, dispositivi; chip e banner nella presa dati. |
| `js/tice-cartella.js`, `js/tice-diario.js` | Cartella del bambino e diario. |
| `js/tice-pallino.js` | Pallino di stato della sincronizzazione nella barra. |
| `js/tice-pwa.js`, `sw.js` | Installazione, offline, proposta «Aggiorna». |
| `js/db.js` | Wrapper IndexedDB dell'app (classe `DB`). |
| `js/app.js` | App personale: temi, giochi, scorciatoie generali, `staScrivendo`. |
| `electron/` | App desktop; `electron/accesso-google.js` per l'accesso dal browser di sistema (loopback + PKCE). |
| `custode/` | Il custode (sezione 4). |
| `tools/` | Test, custode finto, generazione icone e guida PDF (`tools/guida/`). |

### Come si estende `TiceHome`

`TiceHome` (in fondo a `tice-home.js`) espone `apri`, `chiudi`, `vai(vista, pid)`, `attuale()`, `ridisegna()`, `estendi(e)` e `strumenti`.

`TiceHome.estendi({ viste, azioni, cambi, aggancio })` fa quattro `Object.assign`:
- **`viste`**: `{ nomeVista: funzioneCheRestituisceHtml }` in `VISTE`. Il nucleo registra `bambini` e `seduta`; le altre (`turni`, `turni-modello`, `programma`, `cartella`, `diario`, `grafici`, `classifica`, `import`, `account`, `persone`, `versioni`, `materiali`, `dispositivi`) arrivano dai moduli. Si apre con `X.vai('nome', pid)`.
- **`azioni`**: `{ 'nome-azione': (elemento, evento) => ... }`. Un click su un elemento con `data-a="nome-azione"` dentro `#tice` chiama l'azione (`suClick`); un errore lanciato diventa un avviso rosso.
- **`cambi`**: gestori dei campi con `data-cambio` (usati dall'import e dalle scelte di modalità).
- **`aggancio`**: funzioni che il nucleo o altri moduli chiamano *al momento dell'uso* tramite `EST` (stesso oggetto di `strumenti.agganci`). Esempi: `puoProgrammi`, `limitato`, `banner`, `chip`, `nellAula`, `moduloAttivita`, `proponiProssimo`, `segnaScelta`, `striscia`, `noteSeduta`, `dopoVista`.

`TiceHome.strumenti` (alias `X` nei moduli) è la cassetta degli attrezzi condivisa: `h`, `grezzo`, `icona`, `esc`, `foglio`, `conferma`, `avviso`, `barra`, `testata`, `T` (stato), `paz`, `pazienti`, `pazientiAula`, `salvaPaziente`, `bozza`, `salvaBozza`, `formatoData`, `viste`, `disegna`, `vai`, … (l'elenco completo è nell'oggetto `strumenti` in fondo a `tice-home.js`).

Schema di un modulo nuovo:
```js
(function () {
  'use strict';
  if (!window.TiceHome) return;
  const X = TiceHome.strumenti;
  const { h, icona, foglio, paz, salvaPaziente, T } = X;   // solo ciò che esiste già al caricamento
  function vistaNuova() { return h`...`; }
  TiceHome.estendi({ viste: { nuova: vistaNuova }, azioni: { 'fai-x': async (el) => { /* ... */ } }, aggancio: { /* ... */ } });
})();
```
**Trappola dell'ordine**: un modulo può destrutturare da `X` solo ciò che i moduli caricati *prima* hanno già aggiunto (alcuni moduli fanno `Object.assign(X, funzioni)`, p. es. `tice-home-modulo-attivita.js`). Per le funzioni dei moduli successivi si usa `X.nome(...)` o `EST.nome(...)` al momento dell'uso, come fa `tice-home-import.js` con `X.statoModalita`.

Il nucleo usa le funzioni spostate con piccoli inoltri, per esempio `const moduloAttivita = (...a) => EST.moduloAttivita(...a);`.

### HTML con escape

`h` è un tag template: i valori interpolati sono sempre escapati, a meno che siano `grezzo(...)` (o un altro `h`/`icona`). Liste e `false/null` sono gestiti. Non concatenare mai stringhe con dati dell'utente dentro `innerHTML`.

### Rendering parziale: `TiceMorph`

`disegna()` (in `tice-home.js`) chiama la vista corrente e, se è la stessa schermata e lo stesso bambino, usa `TiceMorph.aggiorna(radice, html)` (riconcilia i nodi invece di `innerHTML`): così restano focus, testo digitato, scorrimento, `<details>` aperti, animazioni. Se il morph lancia un errore, il nucleo ridisegna da capo (`innerHTML` + `TiceMorph.segna`). Punti da ricordare:
- **Chiavi** per riordinare i figli: `id`, `data-att`, `data-pid`, `data-id`, `data-morph` (più tag e `data-a`). Dai a elementi ripetuti una di queste chiavi.
- **Contenitori riempiti da altro codice** dopo il disegno (grafici, SCC) non vanno toccati: `[data-grafici]`, `#tice-gis`, `[data-scc]`, **`[data-morph-salta]`**. Se il contenitore ha `data-morph-firma` e la firma cambia, viene rimontato (nodo nuovo e vuoto).
- Campi con il focus: `value`, `checked`, `selected` non si sovrascrivono.
- Interruttore: `localStorage.tice_morph = '0'` spegne il morph.
- `TiceHome.ridisegna()` durante un tocco o uno scorrimento (`T.tocco`) aspetta la fine del gesto (`T.ridisegnaDopo`, +700 ms): non chiamare `disegna()` direttamente da una sincronizzazione. Le tabelle che scorrono di lato devono avere una classe conosciuta da `disegna()` (`.tt-griglia-box`, `.tt-settimana`, `.grafici-bambini`, `.scc-carta`) o l'attributo `data-scorri`.

### Fogli, indietro, tastiera

- `foglio(contenuto, opzioni)` apre una finestra modale e restituisce una `Promise`; ogni foglio ha una voce nella cronologia del browser, così «indietro» lo chiude. Dalla schermata iniziale l'indietro non esce.
- Le scorciatoie vivono in `js/tice-home-tastiera.js` (seduta), `js/tice-cartella.js` e `js/app.js`; vedi sezione 8.

---

## 3. Modello dei dati

### Dove stanno

- **IndexedDB `StimolatoreLessicaleDB`** (`js/db.js`, `DB_VERSION` 5): store `sets`, `patients` (chiave `id`), `tagImages`. I bambini sono sempre qui; `state.patients` (in memoria) contiene gli stessi oggetti e il resto dell'app li usa: **si lavora sugli oggetti di `state.patients`**, non su copie (`salvaPaziente` in `tice-home.js` rimette l'oggetto nell'elenco dopo il salvataggio).
- **IndexedDB `tice-sync`** (solo `tice-sync.js`): store `pazienti` (`pid → { version, base }`, dove `base` è l'ultima copia sincronizzata, serve alla fusione) e `meta` (chiavi: `coda`, `io`, `cfg`, `persone`, `info`, `aulaDi`, `nuoviRiservati`, `modalita`). Ci sono anche il portachiavi della chiave del centro e la coppia RSA del dispositivo (gestiti da `tice-cifra.js`, chiave non esportabile sui dispositivi non admin).
- **localStorage** (preferenze e bozze, mai dati che devono sopravvivere in modo sicuro): `tice_bozza_<idBambino>` (bozza della seduta), `tice_stile` (`quaderno`/`classico`), `tice_morph`, `tice_operatore`, `tice_operatore_email`, `tice_aula`, `tice_aula_tutte`, `tice_modalita` (dizionario locale), `tice_etichette` (etichette del diario locali), `tice_turni`, `tice_turni_taglio`, `tice:token`, `tice:utente`, `tice:sessione` (accesso). `sessionStorage`: `tice_lancio`.
- Sul custode (Drive): vedi sezione 4.

### Il bambino (`patient`)

Oggetto con i campi dell'app personale più quelli del Centro:
- `id`, `name`, `category`.
- **`history`**: array di sedute. Ogni seduta (creata da `TiceProgramma.seduta`): `id` (`sx_…`), `date` (ISO), `setId`, `setName` («Attività · Target»), `setCat`, `mode` (`'quaderno'`, `'quaderno_task'` con `taskSteps`, o il modo di un gioco), `correct`, `prompts`, `total`, `percentage`, `sessionType` (`independent`|`timedelay`), `timeDelaySeconds?`, `rawV/rawP/rawX`, `attivitaId`, `targetId`, `fonte`, `sequenza?`, `operatore` (stringa, più persone separate da « + »), **`operatoriEmail`** (array di email, parallelo ai nomi), `misura/misuraNome`, `mantenimento`/`fuoriStatistiche` (escluse dalle statistiche). Le voci dei comportamenti stanno qui con `mode: 'comportamento'`, `comportamentoId`, `episodi`, `durataSecondi`, `minutiOsservati`, `dettaglio[]`, `fuoriStatistiche: true`.
- **`programma.attivita[]`**: `{ id, nome, area, descrizione, suggerimenti, cronometro, sessionType, criterio:{soglia,sedute}, prove, stato: attivo|sospeso|terminato, target:[{ id, testo, stato: attivo|pianificato|criterio|repertorio|chiuso, inizio, fine, tdSeconds?, suggerimento?, passi?:[{id,testo}] }], … }` (più modalità, condizioni ✓/P/✗, field, prese dati multiple/`misure`, mantenimento: vedi il commento in testa a `js/tice-programma.js` e `moduloAttivita`).
- **`comportamenti[]`**: definizioni (`nome`, `definizione`, `misura: frequenza|durata`, `intensita`, `antecedenti`, `conseguenze`, `obiettivo`, `stato`); schema nel commento di `js/tice-comportamenti.js`.
- **`diario[]`**: `{ id (nt_…), data, il, testo, tag?, autore?, email?, operatoriEmail?, fissata?, modificato? }`; `diarioVisti` evita che paragrafi già passati rientrino. **`dailyNotes`** (un testo per giorno) è una *copia* riscritta dalle note (`TiceNote.allinea`) perché la cartella clinica vecchia e i report la leggono ancora: non scriverla a mano.
- `learnUnitStoriche` (tabelle «Frequenze»/«Learn unit giornaliere» importate), `gruppo` e `membri` (programmi di gruppo: `eGruppo(p)`).
- **Nome e aula**: `p.name` e `p.category` finiscono anche nella «etichetta» cifrata dell'elenco; l'**aula** non sta nel bambino ma nel record del custode (`aula`) e in `S.aulaDi[pid]`.
- **Bozza della seduta** (`localStorage tice_bozza_<pid>`): `{ pid, data, inizio, voci:{ chiave → {v,p,x,sequenza,operatore,targetId,sessionType,tdSeconds,esiti…} }, extra:[idAttività], temp:[attività solo per oggi], comp:{ idComportamento → {episodi, inCorso, nonOsservato} }, operatore, … }`. Chiavi di `voci`: `idAttività` oppure `idAttività~idPresa` (più prese dati nella stessa attività). Se la bozza è vuota viene cancellata (`salvaBozza`). `eliminaBozza` dopo il salvataggio.
- **Chi ha svolto**: nelle sedute, comportamenti e note si salva sia il nome (`operatore`/`autore`) sia l'email (`operatoriEmail`/`email`). La UI mostra sempre il **nome attuale** della persona risolto dall'email con `TiceSync.nomePersona`, `nomiSeduta`, `autoreNota` (i nomi nei dati sono copie vecchie). Al cambio di nome l'app propone di aggiornare anche il testo delle sedute passate (in `tice-centro.js`, funzioni che chiamano `sostituisciNome`).

### Echo to tact: E+ ed E-

Un'attività con `att.risposte === 'ecoico'` (anche una presa dati con `tipo: 'ecoico'`) ha quattro risposte: ✓ (tact da solo, `v`, sequenza `V`), **E+** (lo ripete in ecoico, salvato come P: `p`, `P`, `rawP`), **E-** (ecoico richiesto ma non ripetuto correttamente: `e`, `E`, **`rawE`**) e ✗ (`x`, `X`, `rawX`). E- è un dato **a parte**, non confluisce in E+ né in ✗.
- Bozza: la voce ha `e` (può mancare nelle bozze vecchie: si legge sempre `(v.e || 0)`; `segna` e `annullaUltima` creano il campo al volo). Sequenza con il carattere `E`.
- Seduta salvata (`TiceProgramma.seduta`): `rawE` **solo se > 0** (le sedute senza E- non hanno il campo, restano identiche a prima); `total` = ✓ + E+ + E- + ✗, `percentage` = ✓ / `total`, `correct` = ✓, `prompts` = E+. Le LU contano E- come prova (`contaRisposte` restituisce `{v,p,e,x}`, `dividiLU` lavora sulla sequenza); il criterio (`criterioRaggiunto`) usa `correct`/`total`, quindi E- è non corretta come le altre.
- Dove compare: tasti e sequenza in seduta (`.tasto.en`, `.sequenza i.E`, annulla), riepilogo «✓ 6 · E+ 2 · E- 1 · ✗ 1» (`riepilogoEco`, anche nel foglio di fine seduta), correzione a mano (campo `ecoNo` nel foglio «Correggi i dati»), condizioni (`condizioni.E`, campo «E- ecoica errata»), programma (anteprima del modulo attività), stampa (legenda e condizioni), cartella (pill `.cr-eco`, segmento `.cr-barra i.E`, dettaglio), grafici (`vizDailyData` → `e`; strato E- nell'«Indipendenza V/P/X» e nello stream), unione di sedute dello stesso giorno (`patients.js`) e fusione fra dispositivi (campo normale della seduta).
- Colore: `--t-e` in `css/tice.css` (viola, `--cat-5` del tema: chiaro e scuro); nel tema scuro il tasto ha testo d'inchiostro come gli altri.
- Limiti: nella celeration chart (tre serie V/P/X) E- è contata fra gli **errori**; nei grafici «prompt balance» E- non entra (è una non corretta non promptata); l'unico gioco che produce E- è l'**intensive tact** (vedi «Giochi»).
- **Come la cartella riconosce l'echo to tact:** `eEco(s, att)` in `tice-cartella.js` = attività collegata con `risposte === 'ecoico'`, oppure `s.rawE > 0`, oppure il marcatore **`s.risposte === 'ecoico'`** sulla voce di `history` (lo mettono l'intensive tact e le voci una tantum che ne derivano): così una seduta di gioco senza E- si legge «E+» e non «P». Anche i grafici (`vizDailyData` → `eco`, legenda «E+ (ecoica)») e `patients.js` seguono lo stesso criterio.

### Fusione fra dispositivi

Le liste con `id` si uniscono per id (nessuna seduta si perde; cancellata da una parte e non toccata dall'altra resta cancellata). Gli oggetti si uniscono chiave per chiave; se cambia da entrambe le parti vince chi sta salvando. **Se aggiungi un array di oggetti con `id` al bambino, aggiungilo a `PER_ID` in `js/tice-unisci.js`** e prova con `tools/test-tice-sync.js`, altrimenti due dispositivi si sovrascrivono.

---

### Data della seduta e correzioni di data

- La bozza ha `data` e, se scelte a mano, `scelta: true` (giorno non di oggi: la bozza si salva anche vuota e `bozza()` non la riporta a oggi) e `ora` ('HH:MM', facoltativa). `salvaSeduta` usa `TiceData.quando(b.data, b.ora)` per attività, comportamenti (anche gli orari degli episodi, in `TiceComportamenti.sedute`), giochi lanciati dalla seduta, note (`il`). Un gioco avviato direttamente con una seduta aperta per un altro giorno resta nella cartella con la data di oggi (avviso).
- Cartella: «Cambia data e ora» nel dettaglio della seduta, «Cambia data della giornata» (icona calendario) nella testata del giorno; conferma, «unisci» se nella data di arrivo ci sono già dati, «Annulla» nell'avviso. Ogni voce spostata ha in `correzioni` `{ campo: 'data', da, a, chi, il }`.
- Prove: `tools/test-tice-data.js` (logica e fusione fra due dispositivi), passi «seduta in un giorno passato» e «cartella» in `tools/test-app-browser.js`.

### Giochi: più set insieme e gioco avviato direttamente

- **Come funziona il collegamento attività ↔ gioco.** Un target del programma collegato a un set dell'archivio ha `setId` (e `mode`, la modalità di gioco; altrimenti `att.mode`). In seduta, «Somministra con l'app» (`lancia` in `tice-home.js`) apre il gioco con quel set e ricorda in `T.lancio` (anche in `sessionStorage`) attività e target; quando il gioco salva il bambino, `agganciaSalvataggi` (stesso file) mette `attivitaId`, `targetId`, `fonte: 'app-gioco'` sulle voci nuove della cronologia. I giochi (`js/app.js`, `js/game-modes.js`) salvano la seduta in `p.history` (`setId`, `setName`, `mode`, `rawV/rawP/rawX`, `itemDetails: [{label, result}]`; a scenari anche `setBreakdown`) e chiamano `DB.savePatient`.
- **Set separati / insieme.** Nel foglio «Nuovi target» (`moduloTarget`), con due o più set scelti compare «Set separati» (predefinito: un target per set, com'era) o «Set insieme»: un solo target con `setIds: [id…]`, `setId` = il primo (così il codice che guarda `setId` continua a funzionare), `testo` = nomi uniti da « + ». Lo stesso target si cambia dal menu del target («Set del target»). Funzioni: `P.setIdsDi(t)`, `P.setIdDi(t)` (`'multi_a_b'`, lo stesso id che usano le sedute a scenari), `TiceGioco.idsSet`. Alla partenza `lancia` chiama `loadSetsTogether(ids)` (`app.js`): gli stimoli dei set sono in un unico elenco (`state.items`, ognuno con `_setId/_setName/_setCat`), `state.activeSetId = 'multi_…'`, `state.mergedSets = [{id,name,cat}]` (da azzerare quando si sceglie un set solo, vedi `loadSelectedSet`, e se il gioco cambia e i set non sono più compatibili, vedi `filterSetsByMode`). Il gioco gira una volta sola (mescolato come sempre, tranne i giochi a scenari che vanno in sequenza); a fine gioco `_doSaveSession` salva **una** seduta con il totale unito, `setBreakdown` (per set) e `itemDetails` con `setId/setName` (per stimolo). Nei giochi a scenari i risultati hanno come chiave il segnaposto: `state.session.itemOrigin` lo collega alla scena (indice in `playItems`), e `_snapshotCurrentSetData` usa `TiceGioco.dettaglio(…, origini)`. I giochi con un proprio modo di salvare (memory, ran intensivo, pool da tag…) non producono il dettaglio per set.
- **Gioco avviato direttamente.** `tice-home-giochi.js` avvolge `DB.savePatient`: se il bambino è del Centro (`eDelCentro`: sincronizzazione attiva, oppure ha già un programma o sedute del programma; `localStorage.tice_gioco_in_seduta = '0'` lo spegne) e in `p.history` c'è una seduta appena salvata da un gioco (`TiceGioco.eSedutaGioco`: senza `id`, `attivitaId`, `fonte`; modalità non `quaderno*`/`comportamento`; di meno di un minuto fa), la toglie dallo storico **prima** del salvataggio e la mette **dopo** nella bozza di oggi (`aggiungiInBozza`): `b.temp` ha `{ id, nome: «Modalità – set», sessionType, fuori: true, daGioco: true }` e `b.voci[id] = { v, p, x, …, gioco: <la seduta del gioco> }`. `fuori: true` = «una tantum» di partenza, così alla chiusura non si chiede dove va. Se il salvataggio fallisce tutto torna com'era. Se la bozza è di un altro giorno, non si tocca e la seduta resta nella cartella. Niente doppioni: `TiceGioco.firma` (data, modalità, set, punti) è confrontata con le voci della bozza e con `giocoFirma` delle sedute già salvate. Avviso «Aggiunto alla seduta di oggi di …» con «Apri» (`avvisoConAzione`).
- **Modificarla.** Titolo e modalità (anche per le altre attività «solo oggi») nelle opzioni della voce (`nota-voce`); il tasto «Cambia» (`destinazione-temp`) riapre la finestra «Dove vanno questi dati?» (`destinazioneTemporanea` in `tice-home-salvataggio.js`): una tantum, unisci a un'attività, attività nuova. Alla chiusura `salvaSeduta` chiama `TiceGioco.applicaGioco(s, voce, conSetNelTarget)`: la seduta salvata (con `id` `sx_…`, nome, conteggi e operatore della seduta) riprende modalità di gioco, set e dettaglio; se i conteggi sono stati cambiati a mano il dettaglio per set e per stimolo decade (`dettaglioValido`). Le sedute una tantum di gioco (`fonte: 'app-gioco'`, senza `attivitaId`) compaiono nei «Dati fuori dal programma» e si correggono con `correggiDati` (che per loro non cambia la modalità di gioco). Se si unisce a un'attività che ha già risposte oggi, i conteggi si sommano e il dettaglio non si conserva. Le LU contate (`att.prove`) non conservano il dettaglio.
- **Dove si vede il dettaglio:** scheda della seduta in cartella (`foglioSeduta`, `dettaglioRisultatoGioco`), scheda in seduta (`dettaglioGioco`), cartella vecchia (`renderSetBreakdownCollapsible`, `renderSetStimuli` in `patients.js`).
- **Fusione fra dispositivi:** nessun nuovo elenco con `id` (`setIds` è un elenco di testi dentro il target, `setBreakdown`/`itemDetails` stanno dentro la seduta): `PER_ID` non cambia.
- Prove: `tools/test-tice-gioco.js` (logica), passi «giochi» in `tools/test-app-browser.js`.

### Giochi «Chi lo fa?» e «Cosa fa?» (azione × soggetto)

Per l'intraverbal con la stessa azione fatta da persone diverse. Due modalità (`chi_lo_fa`, `cosa_fa`; nomi «Chi lo fa?» e «Cosa fa?» in `BUILTIN_MODES` di `state.js`, quindi ovunque passi `getModeLabel`/`etichettaModo`: menu, cartella, grafici, elenco del modulo «Nuovi target»), stessi set, nessun nuovo tipo di dato.

- **Il soggetto.** Campo facoltativo `soggetto` dell'**immagine** (`item.soggetto`, testo libero: «nonno»); i tag esistenti sono del **set**, non dell'immagine, quindi non bastavano. Le immagini della stessa azione hanno la stessa `label` (6 × «bere»). Si assegna nell'editor del set (`js/editor.js`): un campo «Soggetto» sotto l'etichetta di ogni riga (con suggerimenti dei soggetti già usati) e il pannello **Soggetti** sopra l'elenco: caselle di selezione, «Assegna ai selezionati», **«Distribuisci per azione»** (si scrive «nonno, mamma, bambino» e la 1ª immagine di ogni azione prende il 1º soggetto, la 2ª il 2º…: 30 immagini in due gesti), «Seleziona senza soggetto», «Togli ai selezionati». Salvando un set che prima non aveva soggetti si aggiungono da sole le due modalità a `set.modes` (il Centro e `filterSetsByMode` leggono `modes`). Export/import, condivisione e sincronizzazione copiano gli item per intero; `mergeSets` (`backup.js`) abbina le immagini per etichetta **e soggetto** (n-esima con n-esima), altrimenti 6 «bere» si fonderebbero in una.
- **Logica pura:** `js/tice-azioni.js` (`TiceAzioni`, UMD, caricato prima di `app.js`): `preparaGruppi(items, modo)` (gruppi giocabili ≥ 2 opzioni, esclusioni con motivo, immagini senza soggetto), `bersagli`, mazzo (`nuovoMazzo`/`estrai`: ogni giro tutti i bersagli, mai lo stesso due volte di fila), `campo` (carte del field), `domanda`, `avvisi`, `riepilogo` (V/P/X, `itemDetails`, `setBreakdown`). Test: `tools/test-tice-azioni.js`.
- **Gioco:** `renderAzioneSoggetto` in `game-modes.js` (stato in `state._azSogg`). «Chi lo fa?»: esce un'azione, il field mostra le immagini di quell'azione (soggetti diversi, uno per soggetto), il bersaglio è una; «Cosa fa?»: esce un soggetto (solo immagini con soggetto), il field mostra le sue azioni diverse. Il **Field** (`num-stimuli`) è il numero di carte per turno (0 = tutte; oltre le disponibili si mostrano quelle disponibili, minimo 2); non taglia gli stimoli, per questo `startGame` salta lo sfoltimento. Chi somministra vede in alto una fascia tratteggiata con immagine bersaglio, domanda e **risposta attesa** (`.cf-operatore`, si nasconde con il tasto/scorciatoia «E» delle etichette); il bambino tocca una carta (si evidenzia, non segna) e si segna **V / X** (o **P** in time delay) con i pulsanti o i tasti v/x/p (`staScrivendo` li ferma mentre si scrive); dopo la risposta il turno passa al successivo (700 ms); **S** salta, **Ctrl+Z** annulla e riporta al turno appena segnato (`_azSoggUndone`). I turni non finiscono: si salva quando si vuole.
- **Cosa si salva** (`_doSaveSession`, ramo `chi_lo_fa`/`cosa_fa`): una seduta con `mode`, `setId`, totali V/P/X, `usesField: true`, `fieldSize`; `itemDetails` con la **coppia azione + soggetto** («bere · nonno», più `azione` e `soggetto`); con più set insieme anche `setId/setName` per stimolo e `setBreakdown` (calcolato da `TiceAzioni.riepilogo`, non da `TiceGioco.dettaglio`: le chiavi dei risultati sono `cf_<turno>`, non indici). Il gioco avviato direttamente entra nella seduta di oggi come per gli altri giochi (stesso `tice-home-giochi.js`).
- **Esclusioni e avvisi:** in «Cosa fa?» le immagini senza soggetto sono escluse; in «Chi lo fa?» si usano (risposta attesa «soggetto non assegnato»). Gruppi con una sola opzione (o sempre lo stesso soggetto/azione) sono scartati. Una fascia gialla chiudibile dice quante immagini e quali gruppi sono esclusi; se non resta nessun gruppo, la schermata lo spiega.
- **Limiti noti:** la domanda mostra l'azione come è scritta nell'etichetta («Chi lo fa: «bere»?»), senza coniugarla; il punteggio è sempre segnato da chi somministra (toccare la carta non assegna V/X); le modalità non hanno una variante a scene né un ordine fisso (il mazzo è sempre mescolato).
- Prove: `tools/test-tice-azioni.js` (logica), passi «Chi lo fa? / Cosa fa?» in `tools/test-app-browser.js` (editor del soggetto, entrambe le modalità, field, annulla, salvataggio in cartella, più set, «Somministra con l'app», gioco diretto → seduta di oggi, telefono).

### Gioco «Intensive tact» (tact con ✓ / E+ / E- / ✗)

Modalità `intensive_tact` («Intensive tact» in `BUILTIN_MODES`, quindi ovunque passi `getModeLabel`/`etichettaModo`; nel menu sta dopo «TACT»). È il tact (stimolo mostrato, chi somministra segna) con i **quattro dati dell'echo to tact** e gli stimoli non autonomi che tornano.
- **Disponibilità:** vale per tutti i set che hanno `tact` in `modes`, **anche già salvati**, senza risalvarli: `TiceGioco.modiDelSet(modes)` aggiunge le modalità *derivate* (`DERIVATE = { intensive_tact: 'tact' }`) ed è usato da `filterSetsByMode` e dal conteggio del menu (`app.js`), da `modiDi`/`modoPerSet`/`adatto` del modulo attività (`tice-home-modulo-attivita.js`, quindi anche «Nuovi target» e l'abbinamento ai set). L'editor del set **non** mostra la casella (è derivata). Per un'altra modalità derivata basta una riga in `DERIVATE`. Nel dizionario del centro (`tice-modalita.js`) è un gioco della modalità Tact; per i grafici sta nel costrutto «Denominazione» (`VIZ_CONSTRUCTS`).
- **Uso:** quattro tasti grandi sopra la carta (✓ Autonoma, E+ Ecoica, E- Eco errata, ✗ Errata; sopra, non sotto, perché in basso a destra c'è la pila dei pulsanti fluttuanti), contatore «✓ n · E+ n · E- n · ✗ n», giro e prova. Scorciatoie: `1` o `V` ✓, `2` o `P` E+, `3` o `E` E-, `4` o `X` ✗, **Ctrl+Z** annulla (riporta lo stimolo a schermo); non agiscono mentre si scrive (`staScrivendo`, controllato per primo in `handleShortcuts`); per questa modalità `E` non nasconde le etichette (resta il pulsante delle etichette). I tasti globali V/X/P e il selettore «Tipo» (indipendente / time delay) sono nascosti: non c'è time delay.
- **Opzioni:** Field, ordine casuale e griglia come il tact (stesso sfoltimento in `startGame`). «**Ripresenta i non autonomi**» (interruttore nella barra, attivo di partenza, ricordato in `localStorage.it_ripresenta`): ogni E+, E- o ✗ rimette lo stimolo **in fondo alla coda del giro**; il giro finisce quando tutti sono ✓ (con l'opzione spenta, dopo una sola passata). Cambiarla a metà vale dalla prova dopo. A fine giro compare «Tutti gli stimoli sono autonomi» / «Giro completato» con «Altro giro» (tutti gli stimoli rimescolati, punteggio tenuto); non c'è un tasto «salta».
- **Stato e logica:** `state._intTact = { S, items, timer, bloccato, feedback }`; `S` è lo stato puro di `TiceIntensive` (`crea`, `segna`, `annulla`, `nuovoGiro`, `conta`, `riepilogo`). Ogni risposta è una prova con chiave `it_<n>` in `state.session.itemResults` (valori `true`, `'prompt'` = E+, **`'echo_no'` = E-**, `false`) e in `scoreHistory`, quindi l'annulla generico (`undoLastAction`) funziona e chiama `_intTactUndone`. Dopo ogni risposta il tasto si blocca 350 ms (feedback colorato sulla carta, `.feedback-echo-no` per E-) e passa lo stimolo dopo: un doppio tocco conta una volta. `recordResponse` ha il ramo `intensive_tact`; i conteggi della sessione (`correct`, `prompts`, `echoNo`, `incorrect`, `total`) li ricalcola `_aggiornaConteggiIntensive`.
- **Cosa si salva** (`_doSaveSession`): `mode: 'intensive_tact'`, `rawV`, `rawP` (= E+), **`rawE` solo se > 0**, `rawX`, `total` = tutte le prove (E- compreso), `correct` = ✓, `percentage` = ✓/prove, `sessionType: 'independent'`, **`risposte: 'ecoico'`** (marcatore: la cartella lo legge anche senza E-), **`sequenza`** («XEPVV»: V, P = E+, E = E-, X, in ordine di prova), `itemDetails` **uno per stimolo** nell'ordine di comparsa `{ label, result, risposte: 'XEV', prove: 3 }` (`result` è la prima risposta, E- vale errore, così le analisi per parola — `vizItemStats` — leggono un dato per stimolo; la sequenza completa è in `risposte`), con più set insieme anche `setId/setName` per stimolo e `setBreakdown` per set `{ correct, prompts (E+), echoNo (E-), incorrect, total, percentage }`. Il blocco generico `TiceGioco.dettaglio` per più set è saltato per questa modalità (le chiavi `it_n` non sono indici).
- **Gioco diretto → seduta di oggi:** `TiceGioco.voceDaSeduta` porta anche `e` e la `sequenza`; `aggiungiInBozza` mette `risposte: 'ecoico'` sull'attività una tantum (`eEcoico(s)`: marcatore o `rawE > 0`), così la scheda ha i quattro tasti, il riepilogo «✓ · E+ · E- · ✗», la sequenza con gli E- e il campo «E- ecoiche errate» nelle correzioni. `dettaglioValido` e `firma` considerano anche `rawE`. Alla chiusura (`salvaSeduta`, ramo `temporanea`) la voce una tantum riprende `risposte: 'ecoico'` e `applicaGioco` rimette modalità, set e dettaglio; se si sceglie «Attività nuova» il modulo parte già come echo to tact. Da un target collegato con «Somministra con l'app» la seduta entra nel target come per gli altri giochi (`attivitaId`/`targetId`, `rawE` e marcatore conservati).
- **Dove si vede:** cartella (pill «✓ · E+ · E- · ✗», barretta con il segmento E-, scheda con i chip per stimolo «✗ E- ✓» e la sequenza a pallini con le sigle: lo stile di `.tice-foglio .sequenza` è nuovo, la finestra sta fuori da `.tice`), cartella vecchia (`patients.js`: «E+», sequenza nei chip degli sbagliati), grafici (E+ ed E- nelle distribuzioni, legenda «E+ (ecoica)»), «gioca con: …» e menu.
- **Stile:** `.it-*` in `css/styles.css` (E- = `--cat-5` del tema, come `--t-e` nel Centro; tema `taccuino-scuro` con testo d'inchiostro in `css/taccuino.css`); tasti ≥ 72 px, a quattro colonne anche su telefono.
- **Limiti:** nessun time delay né tasto «salta»; il dettaglio per stimolo ha come `result` la sola prima risposta (la sequenza completa è in `risposte`); se un gioco intensive tact viene unito a un'attività non echo to tact il marcatore resta sulla seduta (la cartella la mostra comunque con E+ ed E-) ma la scheda in seduta usa i tasti dell'attività; se si spegne la riproposizione dopo qualche prova, quelle già date non rientrano; non c'è una casella per spegnere la modalità su un singolo set (è derivata dal tact); la celeration chart conta E- fra gli errori (vedi «Echo to tact»).
- Prove: `tools/test-tice-intensive.js` (coda, E+/E-/✗, annulla, altro giro, riepilogo, più set, gioco → bozza → seduta, modalità derivate; in `test-tutti.sh`) e il passo «Intensive tact» in `tools/test-app-browser.js` (tasti e scorciatoie, annulla, non agisce mentre si scrive, opzione, altro giro, salvataggio, cartella, grafici, più set, gioco diretto → seduta di oggi → seduta chiusa, target collegato, telefono e tablet chiaro/scuro).

### Collegare attività e target ai set e al gioco (anche a posteriori)

- **Principio**: i target si chiamano come si vuole («Set 1», a mano, task analysis); il collegamento a un set dell'archivio e a un gioco è **in aggiunta** e non cambia mai `t.testo`. In programma, accanto al target compare «gioca con: <set>». Si può fare in qualsiasi momento, anche su attività con sedute.
- **Dove**: (1) riquadro «Gioco» in `moduloAttivita` (nuova e modifica): tendina `g_modo` = `att.mode`; nella nuova attività la spunta `g_collega` apre l'abbinamento subito dopo il salvataggio, nella modifica il tasto `data-g-collega` lo apre senza chiudere il modulo; (2) tasto «Gioco e set n/m» nella scheda dell'attività (`collega-set`); (3) menu del target: «Collega a un set del gioco» (senza set) o «Set del target» (cambia, aggiungi set insieme, «Scollega»). Visibili con `puoProgrammi(p)` e non `limitato()`, senza modalità modifica.
- **Codice**: `js/tice-home-modulo-attivita.js`: `abbinaSet(p, att)` (foglio «Collega i target ai set», gioco comune, ricerca nel selettore, suggerimenti da confermare, «Usa tutti»), `scegliSet`, `cambiaSetTarget`, `collegaTarget`, `modoPerSet`, `elencoSet`/`agganciaElencoSet` (condivisi con `moduloTarget`). Logica pura in `js/tice-programma.js`: `collegaSet(p, att, t, ids, mode)`, `scollegaSet`, `suggerisciSet(testo, archivio, {categorie, esclusi})`.
- **Sedute**: collegando o scollegando, le sedute che il target riconosceva solo dal nome («Attività · Target», importate) o dal set prendono `targetId`, così `P.sedute` le trova sempre; `sedute()` riconosce anche «Attività · Target» di un target già collegato. Cambiano solo `setId`/`setIds`/`mode` del target (e `att.mode`): `tice-unisci.js` e sincronizzazione invariati.
- **Suggerimenti**: stesso nome, nome contenuto, o stesso numero finale (non confonde 1 con 10); il numero da solo richiede la categoria dei set già collegati nell'attività; a pari punti nessuna proposta. Mai applicati senza conferma.
- Prove: `tools/test-tice-collega.js` (logica) e il passo «collegare attività e target ai set» in `tools/test-app-browser.js`.

---

## 4. Sincronizzazione e custode

### Idea

L'app lavora sempre sul database locale. `tice-sync.js` cifra ogni bambino condiviso e lo manda al **custode** (Google Apps Script che gira con l'account del proprietario e scrive su un Drive condiviso). Il custode **non vede i dati**: riceve «buste» cifrate (gzip + AES-256-GCM con la chiave del centro, `aad` = `tice:paziente:<id>`), con pochi metadati in chiaro (id, versione, chi e quando, aula, riservato, condivisi). Gli utenti non accedono al Drive: entrano con Google (solo ID token) e il custode controlla ruolo e permessi a ogni richiesta (`utenteDa`, `puoIn`, `vede`).

### Chiave del centro e consegna ai dispositivi

- La **chiave del centro** è una frase di 25 caratteri generata dall'app (`TiceCifra.generaFrase`); la conoscono solo gli admin. Derivazione PBKDF2-SHA256 con sale in `_config/cifratura.json`.
- **Fasi** (`S.fase` in `tice-sync.js`): `spento` (nessun custode in config), `fuori` (non entrato), `chiave` (admin che deve inserire la frase), `attesa` (non-admin che aspetta la chiave), `pronto`.
- Un dispositivo nuovo crea una coppia RSA-OAEP e registra la parte pubblica (`dispositivo.registra`); un admin lo abilita cifrando la chiave per lui (`consegnaChiavi` → `dispositivi.abilita`); il dispositivo la ritira (`ottieniChiave` → `dispositivo.chiave`) come chiave **non esportabile** (gli admin la ricevono esportabile per poterla consegnare ad altri).
- Frequenza dei controlli: chi aspetta la chiave controlla ogni 5 secondi nei primi minuti, poi più di rado (`avviaCicli`); gli admin consegnano quando `io.inAttesa > 0` o ogni 10 minuti, e hanno il tasto «Consegna la chiave a chi la aspetta» (`consegnaOra`).
- Cambio della chiave: `cambiaChiave` ricifra tutto; il custode rifiuta i salvataggi con la chiave vecchia (`chiave-cambiata`). Revoca: a chi viene disattivato o scade, il custode cancella i suoi dispositivi (`revocaChiavi`) e l'app cancella i dati del centro (`cancellaDatiCentro`, dopo conferma con una seconda richiesta al custode).

### Aule, ruoli, proprietario

- Id dell'aula di partenza: `principale` (`AULA_BASE`, in app e custode). Senza aule configurate esiste solo quella e «niente cambia».
- **Ruoli per aula** (`PERMESSI` in `custode/core.js`): `admin`, `professionista`, `tirocinante`. Il ruolo si legge con `ruoloIn(u, aula)`; `puoIn(u, aula, permesso)` lancia `vietato`. Le app e i custodi precedenti alle aule usano il ruolo «più alto» (`ruoloPiuAlto`).
- Il **proprietario** (email dell'account su cui gira lo script, proprietà `PROPRIETARIO`, letta da `proprietario_()` in `Code.gs`) è sempre admin di tutte le aule, le crea e le vede tutte, e nessuno può chiuderlo fuori. La sua voce negli accessi vale **solo per il nome visualizzato**; un admin d'aula non la tocca (`unisciAccessiAdmin`). Gli admin d'aula vedono e gestiscono solo bambini, persone, dispositivi e turni delle loro aule (`accessiVisti`). Lo spostamento di un bambino fra aule (`paziente.aula`) lo fa chi amministra entrambe; l'app ha `spostaAula` e `spostaAule` (più bambini insieme).
- Bambini **riservati** («non dell'aula»): `riservato: true` e `condivisi: [email]`; li vede solo chi li ha creati e chi è in `condivisi` (`paziente.condivisione`).
- Turni: una busta per settimana in `Turni/<aula>/<lunedì>.json` (per l'aula base `Turni/<lunedì>.json`); le persone dei turni a parte.

### Chiamate principali (`azioni[...]` in `custode/core.js`)

`io`, `sincronizza.stato`, `cifratura.leggi|imposta`, `dispositivo.registra|chiave|togli`, `dispositivi.elenco|abilita`, `pazienti.elenco|leggi`, `paziente.leggi|crea|salva|versioni|versione|archivia|condivisione|aula`, `materiali.*`, `modalita.leggi|aggiorna`, `turni.leggi|salva`, `persone.elenco`, `accessi.leggi|salva`, `manutenzione.ricostruisci`; `sessione.crea` (gettone di accesso lungo ~30 giorni, gestito in `gestisci`). Le richieste portano `v: 1`; alcune azioni sono «ripetibili» con un `rid` (la risposta si ricorda in cache per rispondere uguale a un reinvio dopo una risposta persa di Apps Script).

- **`io`** restituisce il profilo (`email`, `nome`, `ruolo`, `permessi`, `aule` con ruolo e permessi, `proprietario`, `scadenza`, `kid`, `cfg`, `inAttesa` solo per gli admin) e **`funzioni: ['riservati','aule','etichette','stato']`**: l'app guarda questa lista per sapere se il custode è aggiornato (`conAule`, `conRiservati`, etichette). Se aggiungi una funzione al custode che l'app deve poter rilevare, aggiungila qui.
- **`sincronizza.stato`**: un giro = una richiesta (profilo + elenco). L'elenco torna solo se l'impronta (`impronta(voci)`, che include id, versione, eliminato, aula, riservato, creatoDa, condivisi) è cambiata; il giro «niente di nuovo» è una risposta di poche righe. L'app (`sincronizza`) ha un ripiego se il custode è vecchio e non conosce l'azione (`statoUnico = false`).
- **`persone.elenco`** (con `aula` opzionale): nome ed email delle persone attive e non scadute che condividono almeno un'aula con chi chiede; il proprietario è sempre incluso. L'app lo tiene in cache (`meta 'persone'`) e **`TiceSync.nomePersona(email, ripiego)`** risolve sempre il nome attuale (un «nome» uguale all'email significa «nessun nome assegnato»; per l'utente corrente vale `S.io.nome`). Complementari: `emailDiNome`, `emailOperatori`, `nomiSeduta`, `autoreNota`, `aggiornaPersone`.
- **Conflitti**: `paziente.salva` porta `versioneBase`; se la versione sul custode è diversa risponde `conflitto` con il record attuale; `spingi` lo apre, unisce con `TiceUnisci.unisci(base, locale, remoto)`, salva in locale e riprova (fino a 4 volte).
- **Coda**: ogni salvataggio di un bambino condiviso va in `S.coda` (persistita in `meta 'coda'`) e parte entro pochi secondi; senza rete parte al ritorno (`online`). Se il bambino cambia di nuovo durante l'invio resta in coda. I giri periodici: ogni 90 s; in seduta e programma ogni ~20 s (`ultimoTira`); alla visibilità della pagina.
- **RAFFICA / versioni precedenti** (`archiviaVersione`): si tengono le ultime 20 versioni e l'ultima di ogni giorno per 60 giorni (`VERSIONI`). Salvataggi della stessa persona entro 30 minuti (`BOZZE_MS`) sostituiscono la versione precedente; entro 3 minuti (`RAFFICA_MS`) non si scrive nemmeno una nuova versione su Drive, per rendere veloci i salvataggi a raffica.
- **Scritture rimandate** (`Code.gs`, archivio su Drive): un salvataggio normale scrive su Drive solo il file del bambino (2 operazioni Drive). L'elenco dei bambini e l'indice delle versioni (file ricostruibili) si aggiornano subito nella cache e su Drive al massimo ogni 10 minuti, o dal risveglio (`smaltisci`); le proprietà dello script (`RINVIATI`) ricordano cosa su Drive è indietro, così se la cache si perde il custode ricostruisce invece di fidarsi di Drive. Le versioni superate da eliminare aspettano il risveglio (senza risveglio: fino a 30 in sospeso, poi si eliminano subito). Ogni risposta porta `ms` e `fasi` (attesa lucchetto, letture, scritture, cache, altro, conteggi, file più lenti), mostrate in «Velocità del custode › Dettagli». `tools/test-appsscript.js` conta le operazioni Drive per tipo.
- Cache del custode: Apps Script `CacheService` per accessi, chiave, elenco, dispositivi, materiali; la «generazione» cambia con `svuotaCache()`; `ricostruisciCache()` la svuota e ricostruisce l'elenco; `attivaRisveglio`/`disattivaRisveglio` gestiscono l'attivatore che tiene sveglio lo script (vedi `docs/configurazione.md`, «Un custode più pronto»).
- Limiti dimensionali e validazioni (`bustaV`, `MAX_PAZIENTE`, `MAX_TURNI`, `MAX_RISPOSTA`…) stanno in `core.js`: una risposta supera al massimo 8 MB e `pazienti.leggi` si ferma prima, l'app richiede il resto.

### Corsia veloce (Firestore, facoltativa)

Accanto al custode c'è una seconda strada in tempo reale su Firestore: `js/tice-veloce.js` (motore e backend, UMD), ganci in `tice-sync.js` (`TiceSync.interno`, `applicaLive`, pubblicazione dopo ogni invio riuscito, cicli diradati a 5 minuti), riga di stato e consegna chiave in `tice-centro.js`, regole in `firestore.rules`, copia degli accessi scritta dal custode (`copiaFirestore`, `specchia`, `riallinea` in `custode/core.js`; REST in `Code.gs`: `impostaFirebase`, `riallineaFirebase`, `disattivaFirebase`). Senza blocco `firebase` in `tice-config.js` (o con custode non aggiornato) non esiste e l'app è identica a prima. Dettagli e schema: `docs/firestore-progetto.md`; passi per l'utente: `docs/firebase.md`. Prove: `node tools/test-tice-veloce.js` (in `test-tutti.sh`, senza rete) e `sh tools/test-firebase.sh` (emulatori, serve Java; regole, custode vero e due browser; non è in `test-tutti.sh`).

### Come si aggiorna il custode

Il codice del custode è in due file sorgente:
- `custode/core.js`: **tutta la logica** (regole di sicurezza, nessun servizio Google; la stessa gira in locale nel mock).
- `custode/Code.gs`: collegamento a Google (Drive, LockService, UrlFetch, proprietà dello script, `doGet`/`doPost`).

`custode/custode-completo.gs` è **generato** da `node tools/componi-custode.js` (Code.gs + core.js in un file) e non si modifica a mano. `node tools/componi-custode.js --verifica` fallisce se non è aggiornato: lo fa anche `test-tutti.sh`, quindi **se modifichi `core.js` o `Code.gs` rigenera e committa `custode-completo.gs`**, altrimenti i test (e la pubblicazione) falliscono.

Passi per l'utente (l'assistente non può farli):
1. Apri il progetto su script.google.com e incolla il contenuto di `custode/custode-completo.gs` al posto del codice esistente; salva.
2. Distribuisci › Gestisci distribuzioni › modifica (matita) › Versione: **Nuova versione** › Distribuisci. L'URL `/exec` resta lo stesso, l'app non va toccata.
3. Si controlla aprendo l'URL `/exec` nel browser (mostra `versione` e `configurato`).

**Regola di lavoro: ogni volta che cambi il custode ricordalo all'utente, in modo chiaro, a fine risposta** (e scrivi cosa cambia per lui). Le app nuove devono funzionare anche con un custode non ancora aggiornato quando possibile (vedi `statoUnico`, `io.funzioni`) e dire chiaramente quando una funzione richiede l'aggiornamento (es. etichette condivise: «per condividerle va aggiornato il custode del centro»).

**Backup**: `custode/backup/` contiene il custode com'era *prima delle aule* (`core-prima-delle-aule.js`, `custode-completo-prima-delle-aule.gs`, istruzioni in `LEGGIMI.md`). Prima di una modifica rischiosa al custode metti lì una copia analoga con una nota su cosa si perde tornando indietro. I dati salvati non cambiano formato in modo irreversibile.

Script properties dello script (non committare i valori): `CARTELLA_RADICE`, `GOOGLE_CLIENT_ID`, opzionale `GOOGLE_CLIENT_ID_DESKTOP`, `PROPRIETARIO` (scritta da `proprietario_()`).

### Prova in locale

`tools/custode-mock.js` usa la stessa `core.js` con file su disco. Per provare su due dispositivi senza Google:
```
node tools/custode-mock.js --dev --porta 8799 --dati <cartella> --proprietario <email-di-prova>
```
Serve anche l'app (`--statico`, di serie la radice del repository) con un `tice-config.js` generato che punta al mock, su `http://localhost:8799/`. Con `--dev` l'accesso è finto («Accedi come…»): apri due finestre/profili del browser per fare due dispositivi. `--guasti 0.3` perde a caso il 30% delle risposte (simula Apps Script). Usa solo email di prova e una cartella dati fuori dal repository (`.custode-dati/` è in `.gitignore`).

---

## 5. Test e verifica

(`tools/test-tice-eco.js`: E- nelle sedute, LU, criterio, unione, SCC; è in `test-tutti.sh`. Il flusso nel browser è in fondo a `tools/test-app-browser.js`.)

- **Tutti i test** (gli stessi della pubblicazione):
  ```
  NODE_PATH=/opt/node22/lib/node_modules sh tools/test-tutti.sh
  ```
  Esegue, nell'ordine: `componi-custode.js --verifica`, poi `tools/test-<nome>.js` per `custode`, `appsscript`, `tice-gioco`, `tice-azioni`, `tice-intensive`, `tice-note`, `tice-sync`, `accesso-desktop`, `tice-import`, `tice-modalita`, `tice-stampa`, `orario`, `tice-turni`, `tice-ta`, `tice-td`, `tice-lu`, `tice-comportamenti`, `scc`; infine `node --check` su `js/numbers-reader.js`, `js/tice-*.js`, `state.js`, `patients.js`, `dataviz.js`, `gemini.js`, `app.js`, `tice-config.js`, `sw.js`, `electron/*.js`. Si ferma al primo errore. (`test-numbers-reader.js` esiste ma non è nell'elenco.)
- **Prova nel browser** (Playwright + Chromium; salta se Playwright manca): `node tools/test-app-browser.js` (con `NODE_PATH=/opt/node22/lib/node_modules` nell'ambiente di sviluppo, dove usa Chromium da `/opt/pw-browsers`). Percorre nuovo bambino → attività → seduta (tastiera, comportamento, annulla) → salvataggio → nota e diario → grafici → cartella; fallisce su qualunque errore di pagina. Usa `tice-config.js` finto con custode vuoto. **Non è in `test-tutti.sh`**: gira in GitHub Actions nel job `browser` di `test-quaderno.yml` (non blocca la pubblicazione, ma avvisa). Eseguila a mano dopo modifiche alla UI.
- **Quando scrivere un test**: logica pura (`js/tice-*.js` UMD) e regole del custode → test Node; schermate → aggiungi un passo a `test-app-browser.js` se tocchi un percorso principale. I test del custode (`tools/test-custode.js`, ~770 righe) usano `tools/custode-mock.js` (`archivioSuDisco`) e verificano permessi, aule, conflitti, versioni, cifratura delle buste.
- Se modifichi la sintassi dell'app e non puoi lanciare il browser, almeno `node --check` sui file toccati.
- Il job `test` di `test-quaderno.yml` controlla anche che `node build.js` produca un `www/sw.js` con l'elenco dei file.

---

## 6. Pubblicazione

- Il sito è su **GitHub Pages**. Il workflow `.github/workflows/pages.yml` parte a ogni **push su `claude/quaderno-tice`** (e `main`), o a mano (`workflow_dispatch`, con campo `branch`). Passi: checkout → **`sh tools/test-tutti.sh`** (se un test fallisce *non si pubblica* e online resta la versione di prima) → `TICE_CSP=1 node build.js` (genera `www/`) → upload → `deploy-pages` con **due ripetizioni** (30 e 60 secondi) se GitHub risponde «No artifacts named github-pages».
- Il repository è stato **spostato a `StefanoNevePsy/centro-tice`**; l'indirizzo del sito è `https://stefanonevepsy.github.io/centro-tice/`. Nel checkout di lavoro `git remote -v` può ancora mostrare il vecchio nome `Ampliamento-Lessicale` (GitHub reindirizza). Sorgente di Pages: «GitHub Actions» (impostazione fatta una volta in Settings › Pages).
- `tools/pubblica-centro-tice.command`: doppio clic su Mac che lancia il workflow con `gh` su `StefanoNevePsy/centro-tice`.
- L'app installata si aggiorna da sola: il service worker scarica la versione nuova e `tice-pwa.js` mostra «Aggiorna».
- Altri workflow: `build.yml` e `android-tablet.yml` (installatori desktop e APK; l'APK non ha l'accesso al centro).
- Dopo aver verificato un lavoro richiesto, si committa e si fa push su `claude/quaderno-tice` (l'utente se lo aspetta: il push è la pubblicazione). Dopo il push conviene controllare che il workflow sia andato a buon fine.

---

## 7. Regole di lavoro con l'utente

- **Rispondi in italiano**, in modo chiaro e senza gergo; l'utente non è uno sviluppatore. Spiega l'effetto per chi usa l'app.
- **Mai committare** credenziali, token, passphrase, file Numbers clinici (`*.numbers`), JSON di import (`import-*.json`), cartelle dati del mock (`.custode-dati/`): sono in `.gitignore`, ma verifica con `git status` prima di ogni commit. Niente dati clinici veri nei test: bambini e nomi inventati.
- **La passphrase (frase) del centro non va mai passata in chat** né scritta in file, log o test. Per le prove usa la frase generata dal test o email di prova.
- `tice-config.js` contiene indirizzo del custode e Client ID Google: non sono segreti, ma non inserirvi altro.
- **Messaggi di commit**: in italiano, descrittivi (cosa cambia per chi usa l'app). Nessun identificativo di modello nel testo del commit, a parte le righe di attribuzione finali (`Co-Authored-By`, `Claude-Session`) indicate dalla configurazione della sessione. Commit e push fanno parte del flusso abituale: dopo aver verificato, si committa e si pubblica sul branch indicato.
- **Quando cambi il custode** (`custode/core.js` o `custode/Code.gs`): rigenera `custode/custode-completo.gs`, e **ricorda all'utente di aggiornare il custode** (incolla + Nuova versione).
- L'utente preferisce che il lavoro sia **orchestrato con agenti economici e verificato**: per attività ampie delega i pezzi a sotto-agenti di costo ridotto, poi **verifica tu** il risultato (test, lettura del diff, prova nel browser) prima di dire che è fatto.
- **Prima di cambiamenti estetici importanti mostra esempi o proposte** (anteprime, schermate, varianti) e aspetta il suo parere; i ritocchi piccoli si fanno direttamente.
- Sii onesto su ciò che non hai potuto provare (per esempio l'accesso Google vero o il custode su Apps Script, che non si provano in locale).
- Non toccare l'app personale (giochi, set, backup) senza motivo: il ramo la contiene ancora e l'utente la usa.

---

## 8. Stile UI, accessibilità, tastiera

### CSS

- `css/tice.css` (~1330 righe): tutto il Centro TICE; usa le variabili dei temi dell'app. Definisce i temi `tice` e `tice-scuro` (verde acqua, arancio, antracite) e le sezioni per schermata. Prefissi dei blocchi: `.tice-` (contenitore, barra, fogli, avvisi), `.tt-` (turni), `.cr-` (cartella), `.ma-` (modulo attività), `.gr-` (grafici), `.nt-` (note), `.comp-` (comportamenti), `.campo-` (campi di modulo). `.tice` imposta le variabili locali (`--t-v`, `--t-p`… per ✓/P/✗).
- `css/taccuino.css`: temi **`taccuino`** (carta, chiaro) e **`taccuino-scuro`** (inchiostro); variabili `--taccuino-carta`, `--taccuino-spot`, `--taccuino-retino`, `--taccuino-grana`, font `--f-display` (Gloock), `--f-testo` (Archivo), `--f-mano` (La Belle Aurore). **Il tema Taccuino è quello predefinito.**
- `css/tice-quaderno.css`: aspetto «quaderno», attivo solo con `:root[data-theme^="taccuino"][data-tice-stile="quaderno"]`. Prefisso `.tq-` (testata `tq-testata`, `tq-eti`, `tq-titolo`, `tq-timbro`). L'aspetto «classico» (`tice_stile`) torna come prima: ogni regola nuova del quaderno va dentro quel selettore, così il classico non cambia.
- Tema chiaro/scuro: l'attributo `data-theme` sulla radice; ogni componente nuovo va controllato in **entrambi** i temi. Usa le variabili (`--text-primary`, `--accent-color`, `--success-color`, `--danger-color`, `--warning-color`, `--ink-rgb`, `--cat-1…6`), mai colori fissi dove esiste una variabile. Verde/ocra/rosso solo per risposte e percentuali; i colori di categoria come evidenziatore, non come riempimento (`docs/DESIGN.md`).
- Bersagli di tocco ≥ 44 px (≥ 74 px per i tasti di risposta), testi dei grafici ≥ 12 px, contrasto AA.
- Lavora per telefono e computer: controlla il layout stretto (telefono) e largo. Il colore non è l'unica informazione.

### Accessibilità

- I fogli sono `role="dialog" aria-modal="true"`; gli avvisi `role="status"`/`aria-live="polite"` (errori `role="alert"`).
- Pulsanti con solo icona hanno `aria-label`; i tasti a due stati usano `aria-pressed`.
- Il morph conserva il focus: non rimontare un campo mentre si scrive.

### Scorciatoie da tastiera

- **Regola d'oro: mai mentre si scrive.** `window.staScrivendo(e)` (definita in `js/app.js`) è vera se il bersaglio, l'elemento attivo o un elemento del percorso dell'evento è `INPUT`, `TEXTAREA`, `SELECT` o modificabile (`contentEditable`, quindi anche gli editor delle note). Ogni gestore di tasti **deve** chiamarla per primo (lo fanno `tice-home-tastiera.js`, `tice-cartella.js`, `app.js`); in passato le lettere D, F, V, P, X, S, Z sparivano dal testo delle note.
- In seduta (`tice-home-tastiera.js`): `1/2/3` (o `V/P/X`) segnano sull'ultima attività toccata (in un'attività **Echo to tact** i tasti sono quattro: `1` ✓, `2` o `P` E+, `3` o `E` E-, `4` o `X` ✗) o sulla task analysis aperta; `Z` o Backspace annullano l'ultima risposta; `S` o `→` saltano il passo, `←` torna al passo prima; `Maiusc+1…9` toccano l'ennesimo comportamento problema. Non agiscono se c'è un foglio aperto (`.tice-foglio`), un modale o con Alt/Ctrl/Meta.
- L'ultima attività toccata è marcata `.da-tastiera` (`segnaScelta`).
- **Nel gioco** (`handleShortcuts` in `app.js`): V, X, P (in time delay), D (penna), F (schermo intero), L (blocco), E (etichette), S (salta, dove c'è), Ctrl+Z (annulla). Nell'**intensive tact** `1/2/3/4` e `V/P/E/X` segnano ✓/E+/E-/✗ e `E` non nasconde le etichette (vedi «Gioco Intensive tact»).
- Gesto o tasto «indietro» del telefono: vedi `agganciaIndietro` (voci di cronologia aggiunte al tocco).

---

## 9. Storia delle decisioni e problemi noti

### Decisioni importanti (in ordine grosso modo cronologico)

1. **Nasce come ramo dell'app personale**: le prime versioni aggiungono presa dati, programmi e import Numbers a un'app già completa; i dati restano compatibili con cartella clinica, grafici ed export vecchi (le sedute del programma sono voci `history` normali, `mode: 'quaderno'`).
2. **Cifratura end-to-end con custode cieco**: la chiave del centro non passa mai dal custode; consegna ai dispositivi con RSA non esportabile; revoca e cambio chiave. Decisione presa perché il Drive può essere letto da amministratori del dominio.
3. **Fusione nell'app, non nel custode** (il custode non legge i dati): `tice-unisci.js`, con la `base` memorizzata per dispositivo.
4. **Accesso**: solo ID token Google; sessione lunga rilasciata dal custode (~30 giorni); desktop con browser di sistema (loopback + PKCE); l'APK Android per ora senza accesso al centro (usare la PWA).
5. **Turni** come foglio fatto a mano: giornata con bambini in colonna, settimana tipo che si ripete, ore da 50 minuti con 10 di pausa nelle fasce; schermata iniziale = turni di oggi.
6. **Modalità e categorie del centro** (dizionario condiviso dal custode) per uniformare i nomi dei quaderni Numbers; «Procedura» al posto di «Variante».
7. **Più prese dati per attività**, sottoattività, field, condizioni ✓/P/✗, mantenimento fuori dalle statistiche, LU contate (le prove entrano nei dati a blocchi completi).
8. **Aspetto «quaderno»** (tema Taccuino, condiviso con PsyDiary) con il classico a portata di menu; poi aspetto quaderno esteso a tutta l'app.
9. **Aule** con ruoli per aula, bambini riservati; backup del custode prima delle aule (`custode/backup/`).
10. **Comportamenti problema** separati dalle sedute LU; **diario a voci** (due note dello stesso giorno non si sovrascrivono più); `dailyNotes` mantenuto come copia.
11. **Prestazioni di sincronizzazione**: `sincronizza.stato` in una richiesta, impronta dell'elenco, salvataggi a raffica senza nuove versioni su Drive, cache nel custode, risveglio periodico.
12. **Refactoring di `tice-home.js`** (due passi): comportamenti, correzioni, grafici, tastiera, modalità, import, classifica, modulo attività, programma, salvataggio in file `tice-home-*.js`; **ridisegno parziale** con `TiceMorph` (niente lampeggi, focus e scorrimento conservati).
13. **Cartella del bambino nuova** (Giornate/Attività/Comportamenti) che sostituisce l'apertura della vecchia cartella (raggiungibile da «Report, Excel e strumenti avanzati»).
14. **Nomi uniformi**: i dati salvano nome ed email di chi ha svolto/scritto; la UI mostra sempre il nome attuale (`nomePersona`); il proprietario può darsi un nome visualizzato.
15. **Pubblicazione solo se i test passano**, con tentativi ripetuti sul deploy e prova nel browser con tempi massimi.
16. **Indietro del telefono**: ogni schermata e ogni foglio sono voci vere della cronologia; dalla schermata iniziale non si esce.

### Problemi noti e idee aperte

- **Tre pagine di documentazione vecchie**: `docs/quaderno-tice.md` non descrive aule, riservati, comportamenti, diario a voci, cartella nuova, morph; `docs/configurazione.md` va riletto per le aule. Aggiornarli è un lavoro utile.
- **`tice-home.js` è ancora grande (~1950 righe)**: la vista bambini, la vista seduta, le azioni di base e il disegno stanno ancora lì. Un terzo passo di refactoring è possibile (stesso schema: file `tice-home-*.js` + `estendi`).
- **La prova nel browser non è in `test-tutti.sh`** e non blocca la pubblicazione (serve Playwright e scaricare Chromium, che a volte si blocca).
- **L'accesso Google vero e Apps Script non si provano in locale**: il mock verifica la logica (`core.js`), non i servizi Google (`Code.gs`; `tools/test-appsscript.js` prova solo il collegamento con servizi simulati).
- **APK Android senza accesso al centro** (serve il login nativo); l'app desktop richiede il client OAuth «App desktop».
- **Limite noto della cifratura**: chi ha l'accesso e conoscenze tecniche potrebbe estrarre la chiave dal browser; si chiude cambiando la chiave. Se si perdono tutte le copie della frase e tutti i dispositivi con la chiave, i dati sul Drive non si recuperano.
- **Il limite «le tirocinanti non modificano i programmi» lo applica l'app, non il custode** (il contenuto è cifrato).
- Dopo modifiche a mano ai file nel Drive il custode può usare copie in cache per qualche ora: `svuotaCache`.
- Le etichette del diario condivise e altre funzioni richiedono il custode aggiornato: finché non lo è, l'app salva sul dispositivo e lo dice.
- Idee citate o naturali da qui: terzo passo di refactoring, aggiornare la documentazione, estendere la prova nel browser a turni e persone, accesso nativo per Android.

---

## Lista di controllo prima di consegnare un lavoro

1. `NODE_PATH=/opt/node22/lib/node_modules sh tools/test-tutti.sh` passa.
2. Se hai toccato la UI: `node tools/test-app-browser.js` passa e hai guardato la schermata in tema chiaro e scuro, telefono e computer.
3. Se hai toccato il custode: `node tools/componi-custode.js` eseguito, `custode-completo.gs` incluso nel lavoro, e **l'utente è stato avvisato di aggiornare il custode**.
4. Nuovo file JS: aggiunto a `index.html` nel punto giusto dell'ordine.
5. Nuovo campo-lista del bambino con `id`: aggiunto a `PER_ID` in `js/tice-unisci.js` con un test.
6. `git status` senza credenziali, `.numbers`, `import-*.json`, `.custode-dati/`; nessun identificativo di modello nel messaggio di commit oltre alle righe di attribuzione.
7. Commit e push su `claude/quaderno-tice` solo dopo le verifiche; mai su altri branch.
