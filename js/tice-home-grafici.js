/**
 * Centro TICE — schermata Grafici: tutti i bambini, uno dopo l'altro, con lo stesso tipo di grafico;
 * si passa dall'uno all'altro con le frecce ← e → o dalla barra dei nomi.
 * Spostato da js/tice-home.js: il grafico vero e proprio lo disegna renderVizTab (js/dataviz.js).
 */
(function () {
    'use strict';
    if (!window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, barra, pazientiAula, eGruppo, iniziali, vai, disegna, viste: VISTE, T, radice } = X;

    const conGrafici = () => pazientiAula().filter((p) => !eGruppo(p)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
    function bambinoGrafici() {
        const tutti = conGrafici();
        return tutti.find((p) => p.id === T.pid) || tutti.find((p) => (p.history || []).length) || tutti[0] || null;
    }
    function vistaGrafici() {
        const tutti = conGrafici(), p = bambinoGrafici();
        if (p) T.pid = p.id;
        const i = p ? tutti.indexOf(p) : -1;
        return h`${barra({ indietro: 'grafici-indietro', titolo: 'Grafici', sotto: { testo: p ? p.name : 'Nessun bambino' }, destra: p ? h`
                <button class="ib" data-a="apri-cartella" aria-label="Cartella clinica di ${p.name}" title="Cartella clinica">${icona('folder-open')}</button>` : '' })}
            <main class="tice-main grafici-main">
                ${p ? h`<div class="grafici-scelta">
                    <button class="ib" data-a="grafici-passa" data-d="-1" aria-label="Bambino precedente" title="Precedente (←)" ${tutti.length < 2 ? grezzo('disabled') : ''}>${icona('chevron-left')}</button>
                    <select class="campo-in" data-cambio="grafici-bambino" aria-label="Bambino">${tutti.map((x) => h`<option value="${x.id}" ${x === p ? grezzo('selected') : ''}>${x.name}${(x.history || []).length ? '' : ' · nessun dato'}</option>`)}</select>
                    <span class="sotto piccolo grafici-n">${i + 1} di ${tutti.length}</span>
                    <button class="ib" data-a="grafici-passa" data-d="1" aria-label="Bambino successivo" title="Successivo (→)" ${tutti.length < 2 ? grezzo('disabled') : ''}>${icona('chevron-right')}</button>
                </div>
                <div class="grafici-bambini" role="list">${tutti.map((x) => h`<button role="listitem" class="grafici-bimbo ${x === p ? 'qui' : ''}" data-a="grafici-vai" data-pid="${x.id}" ${x === p ? grezzo('aria-current="true"') : ''}>
                    <span class="avatar">${x.photo ? h`<img src="${x.photo}" alt="">` : iniziali(x.name)}</span><span>${x.name}</span></button>`)}</div>
                ${(p.history || []).length ? h`<div class="grafici-tela" data-grafici></div>` : h`<div class="vuoto">${p.name}: ancora nessuna seduta registrata.</div>`}`
                : h`<div class="vuoto">Ancora nessun bambino.</div>`}
            </main>`;
    }
    function montaGrafici(r) {
        const box = r.querySelector('[data-grafici]'), p = bambinoGrafici();
        if (box && p && window.renderVizTab) window.renderVizTab(p, box);
        const qui = r.querySelector('.grafici-bimbo.qui');
        if (qui) qui.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    function passaGrafici(d) {
        const tutti = conGrafici(), p = bambinoGrafici();
        if (!p || tutti.length < 2) return;
        T.pid = tutti[(tutti.indexOf(p) + d + tutti.length) % tutti.length].id;
        T.mantieniScroll = true;
        disegna();
    }
    function apriGrafici() {
        T.ritornoGrafici = { vista: T.vista, pid: T.pid };
        vai('grafici', T.vista === 'seduta' || T.vista === 'programma' ? T.pid : (T.pidGrafici || T.pid));
    }

    // nei grafici le frecce della tastiera passano al bambino prima o dopo
    document.addEventListener('keydown', (e) => {
        if (T.vista !== 'grafici' || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        if (document.querySelector('.tice-foglio') || (X.scrivendo && X.scrivendo(e))) return;
        if (!radice() || !radice().isConnected) return;
        e.preventDefault();
        passaGrafici(e.key === 'ArrowLeft' ? -1 : 1);
    });

    TiceHome.estendi({
        viste: { grafici: vistaGrafici },
        azioni: {
            'vai-grafici': () => apriGrafici(),
            'grafici-passa': (b) => passaGrafici(Number(b.dataset.d) || 1),
            'grafici-vai': (b) => { T.pid = b.dataset.pid; T.mantieniScroll = true; disegna(); },
            'grafici-indietro': () => { const r = T.ritornoGrafici || { vista: VISTE.turni ? 'turni' : 'bambini' }; vai(VISTE[r.vista] ? r.vista : 'bambini', r.pid); },
        },
        aggancio: { montaGrafici, apriGrafici }
    });
})();
