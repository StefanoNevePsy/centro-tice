/**
 * Centro TICE — schermata Grafici: un bambino alla volta (frecce ← e →, tendina o barra dei nomi), il periodo,
 * e una scelta di grafici a schede divisa in gruppi (a colonna sul computer, a griglia che si chiude sul telefono).
 * I grafici veri li disegnano le viste di js/dataviz*.js; qui si sceglie quale mostrare e per quale periodo.
 */
(function () {
    'use strict';
    if (!window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, barra, pazientiAula, eGruppo, iniziali, vai, disegna, viste: VISTE, T, radice, esc } = X;

    const conGrafici = () => pazientiAula().filter((p) => !eGruppo(p)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
    function bambinoGrafici() {
        const tutti = conGrafici();
        return tutti.find((p) => p.id === T.pid) || tutti.find((p) => (p.history || []).length) || tutti[0] || null;
    }

    // ---------- i grafici: gruppi comprensibili, con a cosa servono ----------
    // id della vista (js/dataviz*.js, js/scc-viz.js, js/tice-comportamenti.js) → a cosa serve, in parole semplici.
    // Le viste che qui non sono elencate finiscono in «Altro» con la loro etichetta.
    const DESC = {
        'tice-tempo': 'Ogni target su una riga: da quando si è aperto a quando è arrivato a criterio.',
        'tice-acquisiti': 'Quanti target sono stati introdotti e quanti acquisiti, nel tempo.',
        'tice-sedute': 'Quante sedute sono servite a ogni target per arrivare a criterio.',
        scc: 'La velocità con cui impara, su scala standard, con linee di tendenza e cambi di fase.',
        calendar: 'Una casella per ogni giorno: più è colorata, meglio è andata la giornata.',
        independence: 'Quanto aiuto serve ogni giorno: da solo (V), con aiuto (P), errori (X).',
        stream: 'Gli stessi dati di V, P e X come un fiume che si allarga con il numero di prove.',
        matrix: 'Quali attività sono state fatte in quali giorni.',
        rose: 'Le giornate disposte a ventaglio e colorate per esito.',
        comportamenti: 'Quante volte (o quanto a lungo) compare ogni comportamento, giorno per giorno.',
        glyphs: 'Un piccolo disegno per ogni giornata.',
        tree: 'Un albero che cresce con i progressi.',
        radar: 'Il profilo delle aree di lavoro a colpo d\'occhio.',
        vocab: 'Le parole imparate, una per una.',
        timedelay: 'Come cambia l\'attesa prima dell\'aiuto (time delay).',
        curves: 'La curva di apprendimento di ogni attività.',
        promptbalance: 'Quanto aiuto serve rispetto a quanto fa da solo.',
        celeration: 'La velocità di apprendimento di tutte le attività insieme.',
        variants: 'Confronta le attività svolte in condizioni diverse.',
        milestones: 'I traguardi raggiunti, in ordine di data.'
    };
    const GRUPPI = [
        { id: 'programma', titolo: 'Andamento del programma', ids: ['tice-tempo', 'tice-acquisiti', 'tice-sedute', 'scc'] },
        { id: 'giornate', titolo: 'Giornate', ids: ['calendar', 'independence', 'stream', 'matrix', 'rose'] },
        { id: 'comportamenti', titolo: 'Comportamenti problema', ids: ['comportamenti'] }
    ];
    const PERIODI = [['month', 'Ultimo mese'], ['quarter', '3 mesi'], ['year', 'Anno'], ['all', 'Tutto'], ['custom', 'Da–a']];
    const API = () => window._vizApi || null;
    const haComportamenti = (p) => {
        const C = window.TiceComportamenti;
        return !!((C && C.elenco(p).length) || (p.history || []).some((x) => x.mode === 'comportamento'));
    };
    const filtro = () => (typeof state !== 'undefined' && state._vizFilter) || 'all';
    // l'elenco dei grafici per questo bambino, i gruppi e quello scelto (la scelta resta passando da un bambino all'altro)
    function sceltaGrafici(p) {
        const A = API();
        const tutte = A ? A.VIZ_VIEWS.slice() : [];
        const conProgramma = !!(A && A.haProgramma && A.haProgramma(p));
        const ok = (v) => (v.id === 'comportamenti' ? haComportamenti(p) : /^tice-/.test(v.id) ? conProgramma : true);
        const viste = tutte.filter(ok);
        const presi = new Set();
        const gruppi = GRUPPI.map((g) => ({ id: g.id, titolo: g.titolo, viste: g.ids.map((id) => viste.find((v) => v.id === id)).filter(Boolean) })).filter((g) => g.viste.length);
        gruppi.forEach((g) => g.viste.forEach((v) => presi.add(v.id)));
        const altro = viste.filter((v) => !presi.has(v.id));
        if (altro.length) gruppi.push({ id: 'altro', titolo: 'Altro', viste: altro, comprimibile: true });
        const scelto = (typeof state !== 'undefined' && state._vizView) || '';
        let corrente = viste.find((v) => v.id === scelto);
        if (!corrente) corrente = viste.find((v) => v.id === (conProgramma ? 'tice-tempo' : 'calendar')) || viste[0] || null;
        return { viste, gruppi, corrente };
    }
    const nomeVista = (v) => v.label;
    const descVista = (v) => DESC[v.id] || '';
    const iconaVista = (v) => grezzo(`<i class="fa-solid ${v.icon || 'fa-chart-simple'}" aria-hidden="true"></i>`);
    const firmaGrafici = (p, sc) => {
        const s = typeof state !== 'undefined' ? state : {};
        let pelle = ''; try { pelle = window.getVizSkin ? window.getVizSkin() : ''; } catch (e) { /* niente */ }
        return [p.id, (p.history || []).length, String((p.history[p.history.length - 1] || {}).date || ''), sc.corrente ? sc.corrente.id : '', s._vizFilter || 'all', s._vizFrom || '', s._vizTo || '', pelle].join('|');
    };
    const dataBreve = (k) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k || '')); return m ? `${+m[3]}/${+m[2]}/${m[1]}` : ''; };

    function vistaGrafici() {
        const tutti = conGrafici(), p = bambinoGrafici();
        if (p) T.pid = p.id;
        const i = p ? tutti.indexOf(p) : -1;
        const A = API();
        const sc = p && A ? sceltaGrafici(p) : { viste: [], gruppi: [], corrente: null };
        const cur = sc.corrente;
        const f = filtro();
        const nel = p && A && (p.history || []).length ? A.vizFilteredPatient(p).history.length : 0;
        const r = A && A.vizFilterRange ? A.vizFilterRange() : { from: '', to: '' };
        const altroAperto = (g) => (T.grAltro === undefined || T.grAltro === null ? !!(cur && g.viste.some((v) => v.id === cur.id)) : !!T.grAltro);
        const scheda = (v) => h`<button type="button" class="gr-scheda ${cur && v.id === cur.id ? 'on' : ''}" data-a="gr-grafico" data-id="${v.id}" aria-pressed="${cur && v.id === cur.id ? 'true' : 'false'}">
                <span class="gr-ico">${iconaVista(v)}</span>
                <span class="gr-scheda-t"><b>${nomeVista(v)}</b>${descVista(v) ? h`<small>${descVista(v)}</small>` : ''}</span>
            </button>`;
        const gruppo = (g) => {
            const aperto = !g.comprimibile || altroAperto(g);
            return h`<section class="gr-gruppo ${g.comprimibile ? 'comprimibile' : ''} ${aperto ? '' : 'chiuso'}">
                ${g.comprimibile ? h`<button type="button" class="gr-gruppo-t gr-gruppo-tasto" data-a="gr-altro" aria-expanded="${aperto ? 'true' : 'false'}">${g.titolo} <small>${g.viste.length}</small> ${icona(aperto ? 'chevron-up' : 'chevron-down')}</button>`
                    : h`<h3 class="gr-gruppo-t">${g.titolo}</h3>`}
                ${aperto ? h`<div class="gr-griglia">${g.viste.map(scheda)}</div>` : ''}
            </section>`;
        };
        const pelle = (() => { try { return window.getVizSkin ? window.getVizSkin() : ''; } catch (e) { return ''; } })();
        const pelli = A && A.VIZ_SKINS ? Object.keys(A.VIZ_SKINS) : [];
        const haDati = p && (p.history || []).length;
        return h`${barra({ indietro: 'grafici-indietro', titolo: p ? p.name : 'Grafici', sotto: { testo: p ? 'Grafici' + (cur ? ' · ' + nomeVista(cur) : '') : 'Nessun bambino' }, destra: p ? h`
                <button class="ib" data-a="apri-cartella" aria-label="Cartella clinica di ${p.name}" title="Cartella clinica">${icona('folder-open')}</button>` : '' })}
            <main class="tice-main grafici-main">
                ${p ? h`<div class="grafici-scelta">
                    <button class="ib" data-a="grafici-passa" data-d="-1" aria-label="Bambino precedente" title="Precedente (←)" ${tutti.length < 2 ? grezzo('disabled') : ''}>${icona('chevron-left')}</button>
                    <select class="campo-in" data-cambio="grafici-bambino" aria-label="Bambino" title="${p.name}">${tutti.map((x) => h`<option value="${x.id}" title="${x.name}" ${x === p ? grezzo('selected') : ''}>${x.name}${(x.history || []).length ? '' : ' · nessun dato'}</option>`)}</select>
                    <span class="sotto piccolo grafici-n">${i + 1} di ${tutti.length}</span>
                    <button class="ib" data-a="grafici-passa" data-d="1" aria-label="Bambino successivo" title="Successivo (→)" ${tutti.length < 2 ? grezzo('disabled') : ''}>${icona('chevron-right')}</button>
                </div>
                <div class="grafici-bambini" role="list">${tutti.map((x) => h`<button role="listitem" class="grafici-bimbo ${x === p ? 'qui' : ''}" data-a="grafici-vai" data-pid="${x.id}" title="${x.name}" ${x === p ? grezzo('aria-current="true"') : ''}>
                    <span class="avatar">${x.photo ? h`<img src="${x.photo}" alt="">` : iniziali(x.name)}</span><span class="grafici-bimbo-nome">${x.name}</span></button>`)}</div>
                ${haDati && cur ? h`<div class="gr-controlli">
                    <div class="gr-riga">
                        <span class="gr-et">Periodo</span>
                        <div class="gr-chips" role="group" aria-label="Periodo">${PERIODI.map(([k, t]) => h`<button type="button" class="cr-chip ${f === k ? 'on' : ''}" data-a="gr-periodo" data-v="${k}" aria-pressed="${f === k ? 'true' : 'false'}">${t}</button>`)}</div>
                    </div>
                    ${f === 'custom' ? h`<div class="gr-riga gr-date">
                        <label>Da <input type="date" class="campo-in" data-cambio="gr-da" value="${state._vizFrom || ''}"></label>
                        <label>a <input type="date" class="campo-in" data-cambio="gr-a" value="${state._vizTo || ''}"></label>
                    </div>` : ''}
                    <div class="gr-riga gr-sotto-riga">
                        <span class="sotto piccolo gr-periodo-n">${f === 'all' ? 'In tutto' : r.from || r.to ? 'Dal ' + (dataBreve(r.from) || 'inizio') + ' al ' + (dataBreve(r.to) || 'oggi') + ' ·' : 'In tutto'} ${nel} ${nel === 1 ? 'seduta' : 'sedute'}</span>
                        <button type="button" class="link gr-aspetto-tasto" data-a="gr-aspetto" aria-expanded="${T.grAspetto ? 'true' : 'false'}">${icona('ellipsis')} Aspetto</button>
                    </div>
                    ${T.grAspetto ? h`<div class="gr-aspetto"><span class="gr-et">Stile del disegno</span>
                        <div class="gr-chips" role="group" aria-label="Stile del disegno">${pelli.map((k) => h`<button type="button" class="cr-chip ${k === pelle ? 'on' : ''}" data-a="gr-stile" data-k="${k}" aria-pressed="${k === pelle ? 'true' : 'false'}"><i class="fa-solid ${A.VIZ_SKINS[k].icon}" aria-hidden="true"></i> ${A.VIZ_SKINS[k].label}</button>`)}</div></div>` : ''}
                </div>
                <div class="gr-corpo ${T.grElenco ? 'apre' : ''}">
                    <nav class="gr-elenco" aria-label="Scelta del grafico">
                        <div class="gr-elenco-testa"><b>Quale grafico?</b><button type="button" class="link gr-chiudi" data-a="gr-chiudi">Chiudi</button></div>
                        ${sc.gruppi.map(gruppo)}
                    </nav>
                    <div class="gr-destra">
                        <div class="gr-testa">
                            <span class="gr-ico gr-ico-grande">${iconaVista(cur)}</span>
                            <div class="gr-testa-t"><b>${nomeVista(cur)}</b>${descVista(cur) ? h`<small>${descVista(cur)}</small>` : ''}</div>
                            <button type="button" class="bt piccolo gr-cambia" data-a="gr-cambia">${icona('table-cells-large')} Cambia grafico</button>
                        </div>
                        <div class="grafici-tela" data-grafici data-morph-firma="${firmaGrafici(p, sc)}"></div>
                    </div>
                </div>` : h`<div class="vuoto">${p.name}: ancora nessuna seduta registrata.</div>`}`
                : h`<div class="vuoto">Ancora nessun bambino.</div>`}
            </main>`;
    }

    // disegna il grafico scelto nel contenitore, con il periodo scelto: come faceva renderVizTab, senza la sua barra
    function disegnaGrafico(p, box) {
        const A = API();
        box.textContent = '';
        if (!A) return;
        const { corrente: view } = sceltaGrafici(p);
        if (!view) return;
        A.impostaContenitore(box);   // i grafici che si ridisegnano da soli (renderVizTab) tornano qui
        const tela = document.createElement('div');
        tela.className = 'gr-canvas';
        box.appendChild(tela);
        const fp = A.vizFilteredPatient(p);
        if (!(fp.history || []).length && view.id !== 'comportamenti') {
            const tutto = filtro() === 'all';
            tela.innerHTML = `<div class="gr-vuoto"><p><b>${tutto ? 'Ancora nessuna seduta nelle statistiche.' : 'Nessuna seduta nel periodo scelto.'}</b></p>`
                + (tutto ? '' : '<p>Prova «Tutto» o un periodo più lungo.</p><button type="button" class="bt" data-a="gr-periodo" data-v="all">Mostra tutto</button>') + '</div>';
            return;
        }
        try { view.fn(tela, fp); }
        catch (e) { tela.innerHTML = `<div class="gr-vuoto"><p>Errore nel disegno: ${esc(e.message)}</p></div>`; console.error('viz error', e); return; }
        if (A.leggibili) { A.leggibili(tela); requestAnimationFrame(() => A.leggibili(tela)); }
    }
    window._vizRidisegna = (patient, box) => { const p = (typeof state !== 'undefined' && (state.patients || []).find((x) => x.id === patient.id)) || patient; disegnaGrafico(p, box); };

    function montaGrafici(r) {
        const box = r.querySelector('[data-grafici]'), p = bambinoGrafici();
        // con il ridisegno parziale il contenitore resta, già disegnato, finché non cambia la sua firma
        // (bambino, sedute, grafico, periodo o stile): allora è un nodo nuovo e vuoto
        if (box && p && !box.firstChild) disegnaGrafico(p, box);
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
        cambi: {
            'gr-da': (el, e) => { if (e.type === 'change') { state._vizFrom = el.value; T.mantieniScroll = true; disegna(); } },
            'gr-a': (el, e) => { if (e.type === 'change') { state._vizTo = el.value; T.mantieniScroll = true; disegna(); } }
        },
        azioni: {
            'vai-grafici': () => apriGrafici(),
            'grafici-passa': (b) => passaGrafici(Number(b.dataset.d) || 1),
            'grafici-vai': (b) => { T.pid = b.dataset.pid; T.mantieniScroll = true; disegna(); },
            // scelta del grafico (state._vizView), del periodo (state._vizFilter) e dello stile: gli stessi della cartella di prima
            'gr-grafico': (b) => { state._vizView = b.dataset.id; T.grElenco = false; T.mantieniScroll = false; disegna(); const r = radice(); if (r) r.scrollTop = 0; },
            'gr-cambia': () => { T.grElenco = true; T.mantieniScroll = false; disegna(); const r = radice(); if (r) r.scrollTop = 0; },
            'gr-chiudi': () => { T.grElenco = false; T.mantieniScroll = true; disegna(); },
            'gr-altro': () => {
                const el = radice() && radice().querySelector('.gr-gruppo.comprimibile');
                T.grAltro = el ? el.classList.contains('chiuso') : !T.grAltro; T.mantieniScroll = true; disegna();
            },
            'gr-periodo': (b) => { state._vizFilter = b.dataset.v; T.mantieniScroll = true; disegna(); },
            'gr-aspetto': () => { T.grAspetto = !T.grAspetto; T.mantieniScroll = true; disegna(); },
            'gr-stile': (b) => { if (window.setVizSkin) window.setVizSkin(b.dataset.k); T.mantieniScroll = true; disegna(); },
            'grafici-indietro': () => { const r = T.ritornoGrafici || { vista: VISTE.turni ? 'turni' : 'bambini' }; vai(VISTE[r.vista] ? r.vista : 'bambini', r.pid); },
        },
        aggancio: { montaGrafici, apriGrafici }
    });
})();
