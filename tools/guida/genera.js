#!/usr/bin/env node
/**
 * Impagina la guida del Centro TICE in PDF, con le schermate vere dell'app.
 *
 *   node tools/guida/schermate.js <cartella>/img     (le schermate)
 *   python3 tools/guida/rifila.py <cartella>/img     (toglie il vuoto in fondo)
 *   node tools/guida/genera.js <cartella>            (→ <cartella>/guida-centro-tice.pdf)
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(process.argv[2] || 'guida');
const IMG = path.join(DIR, 'img');
const FONT = path.resolve(__dirname, '../../vendor/fonts');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const img = (n) => 'file://' + path.join(IMG, n + (fs.existsSync(path.join(IMG, n + '.jpg')) ? '.jpg' : '.png'));
const c = (s) => String(s);

// --- contenuto ----------------------------------------------------------------
// Ogni sezione: etichetta, titolo, testo (paragrafi o elenchi) e schermate con didascalia.
const SEZIONI = [
  { eti: '1 · La giornata', titolo: 'Il calendario di oggi', img: [['01-calendario', 'La schermata iniziale: chi viene oggi, a che ora e con chi.']],
    testo: `<p>Aprendo l'app trovi il <b>calendario della giornata</b>: una colonna per ogni bambino, una riga per ogni ora. Nelle celle ci sono le persone che seguono il bambino in quell'ora; le tirocinanti hanno il bordo tratteggiato.</p>
      <ul><li><b>Tocca il nome di un bambino</b> (o una sua cella) per aprire la sua seduta.</li>
      <li>Sotto il nome compare lo stato della seduta di oggi: <i>in corso</i> o <i>salvata</i> con l'ora.</li>
      <li>Con le frecce e i giorni della settimana guardi gli altri giorni; tocca la data in alto per sceglierne una qualsiasi.</li>
      <li><b>Apri un bambino</b>, in fondo, apre anche chi oggi non è in calendario.</li></ul>
      <p class="nota">Il calendario si guarda soltanto: toccandolo non si cambia niente. Per spostare i turni serve «Modifica turni».</p>` },
  { eti: '1 · La giornata', titolo: 'Modificare i turni', img: [['02-calendario-modifica', 'In modifica: il bordo tratteggiato e le persone da assegnare.']],
    testo: `<p>Tocca <b>Modifica turni</b>. La griglia prende un bordo tratteggiato e compaiono le persone.</p>
      <ul><li><b>Assegna veloce</b>: scegli una persona (o due) e tocca le celle; un secondo tocco la toglie.</li>
      <li>Oppure tocca una cella per scegliere chi, con una nota (es. «piscina»).</li>
      <li>In fondo: <b>Settimana tipo</b>, <b>Bambini del giorno</b>, <b>Copia / ripeti</b> (anche su più settimane: l'app avvisa quali giorni sostituisce), <b>Persone</b>, <b>Orari</b>.</li>
      <li>Le celle rosse segnalano un conflitto: la stessa persona con due bambini insieme.</li></ul>
      <p>Quando hai finito tocca <b>Fine modifiche</b>.</p>` },
  { eti: '1 · La giornata', titolo: 'La settimana tipo', img: [['03-settimana-tipo', 'Una riga per bambino, una colonna per giorno.'], ['04-orario-bambino', 'L\'orario di un bambino: inizio, ore da 50 minuti, persone.']],
    testo: `<p>È la settimana che si ripete: ogni giorno del calendario parte da qui. Si apre da <b>Modifica turni → Settimana tipo</b>.</p>
      <ul><li>Tocca un incrocio bambino/giorno per l'orario: scegli l'inizio toccando una delle fasce (14:10, 15:10…), quante ore e con chi di solito.</li>
      <li>Puoi applicarlo a più giorni insieme.</li>
      <li>Un cambio dell'ultimo minuto si fa sulla giornata e vale solo per quel giorno; dalla giornata puoi sempre <i>tornare alla settimana tipo</i>.</li></ul>` },
  { eti: '2 · I bambini', titolo: 'Tutti i bambini e il menu', img: [['05-elenco', 'L\'elenco: chi ha una seduta in corso è in cima.'], ['06-menu', 'Il menu ⋮.']],
    testo: `<p>L'icona dei due bambini in alto apre l'<b>elenco completo</b>, con la ricerca quando sono tanti. Da qui crei un <b>nuovo bambino</b> o un <b>gruppo</b>, o importi un quaderno Numbers.</p>
      <p>Nel <b>menu ⋮</b> trovi: giochi e attività dell'app, cartelle cliniche, categorie e modalità, materiali del centro, account e sincronizzazione, aspetto (quaderno o classico) e schermo.</p>
      <p class="nota">Un bambino può essere <b>dell'aula</b> (lo vedono gli amministratori e chi ci è assegnato) o <b>non dell'aula</b>: lo vedono solo chi l'ha creato e le persone con cui lo condivide. Si sceglie alla creazione o dalle opzioni del bambino, alla voce «Chi lo vede».</p>` },
  { eti: '3 · La seduta', titolo: 'La presa dati', img: [['10-seduta', 'La seduta di un bambino, con le attività raggruppate per area.']],
    testo: `<p>In alto il nome del bambino e la data: <b>toccala</b> per registrare una seduta di un altro giorno. Le attività sono raggruppate per area. Per ognuna:</p>
      <ul><li><b>Nome</b> dell'attività, con l'evidenziatore del suo colore;</li>
      <li>il <b>target in corso</b>, in grassetto: è il materiale da preparare (es. «Set 3»);</li>
      <li>la <b>modalità</b>, nell'etichetta colorata, e la <b>procedura</b> se c'è;</li>
      <li>a destra le prove per LU (icona e numero) o il simbolo % se il dato è in percentuale;</li>
      <li>pillole: T/D con i secondi, F3 (field: stimoli fra cui scegliere), mantenimento, criterio.</li></ul>
      <p>Tocca un'attività per aprirla.</p>` },
  { eti: '3 · La seduta', titolo: 'Segnare le risposte', img: [['11-seduta-tasti', 'Un\'attività in time delay: ✓ corretta e P promptata.'], ['13-task-analysis', 'Task analysis: un passo alla volta.']],
    testo: `<p>I tasti dipendono dal tipo di seduta:</p>
      <ul><li><b>Indipendente</b>: ✓ corretta e ✗ errata;</li><li><b>Time delay</b>: ✓ corretta e P promptata;</li><li><b>Echo to tact</b>: ✓, e+ ecoica, ✗.</li></ul>
      <p>Sotto i tasti si scrive la sequenza delle risposte, come sul foglio. ↶ annulla l'ultima, la matita apre la nota.</p>
      <p>Con le <b>LU a prove fisse</b> (es. 20) il dato entra quando se ne completano 20, anche in più sedute: le prove avanzate restano da parte e l'app lo scrive.</p>
      <p>Nella <b>task analysis</b> compare un passo alla volta: segni e si passa al successivo; finito l'ultimo si ricomincia.</p>` },
  { eti: '3 · La seduta', titolo: 'Sottoattività, condizioni e suggerimenti', img: [['12-sottoattivita', 'Due prese dati nella stessa attività, con le condizioni e i suggerimenti aperti.']],
    testo: `<p>Un'attività può avere più <b>sottoattività</b> (es. Riordina e Racconta): ognuna ha i suoi tasti e il suo dato e arriva a criterio per conto suo.</p>
      <p>Sotto i tasti compaiono le <b>condizioni</b>: cosa vale come ✓, P o ✗. Valgono quelle dell'attività, a meno che il target in corso o la sottoattività non ne abbiano di proprie.</p>
      <p>Le <b>caselle</b> si scrivono con la barra: <code>prima | poi | dopo</code> mette la parola sotto il quadratino, <code>[X] | [X]</code> la mette dentro.</p>
      <p>La lampadina apre i <b>suggerimenti</b> per chi somministra.</p>` },
  { eti: '3 · La seduta', titolo: 'Note, correzioni e fine seduta', img: [['14-nota', 'La nota di un\'attività e la correzione dei dati.'], ['15-fine-seduta', 'Fine seduta: il riepilogo e chi l\'ha svolta.']],
    testo: `<p>La <b>matita</b> di un'attività apre la sua nota, una decisione (es. «Passa a 2″ T/D», che aggiorna il programma) e chi l'ha svolta se diverso. In <b>Correggi i dati</b> si sistemano target, tipo e conteggi.</p>
      <p><b>Salva seduta</b> mostra il riepilogo, chi ha svolto la seduta (preso dal calendario) e le note del giorno. «Torna alla seduta» se manca ancora qualcosa.</p>
      <p class="nota">La seduta in corso resta salvata sul dispositivo anche se chiudi l'app: la ritrovi dove l'avevi lasciata.</p>` },
  { eti: '3 · La seduta', titolo: 'Seduta salvata e gruppi', img: [['16-timbro', 'Il timbro: la seduta è salvata.'], ['17-gruppo', 'Un gruppo: una riga per bambino.']],
    testo: `<p>Dopo il salvataggio compare il <b>timbro</b> con la data, e l'avviso dice se qualche LU è ancora in attesa di completarsi.</p>
      <p>Nei <b>gruppi</b> ogni attività ha una riga per bambino, con i suoi tasti. In alto si segna chi è presente oggi: gli assenti non vengono contati.</p>` },
  { eti: '4 · Il programma', titolo: 'Il programma del bambino', img: [['20-programma', 'Il programma: attività, target e il loro stato.']],
    testo: `<p>Si apre dalla seduta con l'icona dell'elenco in alto. Ogni attività mostra i suoi <b>target</b> in ordine: quello in corso, quelli già a criterio e quelli pianificati.</p>
      <ul><li><b>+ Target</b> aggiunge target in coda: non serve inserirli tutti subito.</li>
      <li>Quando un target arriva a criterio l'app propone di passare al successivo.</li>
      <li><b>Nuova attività</b> in cima; <b>Stampa le griglie</b> per prendere i dati su carta.</li></ul>` },
  { eti: '4 · Il programma', titolo: 'Creare un\'attività', img: [['21-nuova-attivita', 'Il modulo di una nuova attività.']],
    testo: `<p>Il modulo segue l'ordine di importanza:</p>
      <ol><li><b>Nome</b>: su che cosa si lavora (es. «Vestiti»).</li>
      <li><b>Target</b>, uno per riga: il primo è quello da cui si parte (es. Set 1, Set 2). Spuntando <i>È una task analysis</i> si scrivono invece il compito e i suoi passi.</li>
      <li><b>Modalità</b>: il tipo di attività (es. RAN, Tact), dall'elenco del centro.</li>
      <li><b>Procedura</b>, facoltativa: solo se cambia il modo (es. intensiva).</li>
      <li><b>Colore</b>, poi come si prende il dato: tipo di seduta, secondi di time delay, prove per LU (vuoto = percentuale), criterio, field, prompt visivo e cosa vale come ✓, P, ✗.</li></ol>
      <p class="nota">Le sottoattività e i suggerimenti sono più in basso, nelle sezioni che si aprono.</p>` },
  { eti: '4 · Il programma', titolo: 'Modalità e target', img: [['22-scelta-modalita', 'La scelta della modalità, con ricerca e categorie.'], ['23-menu-target', 'Il menu ⋯ di un target.']],
    testo: `<p>La <b>modalità</b> si sceglie da un foglio con la ricerca e i filtri per categoria. Con una categoria scelta e un nome scritto, «Aggiungi» la crea già lì.</p>
      <p>Il menu <b>⋯ di un target</b> serve a renderlo quello in corso, chiuderlo a criterio o in repertorio, collegarlo a un set dell'archivio (le sedute dei giochi finiscono nello stesso grafico), rinominarlo, trasformarlo in task analysis, dargli suggerimenti e condizioni proprie, spostarlo.</p>` },
  { eti: '4 · Il programma', titolo: 'Condizioni per target e categorie', img: [['24-condizioni-target', 'Le condizioni di un target: in grigio quelle dell\'attività.'], ['25-modalita', 'Categorie e modalità: tocca per rinominare, spostare, eliminare.']],
    testo: `<p>Un target può avere <b>condizioni proprie</b> (es. Tombola invece di Puzzle). Si scrive solo quello che cambia: le voci vuote restano quelle dell'attività, che compaiono in grigio.</p>
      <p>Da <b>menu ⋮ → Categorie e modalità</b> si vedono tutte; toccandone una si <b>rinomina</b>, si <b>sposta</b> in un'altra categoria o si <b>elimina</b> (solo se nessuna attività la usa). Le modifiche valgono per tutto il centro.</p>` },
  { eti: '5 · Su carta', titolo: 'Le griglie da stampare', wide: true, img: [['26-stampa', 'La griglia stampata: attività, target, condizioni e caselle per le prove.']],
    testo: `<p>Dal programma, <b>Stampa le griglie</b> prepara un foglio A4 con le attività del bambino, i target in corso e i successivi, il tipo (T/D, IND, ECO), il field, il prompt visivo e le condizioni, e una casella per ogni prova. I dati segnati a mano si ricopiano poi in seduta scegliendo la data.</p>` },
  { eti: '6 · I dati', titolo: 'La cartella clinica', img: [['30-cartella', 'La panoramica: numeri del periodo e learn unit giornaliere.'], ['31-giornate', 'Le giornate, con le note del giorno.']],
    testo: `<p>Si apre dall'icona del grafico, in seduta o nel programma. In alto le azioni sul bambino; sotto, cinque schede:</p>
      <ul><li><b>Panoramica</b>: sedute e learn unit del periodo, il grafico giornaliero e l'ultima seduta;</li>
      <li><b>Giornate</b>: giorno per giorno, con le note;</li><li><b>Attività</b>: la curva di ogni attività e target;</li>
      <li><b>Visual</b>: le visualizzazioni (sotto);</li><li><b>Diario</b>: le note cliniche.</li></ul>` },
  { eti: '6 · I dati', titolo: 'Le visualizzazioni dei programmi', img: [['32-visual', 'Target nel tempo.'], ['33-visual-criterio', 'Target acquisiti.']],
    testo: `<p>Nella scheda <b>Visual</b>, il gruppo <b>Programma</b>:</p>
      <ul><li><b>Target nel tempo</b>: una riga per target, da quando si apre a quando arriva a criterio (✓); i pallini sono le sedute, colorati per percentuale;</li>
      <li><b>Target acquisiti</b>: quanti target sono stati introdotti e quanti acquisiti nel tempo;</li>
      <li><b>Sedute al criterio</b>: quante sedute è servito a ogni target; se la linea scende, i nuovi target si imparano più in fretta.</li></ul>
      <p>Le altre visualizzazioni (calendario, curve, indipendenza V/P/X…) restano disponibili; il filtro in alto sceglie il periodo.</p>` },
];

const GLOSSARIO = [
  ['Attività', 'Su che cosa si lavora con il bambino (es. Vestiti, Sequenze temporali).'],
  ['Target', 'Il passo in corso dell\'attività: un set, un compito, un gruppo di stimoli. Arrivato a criterio, si passa al successivo.'],
  ['Modalità', 'Il tipo di attività (RAN, Tact, Mand…), dall\'elenco del centro; raggruppa le attività nelle statistiche.'],
  ['Procedura', 'Facoltativa: una forma particolare della stessa modalità (es. intensiva).'],
  ['LU', 'Learn unit: una prova. Con le prove fisse (es. 20) il dato entra quando se ne completano 20.'],
  ['Criterio', 'Percentuale e giorni di fila per considerare acquisito un target (es. 90% per 2 giorni).'],
  ['Field', 'Quanti stimoli si presentano fra cui scegliere (F3 = tre).'],
  ['Mantenimento', 'Il dato si prende ma resta fuori da statistiche e criterio.'],
];

// --- impaginazione ------------------------------------------------------------
const pagine = SEZIONI.map((s) => `
  <section class="pagina ${s.wide ? 'larga' : ''}">
    <div class="eti">${c(s.eti)}</div>
    <h2>${c(s.titolo)}</h2>
    <div class="corpo">
      <div class="testo">${s.testo}</div>
      <div class="schermate n${s.img.length}">${s.img.map(([n, d]) => `<figure><img src="${img(n)}"><figcaption>${d}</figcaption></figure>`).join('')}</div>
    </div>
  </section>`).join('');

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Centro TICE · Guida</title>
<style>
@font-face { font-family: 'Gloock'; src: url('file://${FONT}/gloock-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'Archivo'; font-weight: 100 900; font-stretch: 62% 125%; src: url('file://${FONT}/archivo-latin-wdth-normal.woff2') format('woff2'); }
@font-face { font-family: 'Mano'; src: url('file://${FONT}/la-belle-aurore-latin-400-normal.woff2') format('woff2'); }
@page { size: A4; margin: 14mm 14mm 16mm; }
:root { --carta: #f6f0e6; --ink: #1a2131; --ink2: #4f5563; --matita: rgba(26,33,49,.18); --spot: #c74a31; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 400 10.2pt/1.5 'Archivo', sans-serif; font-stretch: 97%; color: var(--ink); background: #fff; }
h1, h2 { font-family: 'Gloock', serif; font-weight: 400; letter-spacing: -.01em; margin: 0; }
.eti { font-size: 7.5pt; letter-spacing: .14em; text-transform: uppercase; font-weight: 600; color: var(--ink2); }
code { font-size: .92em; background: rgba(26,33,49,.06); padding: 0 3px; border-radius: 3px; }
b { font-weight: 650; }
.copertina { height: 262mm; display: flex; flex-direction: column; justify-content: space-between; background: var(--carta); margin: -14mm -14mm 0; padding: 30mm 22mm 24mm; page-break-after: always; }
.copertina h1 { font-size: 54pt; line-height: .98; margin-top: 6mm; }
.copertina .mano { font-family: 'Mano'; color: var(--spot); font-size: 26pt; margin-top: 4mm; }
.copertina .sotto { color: var(--ink2); max-width: 120mm; font-size: 11pt; }
.copertina ol { columns: 2; column-gap: 12mm; padding-left: 5mm; font-size: 10pt; margin: 0; }
.copertina ol li { margin: 1.5mm 0; }
.pagina { page-break-before: always; }
.pagina h2 { font-size: 24pt; line-height: 1.05; margin: 1mm 0 5mm; padding-bottom: 3mm; border-bottom: 1px solid var(--matita); }
.corpo { display: grid; grid-template-columns: 1fr auto; gap: 8mm; align-items: start; }
.larga .corpo { grid-template-columns: 1fr; }
.testo p { margin: 0 0 2.6mm; } .testo ul, .testo ol { margin: 0 0 3mm; padding-left: 5mm; } .testo li { margin: 0 0 1.4mm; }
.testo .nota { border: 1px dashed rgba(26,33,49,.35); border-radius: 3mm; padding: 2.5mm 3.5mm; position: relative; isolation: isolate; }
.testo .nota::before { content: ''; position: absolute; inset: 0; z-index: -1; opacity: .45; border-radius: inherit; background-image: radial-gradient(rgba(199,74,49,.5) .6px, transparent .8px); background-size: 3.2px 3.2px; }
.schermate { display: flex; gap: 5mm; align-items: flex-start; }
figure { margin: 0; width: 58mm; }
.n1 figure { width: 64mm; }
.larga figure { width: 100%; }
figure img { width: 100%; display: block; border-radius: 4mm; border: 1px solid var(--matita); box-shadow: 0 1.5mm 4mm -2mm rgba(26,33,49,.35); max-height: 205mm; object-fit: cover; object-position: top; }
.larga figure img { border-radius: 2mm; max-height: none; }
figcaption { font-size: 7.6pt; color: var(--ink2); margin-top: 2mm; line-height: 1.35; font-style: italic; }
.n2 { flex-direction: column; } .n2 figure { width: 58mm; } .n2 figure img { max-height: 98mm; }
.glossario { page-break-before: always; }
.glossario dl { display: grid; grid-template-columns: 34mm 1fr; gap: 3mm 6mm; margin: 0; }
.glossario dt { font-family: 'Gloock', serif; font-size: 13pt; } .glossario dd { margin: 0; padding-bottom: 3mm; border-bottom: 1px solid var(--matita); }
</style></head><body>
<section class="copertina">
  <div><div class="eti">Centro TICE · Guida per l'équipe</div><h1>La presa dati<br>del Centro TICE</h1><div class="mano">come si usa, schermata per schermata</div></div>
  <p class="sotto">Tutte le immagini vengono dall'app vera, con bambini e dati inventati. L'app si apre su telefono, tablet o computer all'indirizzo <b>stefanonevepsy.github.io/centro-tice</b> e si può installare come un'applicazione.</p>
  <ol>${SEZIONI.map((s) => `<li>${s.titolo}</li>`).join('')}<li>Le parole dell'app</li></ol>
</section>
${pagine}
<section class="glossario"><div class="eti">7 · In breve</div><h2 style="font-size:24pt;margin:1mm 0 6mm;padding-bottom:3mm;border-bottom:1px solid var(--matita)">Le parole dell'app</h2>
  <dl>${GLOSSARIO.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></section>
</body></html>`;

(async () => {
  const f = path.join(DIR, 'guida.html');
  fs.writeFileSync(f, html);
  const b = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.goto('file://' + f, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const out = path.join(DIR, 'guida-centro-tice.pdf');
  await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font:7pt Helvetica;color:#888;padding:0 14mm;display:flex;justify-content:space-between"><span>Centro TICE · Guida</span><span class="pageNumber"></span></div>',
    margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  await b.close();
  console.log('scritto', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
})();
