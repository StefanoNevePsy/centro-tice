/**
 * Centro TICE — i giochi avviati direttamente: il punteggio di una seduta salvata dal gioco, per un bambino del
 * Centro, entra nella bozza della seduta di oggi come attività «una tantum» (titolo proposto dal gioco e dai set),
 * modificabile come ogni altra attività di un giorno: titolo, modalità, dove va (resta una tantum, si unisce a
 * un'attività del programma o ne diventa una nuova, con la finestra di sempre «Dove vanno questi dati?»).
 * Le regole (riconoscere la seduta del gioco, non registrarla due volte, dettaglio per set e per stimolo) sono in
 * js/tice-gioco.js (puro, provato in Node); qui ci sono il gancio sul salvataggio, l'avviso e la scheda in seduta.
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, G = window.TiceGioco;
    if (!P || !G || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const EST = X.agganci;   // i punti di aggancio delle estensioni: si leggono al momento dell'uso
    const { h, grezzo, icona, T, paz, bozza, salvaBozza, oggi, etichettaModo } = X;

    // ---------- il bambino è del Centro? ----------
    // Del Centro: la sincronizzazione è attiva, oppure ha già un programma o sedute del programma. Gli altri
    // (bambini dell'app personale mai usati nel Centro) restano come prima: la seduta va nella cartella.
    function eDelCentro(p) {
        try { if (localStorage.getItem('tice_gioco_in_seduta') === '0') return false; } catch (e) { /* si resta nel predefinito */ }
        if (!p) return false;
        if (window.TiceSync && TiceSync.attivo && TiceSync.attivo()) return true;
        if (p.programma && Array.isArray(p.programma.attivita) && p.programma.attivita.length) return true;
        return (p.history || []).some((s) => s && s.attivitaId);
    }
    // La bozza aperta è di oggi (o vuota, e allora riparte da oggi): una seduta di un altro giorno non si tocca
    function bozzaDiOggi(p) { return bozza(p.id).data === oggi(); }

    // ---------- avviso con un tasto ----------
    let timerAvvisoAzione = null;
    function avvisoConAzione(testo, etichetta, azione) {
        document.querySelectorAll('.tice-avviso').forEach((x) => x.remove());
        const d = document.createElement('div');
        d.className = 'tice-avviso con-azione';
        d.setAttribute('role', 'status');
        d.setAttribute('aria-live', 'polite');
        const t = document.createElement('span');
        t.textContent = testo;
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = etichetta;
        b.addEventListener('click', () => { d.remove(); clearTimeout(timerAvvisoAzione); azione(); });
        d.appendChild(t); d.appendChild(b);
        document.body.appendChild(d);
        clearTimeout(timerAvvisoAzione);
        timerAvvisoAzione = setTimeout(() => d.remove(), 8000);
    }
    async function apriSeduta(pid, idAtt) {
        T.aperte[idAtt] = true;
        await TiceHome.apri();
        X.vai('seduta', pid);
    }

    // ---------- il gancio sul salvataggio ----------
    // Il gioco mette la seduta in p.history e salva il bambino. Se è una seduta di gioco appena fatta di un bambino del
    // Centro, la si toglie dallo storico PRIMA del salvataggio e la si mette nella bozza di oggi DOPO (se il salvataggio
    // fallisce, tutto torna com'era e il gioco mostra il suo errore).
    function agganciaSalvataggi() {
        if (typeof DB === 'undefined' || DB._ticeGioco || typeof DB.savePatient !== 'function') return;
        const originale = DB.savePatient.bind(DB);
        DB._ticeGioco = true;
        DB.savePatient = async function (p) {
            let spostate = [];
            let restaFuori = null;
            try {
                if (p && !T.salvandoQui && Array.isArray(p.history) && eDelCentro(p) && !bozzaDiOggi(p) && p.history.some((s) => G.eSedutaGioco(s))) restaFuori = bozza(p.id).data;
                if (p && !T.salvandoQui && Array.isArray(p.history) && eDelCentro(p) && bozzaDiOggi(p)) {
                    spostate = p.history.filter((s) => G.eSedutaGioco(s));
                    // sul posto: il gioco tiene il riferimento all'elenco (e lo usa se il salvataggio fallisce)
                    spostate.forEach((s) => p.history.splice(p.history.indexOf(s), 1));
                }
            } catch (e) { console.warn('Gioco in seduta', e); spostate = []; }
            let r;
            try { r = await originale(p); }
            catch (e) { spostate.forEach((s) => p.history.push(s)); throw e; }
            // c'è una seduta aperta per un altro giorno: il gioco resta nella cartella, con la data di oggi
            if (restaFuori) X.avviso('Gioco salvato nella cartella di oggi: la seduta aperta di ' + p.name + ' è del ' + X.formatoData(restaFuori) + '. Per cambiargli data, apri la cartella.');
            if (spostate.length) {
                try { registra(p, spostate); }
                catch (e) {
                    // non riuscito a metterle nella bozza: nella cartella, come prima, senza perdere niente
                    console.error(e);
                    spostate.forEach((s) => p.history.push(s));
                    await originale(p);
                }
            }
            return r;
        };
    }
    function registra(p, sedute) {
        const b = bozza(p.id), aggiunte = [];
        sedute.forEach((s) => {
            const r = G.aggiungiInBozza(b, p.history, s, P.nuovoId, etichettaModo);
            if (!r.doppione) aggiunte.push(r.id);
        });
        salvaBozza();
        if (!aggiunte.length) return;
        if (window.TiceHome) TiceHome.ridisegna();
        avvisoConAzione('Aggiunto alla seduta di oggi di ' + p.name, 'Apri', () => apriSeduta(p.id, aggiunte[0]));
    }

    // ---------- la scheda in seduta: com'è andato il gioco ----------
    const classeR = (r) => (r === true ? 'V' : r === 'prompt' ? 'P' : 'X');
    const simboloR = (r) => (r === true ? '✓' : r === 'prompt' ? 'P' : '✗');
    const nomeR = (r) => (r === true ? 'corretto' : r === 'prompt' ? 'con aiuto' : 'errato');
    // intensive tact: per stimolo la sequenza di tutte le risposte («XEV» → ✗ E- ✓), colorata come l'ultima
    const SIMB = { V: '✓', P: 'E+', E: 'E-', X: '✗' };
    const NOME_C = { V: 'autonoma', P: 'ecoica (E+)', E: 'ecoica errata (E-)', X: 'errata' };
    const sequenzaDi = (d) => String(d.risposte || '').split('').filter((c) => SIMB[c]);
    function stimoli(lista) {
        return h`<span class="gioco-stimoli">${lista.map((d) => {
            const seq = sequenzaDi(d);
            if (!seq.length) return h`<span class="gioco-chip ${classeR(d.result)}" title="${nomeR(d.result)}"><span class="gioco-r" aria-hidden="true">${simboloR(d.result)}</span>${d.label}</span>`;
            return h`<span class="gioco-chip ${seq[seq.length - 1]}" title="${'Risposte: ' + seq.map((c) => NOME_C[c]).join(', ')}"><span class="gioco-r" aria-hidden="true">${seq.map((c) => SIMB[c]).join(' ')}</span>${d.label}</span>`;
        })}</span>`;
    }
    const pct = (a, t) => (t ? Math.round(100 * a / t) : 0);
    // Il dettaglio per set e per stimolo di un risultato di gioco (anche della scheda di una seduta salvata)
    function dettaglio(g, opz) {
        opz = opz || {};
        const sb = Array.isArray(g.setBreakdown) ? g.setBreakdown : [];
        if (sb.length) {
            return h`<div class="gioco-dett">${sb.map((x) => {
                const lista = G.stimoliDelSet(g, x.setId);
                const riga = h`<span class="gioco-set-nome">${x.setName}${x.setCat ? h` <small class="sotto">${x.setCat}</small>` : ''}</span>
                    <span class="gioco-set-esito"><b class="${pct(x.correct, x.total) >= 90 ? 'pct-ok' : pct(x.correct, x.total) >= 60 ? 'pct-medio' : 'pct-basso'}">${pct(x.correct, x.total)}%</b> ${x.correct}/${x.total}${x.prompts ? h` · ${x.prompts} ${g.risposte === 'ecoico' ? 'E+' : 'P'}` : ''}${x.echoNo ? h` · ${x.echoNo} E-` : ''}${x.incorrect ? h` · ${x.incorrect} ✗` : ''}</span>`;
                return lista.length ? h`<details class="gioco-set" ${opz.aperto ? grezzo('open') : ''}><summary>${riga}</summary>${stimoli(lista)}</details>`
                    : h`<div class="gioco-set"><div class="gioco-set-riga">${riga}</div></div>`;
            })}</div>`;
        }
        const it = Array.isArray(g.itemDetails) ? g.itemDetails : [];
        return it.length ? h`<div class="gioco-dett"><details class="gioco-set"><summary><span class="gioco-set-nome">Stimoli</span><span class="gioco-set-esito">${it.length}</span></summary>${stimoli(it)}</details></div>` : '';
    }
    function dettaglioGioco(p, att, v) {
        const g = v && v.gioco;
        if (!g) return '';
        const valido = G.dettaglioValido(v);
        const nSet = (g.setBreakdown || []).length;
        return h`<div class="gioco-nota">
            <p class="sotto piccolo">${icona('gamepad')} Giocata con l'app · ${etichettaModo(g.mode)}${nSet > 1 ? ' · ' + nSet + ' set insieme' : ''}</p>
            ${valido ? dettaglio(g) : h`<p class="sotto piccolo">${icona('triangle-exclamation')} Hai cambiato i conteggi: il dettaglio per set e per stimolo non viene salvato.</p>`}
            ${att.temporanea ? h`<div class="gioco-dove"><span class="sotto piccolo">Una tantum: non entra in nessun programma.</span>
                <button type="button" class="bt piccolo" data-a="destinazione-temp" data-id="${att.id}">${icona('shuffle')} Cambia</button></div>` : ''}
        </div>`;
    }

    agganciaSalvataggi();
    TiceHome.estendi({
        azioni: {
            // cambiare dove va un'attività di gioco: resta una tantum, si unisce a un'attività, ne diventa una nuova
            'destinazione-temp': async (b) => {
                const p = paz(T.pid), bz = bozza(p.id);
                const t = bz.temp.find((x) => x.id === b.dataset.id);
                if (!t || !EST.destinazioneTemporanea) return;
                await EST.destinazioneTemporanea(p, bz, t, 1);
                T.mantieniScroll = true;
                X.disegna();
            }
        },
        aggancio: { dettaglioGioco }
    });
    X.eDelCentro = eDelCentro;
    X.dettaglioRisultatoGioco = dettaglio;
    X.avvisoConAzione = avvisoConAzione;
})();
