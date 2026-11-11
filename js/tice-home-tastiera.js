/**
 * Centro TICE — tastiera nella presa dati: 1/2/3 (o V, P, X) segnano sull'ultima attività toccata,
 * o sulla task analysis aperta; S o → saltano il passo, ← torna al passo prima, Z o Backspace annullano
 * l'ultima risposta; Maiusc + cifra tocca l'ennesimo comportamento problema.
 * Spostato da js/tice-home.js: il nucleo chiede solo di evidenziare l'attività scelta (segnaScelta).
 */
(function () {
    'use strict';
    const C = window.TiceComportamenti;
    if (!C || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { T, azioni, paz, radice, eGruppo, salvaBozza, attivitaDi, voce, ecoico, attPerVoce, passiVoce, statoTA, aggiornaScheda, annullaUltima, baseId } = X;

    // 1/2/3 (o V, P, X) segnano sull'ultima attività toccata, o sulla task analysis aperta;
    // S o → saltano il passo, ← torna al passo prima, Z o Backspace annullano l'ultima risposta
    function voceTastiera(p) {
        if (T.ta && !T.ta.nascosta && T.ta.pid === p.id) return T.ta.attId;
        if (T.tastiera && attivitaDi(p, T.tastiera)) return T.tastiera;
        const aperte = Object.keys(T.aperte).filter((k) => T.aperte[k] && attivitaDi(p, k));
        return aperte.length === 1 ? aperte[0] : null;
    }
    function segnaScelta() {
        const r = radice();
        if (!r) return;
        const k = T.tastiera ? baseId(T.tastiera) : null;
        r.querySelectorAll('.att.da-tastiera').forEach((x) => { if (x.dataset.att !== k) x.classList.remove('da-tastiera'); });
        if (k) { const x = r.querySelector(`.att[data-att="${CSS.escape(k)}"]`); if (x) x.classList.add('da-tastiera'); }
    }
    // si sta scrivendo da qualche parte (anche negli editor della cartella clinica): i tasti sono lettere
    function scrivendo(e) {
        if (window.staScrivendo) return window.staScrivendo(e);
        const el = document.activeElement, t = e.target;
        return [t, el].some((x) => x && x.nodeType === 1 && (x.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName)));
    }
    function tastieraSeduta(e) {
        if (T.vista !== 'seduta' || e.altKey || e.ctrlKey || e.metaKey) return;
        if (document.querySelector('.tice-foglio') || scrivendo(e)) return;
        const r = radice();
        if (!r || !r.isConnected || r.hidden || !r.getClientRects().length || document.querySelector('.modal-overlay:not(.hidden), .modal:not(.hidden)')) return;
        const p = paz(T.pid);
        if (!p) return;
        // Maiusc + 1…9: l'ennesimo comportamento problema (un episodio, o avvia/ferma la durata)
        const md = /^Digit([1-9])$/.exec(e.code || '');
        if (e.shiftKey && md) {
            const c = C.attivi(p)[+md[1] - 1];
            if (c && !eGruppo(p)) { e.preventDefault(); azioni[c.misura === 'durata' ? 'comp-durata' : 'comp-piu']({ dataset: { id: c.id } }); }
            return;
        }
        const k = voceTastiera(p);
        if (!k) return;
        const tasto = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const fai = (azione, extra) => { e.preventDefault(); T.tastiera = k; T.mantieniScroll = true; azioni[azione]({ dataset: Object.assign({ id: k }, extra || {}) }); segnaScelta(); };
        if (['1', '2', '3', 'v', 'p', 'x'].includes(tasto)) {
            // i tasti dell'attività, così come sono a schermo (con il tipo di oggi)
            const att = attivitaDi(p, k), v = voce(p, att, k);
            const eco = ecoico(attPerVoce(att, k)), tipo = v.sessionType || att.sessionType;
            const ris = eco ? ['V', 'P', 'X'] : ['V', tipo === 'timedelay' ? 'P' : 'X'];
            const rr = /[123]/.test(tasto) ? ris[+tasto - 1] : ris.find((x) => x.toLowerCase() === tasto);
            if (!rr) return;
            fai('segna', { r: rr });
            const bt = r.querySelector(`[data-a="segna"][data-id="${CSS.escape(k)}"][data-r="${rr}"]`) || document.querySelector(`#tice-ta [data-a="segna"][data-r="${rr}"]`);
            if (bt) { bt.classList.add('premuto'); setTimeout(() => bt.classList.remove('premuto'), 160); }
        } else if (tasto === 's' || tasto === 'ArrowRight') {
            const att = attivitaDi(p, k);
            if (passiVoce(att, voce(p, att, k)).length) fai('salta-passo');
        } else if (tasto === 'ArrowLeft') {
            const att = attivitaDi(p, k), v = voce(p, att, k), passi = passiVoce(att, v);
            if (!passi.length) return;
            e.preventDefault();
            const st = statoTA(v, passi);
            if (st.i > 0) v.passo = st.i - 1; else if (st.giri > 0) { v.passo = passi.length - 1; v.giri = st.giri - 1; } else return;
            salvaBozza(); aggiornaScheda(p, att.id); segnaScelta();
        } else if (tasto === 'z' || tasto === 'Backspace') {
            e.preventDefault();
            annullaUltima(p, k); segnaScelta();
        }
    }

    document.addEventListener('keydown', tastieraSeduta);

    // scrivendo() serve anche alle altre schermate (frecce dei grafici): si espone fra gli strumenti
    X.scrivendo = scrivendo;
    TiceHome.estendi({ aggancio: { segnaScelta } });
})();
