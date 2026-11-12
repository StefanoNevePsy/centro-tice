/**
 * Centro TICE — diario del bambino: scrivere e consultare le note.
 * Il foglio «Nota» si apre da ovunque (seduta, elenco, diario); la schermata Diario le mostra
 * giorno per giorno con ricerca ed etichette; «Da tenere a mente» raccoglie quelle fissate.
 * I dati stanno in js/tice-note.js; qui solo le schermate, agganciate a tice-home.js.
 */
(function () {
    'use strict';
    const N = window.TiceNote, Y = window.TiceSync;
    if (!N || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, foglio, conferma, avviso, barra, vai, paz, salvaPaziente, formatoData, T } = X;
    const centro = () => !!(Y && Y.attivo() && Y.S.io);
    const io = () => (centro() ? { nome: Y.S.io.nome || Y.S.io.email, email: Y.S.io.email } : { nome: X.chiOpera() || '', email: '' });
    const oggi = () => N.giorno(new Date());

    // ---------- etichette: del centro (uguali per tutti) o di questo dispositivo ----------
    const locali = () => { try { return JSON.parse(localStorage.getItem('tice_etichette') || '[]'); } catch (e) { return []; } };
    const delCentro = () => (centro() && Y.S.modalita && Y.S.modalita.etichette) || null;
    const etichette = () => N.etichette(delCentro() || locali());
    const etichetta = (id) => etichette().find((e) => e.id === id) || (id ? { id, nome: id, colore: '#475569' } : null);
    const puoEtichette = () => !X.limitato() && (!centro() || Y.puo('programmi'));
    async function salvaEtichette(lista) {
        if (centro() && Y.S.io && (Y.S.io.funzioni || []).includes('etichette')) { await Y.aggiornaModalita({ etichette: lista }); return; }
        const tutte = locali();
        lista.forEach((e) => { const i = tutte.findIndex((x) => x.id === e.id); if (i >= 0) tutte[i] = e; else tutte.push(e); });
        localStorage.setItem('tice_etichette', JSON.stringify(tutte));
        if (centro()) avviso('Etichette salvate su questo dispositivo: per condividerle va aggiornato il custode del centro.');
    }
    const pill = (id) => { const e = etichetta(id); return e ? h`<span class="nt-tag" style="--c:${e.colore}">${e.nome}</span>` : ''; };

    // chi può cambiare una nota: chi l'ha scritta e chi gestisce i programmi (le tirocinanti solo le proprie)
    function puoCambiare(p, n) {
        const me = io();
        if (centro() ? (n.email && n.email === me.email) : true) return true;
        return !X.limitato() && X.puoProgrammi(p);
    }

    // ---------- il foglio della nota ----------
    async function foglioNota(p, nota, opz) {
        opz = opz || {};
        const n = nota || { testo: '', tag: opz.tag || '', data: opz.data || oggi(), fissata: !!opz.fissata };
        const tags = etichette().filter((e) => !e.nascosta || e.id === n.tag);
        const r = await foglio(h`<form class="nt-foglio"><h2>${nota ? 'Modifica nota' : 'Nota'} · ${p.name}</h2>
            <label class="campo"><span class="vis-nascosto">Testo</span><textarea name="testo" required maxlength="5000" rows="5" ${nota ? '' : grezzo('autofocus')} placeholder="Cosa è successo, cosa ha funzionato, cosa ricordare…">${n.testo}</textarea></label>
            <div class="campo"><span>Di cosa parla <small class="sotto">· facoltativo</small></span>
                <div class="nt-scelta">${tags.map((e) => h`<label class="nt-chip" style="--c:${e.colore}"><input type="radio" name="tag" value="${e.id}" ${n.tag === e.id ? grezzo('checked') : ''}><span>${e.nome}</span></label>`)}</div></div>
            <div class="riga-campi" style="align-items:end">
                <label class="campo"><span>${icona('calendar-day')} Giorno</span><input name="data" type="date" required value="${n.data}" max="${oggi()}"></label>
                <label class="spunta-riga nt-fissa"><input type="checkbox" name="fissata" ${n.fissata ? grezzo('checked') : ''}> <span>${icona('thumbtack')} <b>Da tenere a mente</b><br><span class="sotto piccolo">sempre in vista in seduta</span></span></label>
            </div>
            ${nota ? h`<p class="sotto piccolo">${nota.autore ? 'Scritta da ' + nota.autore : 'Senza autore'}${nota.modificato ? ' · modificata il ' + formatoData(N.giorno(nota.modificato)) : ''}</p>
                <button type="button" class="bt piccolo fantasma pericolo-testo" data-foglio="togli">${icona('trash')} Elimina la nota</button>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${icona('check')} Salva</button></div></form>`, {
            dopo: (f) => {
                // toccando di nuovo l'etichetta scelta la si toglie
                f.querySelectorAll('.nt-chip input').forEach((x) => x.addEventListener('click', () => { if (x.dataset.su === '1') { x.checked = false; x.dataset.su = ''; } else { f.querySelectorAll('.nt-chip input').forEach((y) => { y.dataset.su = ''; }); x.dataset.su = '1'; } }));
                const su = f.querySelector('.nt-chip input:checked'); if (su) su.dataset.su = '1';
            },
            invia: (f) => { const d = new FormData(f); return { testo: d.get('testo'), tag: d.get('tag') || '', data: d.get('data'), fissata: !!d.get('fissata') }; }
        });
        if (!r) return null;
        if (r === 'togli') {
            if (!await conferma('Eliminare la nota?', 'Sparisce dal diario di ' + p.name + ' per tutti.', { ok: 'Elimina', pericolo: true })) return null;
            N.togli(p, nota.id);
            await salvaPaziente(p);
            avviso('Nota eliminata');
            return 'tolta';
        }
        if (!String(r.testo || '').trim()) return null;
        const me = io();
        if (nota) N.modifica(p, nota.id, r);
        else N.aggiungi(p, Object.assign({}, r, { autore: me.nome, email: me.email }));
        await salvaPaziente(p);
        avviso(nota ? 'Nota aggiornata' : `Nota salvata nel diario di ${p.name}`);
        return 'salvata';
    }

    // ---------- note in breve: le ultime e quelle da tenere a mente ----------
    const ora = (n) => (/T12:00:00$/.test(n.il) ? '' : new Date(n.il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    const voce = (p, n, conData, nelFoglio) => h`<article class="nt-voce ${n.fissata ? 'fissata' : ''}" data-testo="${(n.testo + ' ' + (n.autore || '') + ' ' + ((etichetta(n.tag) || {}).nome || '')).toLowerCase()}">
        <header>${n.fissata ? h`<span class="nt-pin" title="Da tenere a mente">${icona('thumbtack')}</span>` : ''}${pill(n.tag)}
            <span class="sotto piccolo">${[conData ? formatoData(n.data) : '', n.autore || '', ora(n)].filter(Boolean).join(' · ')}</span>
            ${puoCambiare(p, n) ? h`<button type="button" class="ib nt-mod" ${nelFoglio ? grezzo(`data-foglio="mod:${X.esc(n.id)}"`) : grezzo(`data-a="nota-mod" data-id="${X.esc(n.id)}"`)} aria-label="Modifica la nota">${icona('pen')}</button>` : ''}</header>
        <p>${n.testo}</p></article>`;
    async function foglioBreve(p, quali) {
        const tutte = N.elenco(p), l = quali === 'mente' ? tutte.filter((n) => n.fissata) : tutte.slice(0, 3);
        const r = await foglio(h`<div class="nt-breve"><h2>${quali === 'mente' ? h`${icona('thumbtack')} Da tenere a mente` : 'Ultime note'} · ${p.name}</h2>
            ${l.length ? l.map((n) => voce(p, n, true, true)) : h`<p class="sotto">Ancora nessuna nota.</p>`}
            <div class="bottoni"><button class="bt" data-foglio="diario">${icona('book-open')} Tutto il diario</button><button class="bt primario" data-foglio="nuova">${icona('plus')} Nota</button></div></div>`);
        if (r === 'diario') apriDiario(p.id);
        else if (r === 'nuova') { await foglioNota(p, null, quali === 'mente' ? { fissata: true } : {}); TiceHome.ridisegna(); }
        else if (typeof r === 'string' && r.indexOf('mod:') === 0) { const n = (p.diario || []).find((x) => x.id === r.slice(4)); if (n) await foglioNota(p, n); TiceHome.ridisegna(); }
    }

    // ---------- in seduta e nell'elenco: tasti piccoli, niente spazio fisso ----------
    function tastiSeduta(p) {
        const tutte = N.elenco(p), f = tutte.filter((n) => n.fissata).length;
        return h`<div class="nt-tasti">
            ${f ? h`<button class="nt-tasto mente" data-a="nota-breve" data-q="mente">${icona('thumbtack')} Da tenere a mente <b>${f}</b></button>` : ''}
            ${tutte.length ? h`<button class="nt-tasto" data-a="nota-breve" data-q="ultime">${icona('clock-rotate-left')} Ultima nota</button>` : ''}
            <button class="nt-tasto" data-a="nota-nuova">${icona('plus')} Nota</button>
            ${tutte.length ? h`<button class="nt-tasto" data-a="vai-diario">${icona('book-open')} Diario</button>` : ''}
        </div>`;
    }
    const accantoRiga = (p) => h`<button class="ib nt-riga" data-a="nota-nuova" data-pid="${p.id}" aria-label="Scrivi una nota su ${p.name}" title="Scrivi una nota">${icona('note-sticky')}</button>`;
    function sottoRiga(p) {
        const n = N.diOggi(p, oggi()), f = (p.diario || []).some((x) => x.fissata);
        return h`${n ? h` · ${icona('note-sticky')} ${n} ${n === 1 ? 'nota oggi' : 'note oggi'}` : ''}${f ? h` · ${icona('thumbtack')}` : ''}`;
    }

    // ---------- la schermata Diario ----------
    function apriDiario(pid) {
        const a = TiceHome.attuale();
        if (a.vista !== 'diario') T.ritornoDiario = { vista: a.vista, pid: a.pid };
        T.diarioTag = '';
        vai('diario', pid);
    }
    const nomeGiorno = (d) => {
        if (d === oggi()) return 'Oggi';
        const x = new Date(d + 'T12:00:00'), ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
        if (N.giorno(ieri) === d) return 'Ieri';
        return x.toLocaleDateString('it-IT', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
    };
    function vistaDiario() {
        const p = paz(T.pid);
        if (!p) { T.vista = 'bambini'; return TiceHome.strumenti.banner(); }
        const tutte = N.elenco(p), fissate = tutte.filter((n) => n.fissata);
        const tag = T.diarioTag || '';
        // quelle da tenere a mente stanno in cima, non anche nel loro giorno
        const l = tutte.filter((n) => !n.fissata && (!tag || (tag === '~' ? !n.tag : n.tag === tag)));
        const usate = etichette().filter((e) => tutte.some((n) => n.tag === e.id));
        const giorni = [];
        l.forEach((n) => { let g = giorni[giorni.length - 1]; if (!g || g.d !== n.data) giorni.push(g = { d: n.data, note: [] }); g.note.push(n); });
        const filtro = (id, contenuto) => h`<button class="nt-filtro ${tag === id ? 'on' : ''}" data-a="diario-tag" data-tag="${id}" aria-pressed="${tag === id ? 'true' : 'false'}">${contenuto}</button>`;
        return h`${barra({ indietro: 'diario-indietro', titolo: 'Diario', sotto: { testo: p.name }, destra: h`
                <button class="ib" data-a="diario-stampa" aria-label="Stampa il diario" title="Stampa o salva in PDF">${icona('print')}</button>
                ${puoEtichette() ? h`<button class="ib" data-a="diario-etichette" aria-label="Etichette delle note" title="Etichette">${icona('tags')}</button>` : ''}` })}
            <main class="tice-main nt-main">
                ${X.testata(p.name + ' · ' + tutte.length + (tutte.length === 1 ? ' nota' : ' note'), 'Diario')}
                ${fissate.length ? h`<section class="nt-mente"><h3>${icona('thumbtack')} Da tenere a mente</h3>${fissate.map((n) => voce(p, n, false))}</section>` : ''}
                ${tutte.length > 4 ? h`<input class="cerca" type="search" placeholder="Cerca nelle note" aria-label="Cerca nelle note" data-nt-cerca autocomplete="off">` : ''}
                ${usate.length ? h`<div class="nt-filtri" data-scorri role="group" aria-label="Filtra per etichetta">${filtro('', 'Tutte')}${usate.map((e) => filtro(e.id, h`<span class="nt-tag" style="--c:${e.colore}">${e.nome}</span>`))}${tutte.some((n) => !n.tag) ? filtro('~', 'Senza etichetta') : ''}</div>` : ''}
                ${giorni.map((g) => h`<section class="nt-giorno"><h3><b>${nomeGiorno(g.d)}</b> <span>${new Date(g.d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: g.d.slice(0, 4) === oggi().slice(0, 4) ? undefined : 'numeric' })}</span></h3>
                    ${g.note.map((n) => voce(p, n, false))}</section>`)}
                ${!l.length && !(fissate.length && !tag) ? h`<div class="vuoto">${tutte.length ? 'Nessuna nota con questa etichetta.' : 'Ancora nessuna nota: scrivi la prima con «Nota».'}</div>` : ''}
                <p class="sotto nt-nessuna" hidden>Nessuna nota con queste parole.</p>
            </main>
            <button class="nt-fab" data-a="nota-nuova">${icona('plus')} Nota</button>`;
    }
    function dopoDiario(r) {
        const c = r.querySelector('[data-nt-cerca]');
        if (!c) return;
        const filtra = () => {
            const q = c.value.trim().toLowerCase();
            let n = 0;
            r.querySelectorAll('.nt-giorno').forEach((g) => {
                let vis = 0;
                g.querySelectorAll('.nt-voce').forEach((v) => { v.hidden = !!q && !v.dataset.testo.includes(q); if (!v.hidden) vis++; });
                g.hidden = !vis; n += vis;
            });
            r.querySelector('.nt-nessuna').hidden = n > 0 || !q;
        };
        // il campo può restare lo stesso fra un ridisegno e l'altro (morph): il gestore si attacca una volta sola
        if (!c._ntCerca) { c._ntCerca = true; c.addEventListener('input', filtra); }
        // il ridisegno rimette visibili le note: se nel campo c'è ancora una ricerca, si riapplica
        if (c.value.trim()) filtra();
    }
    async function stampaDiario(p) {
        const tutte = N.elenco(p);
        if (!tutte.length) { avviso('Niente da stampare.'); return; }
        const primo = tutte[tutte.length - 1].data;
        const r = await foglio(h`<form><h2>Stampa il diario</h2>
            <div class="riga-campi"><label class="campo"><span>Dal</span><input type="date" name="da" value="${primo}"></label><label class="campo"><span>Al</span><input type="date" name="a" value="${oggi()}"></label></div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${icona('print')} Stampa o PDF</button></div></form>`);
        if (!r) return;
        const esc = X.esc;
        const l = tutte.filter((n) => (!r.da || n.data >= r.da) && (!r.a || n.data <= r.a)).reverse();
        const righe = l.map((n) => `<tr><td style="white-space:nowrap;vertical-align:top;padding:2mm 3mm 2mm 0"><b>${esc(formatoData(n.data))}</b><br><small>${esc([(etichetta(n.tag) || {}).nome, n.autore].filter(Boolean).join(' · '))}</small></td><td style="padding:2mm 0;border-bottom:0.2mm solid #ccc">${n.fissata ? '📌 ' : ''}${esc(n.testo).replace(/\n/g, '<br>')}</td></tr>`).join('');
        await X.stampa(`<div class="st-foglio"><div class="st-bambino">${esc(p.name)}</div><p>Diario${r.da ? ' dal ' + esc(formatoData(r.da)) : ''}${r.a ? ' al ' + esc(formatoData(r.a)) : ''} · ${l.length} note</p><table style="width:100%;border-collapse:collapse;font-size:10pt">${righe}</table></div>`);
    }
    async function gestisciEtichette() {
        for (;;) {
            const tutte = etichette();
            const r = await foglio(h`<form><h2>Etichette delle note</h2>
                <p class="sotto piccolo">${centro() ? 'Valgono per tutto il centro.' : 'Valgono su questo dispositivo.'} Un'etichetta nascosta non si propone più, ma resta sulle note che l'hanno già.</p>
                <div class="opzioni">${tutte.map((e) => h`<button type="button" class="opzione" data-foglio="${'e:' + e.id}"><span class="nt-tag" style="--c:${e.colore}">${e.nome}</span><span class="corpo">${e.nascosta ? h`<small>nascosta</small>` : ''}</span>${icona('pen')}</button>`)}</div>
                <label class="campo" style="margin-top:10px"><span>Nuova etichetta</span><input name="nuova" maxlength="40" placeholder="es. Logopedia, Colloquio" autocomplete="off"></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Chiudi</button><button class="bt primario">Aggiungi</button></div></form>`);
            if (!r) return;
            try {
                if (typeof r === 'string' && r.indexOf('e:') === 0) {
                    const e = tutte.find((x) => x.id === r.slice(2));
                    const m = await foglio(h`<form><h2>Etichetta</h2>
                        <label class="campo"><span>Nome</span><input name="nome" required maxlength="40" value="${e.nome}"></label>
                        <div class="campo"><span>Colore</span><div class="colori-att">${N.PALETTE.map((c) => h`<label><input type="radio" name="colore" value="${c}" ${e.colore === c ? grezzo('checked') : ''}><span style="--col:${c}"></span></label>`)}</div></div>
                        <label class="spunta-riga"><input type="checkbox" name="nascosta" ${e.nascosta ? grezzo('checked') : ''}> <span><b>Nascosta</b> <span class="sotto piccolo">· non si propone più nelle note nuove</span></span></label>
                        <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                    if (m && String(m.nome || '').trim()) await salvaEtichette([Object.assign({ id: e.id, nome: String(m.nome).trim(), colore: m.colore || e.colore }, m.nascosta ? { nascosta: true } : {})]);
                } else {
                    const nome = String(r.nuova || '').trim();
                    if (!nome) continue;
                    if (tutte.some((x) => x.nome.toLowerCase() === nome.toLowerCase())) { avviso(`«${nome}» esiste già.`, 'errore'); continue; }
                    const id = ('c-' + nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 40) || 'c-etichetta';
                    await salvaEtichette([{ id, nome, colore: N.PALETTE[tutte.length % N.PALETTE.length] }]);
                }
            } catch (e) { avviso(e.message || String(e), 'errore'); }
        }
    }

    const pazDi = (b) => paz((b && b.dataset && b.dataset.pid) || T.pid);
    TiceHome.estendi({
        viste: { diario: vistaDiario },
        azioni: {
            'nota-nuova': async (b) => { const p = pazDi(b); if (p && await foglioNota(p)) TiceHome.ridisegna(); },
            'nota-mod': async (b) => { const p = paz(T.pid), n = p && (p.diario || []).find((x) => x.id === b.dataset.id); if (n && await foglioNota(p, n)) TiceHome.ridisegna(); },
            'nota-breve': (b) => { const p = paz(T.pid); if (p) return foglioBreve(p, b.dataset.q); },
            'vai-diario': () => apriDiario(T.pid),
            'diario-indietro': () => { const r = T.ritornoDiario || { vista: 'seduta', pid: T.pid }; vai(r.vista, r.pid); },
            'diario-tag': (b) => { T.diarioTag = b.dataset.tag; TiceHome.ridisegna(); },
            'diario-stampa': () => stampaDiario(paz(T.pid)),
            'diario-etichette': async () => { await gestisciEtichette(); TiceHome.ridisegna(); },
        },
        aggancio: { noteSeduta: tastiSeduta, accantoRiga, sottoRiga, dopoVista: (vista, r) => { if (vista === 'diario') dopoDiario(r); } }
    });

    // La cartella clinica di prima scrive e toglie le note del giorno da qui, così restano voci del diario
    const vecchioApri = window.openDailyNoteEditor;
    window.openDailyNoteEditor = async function (pid, dk) {
        const p = paz(pid);
        if (!p) return vecchioApri && vecchioApri.apply(this, arguments);
        await foglioNota(p, null, dk ? { data: dk } : {});
        if (typeof window.loadPatientData === 'function') window.loadPatientData(pid);
    };
    window.deleteDailyNote = async function (pid, dk) {
        const p = paz(pid);
        if (!p) return;
        const l = N.elenco(p).filter((n) => n.data === dk), mie = l.filter((n) => puoCambiare(p, n));
        if (!mie.length) { avviso('Queste note le può togliere chi le ha scritte.', 'errore'); return; }
        if (!await conferma(mie.length === 1 ? 'Eliminare la nota di questa giornata?' : `Eliminare le ${mie.length} note di questa giornata?`, '', { ok: 'Elimina', pericolo: true })) return;
        mie.forEach((n) => N.togli(p, n.id));
        await salvaPaziente(p);
        if (typeof window.loadPatientData === 'function') window.loadPatientData(pid);
    };
    window.TiceDiario = { foglioNota, apriDiario, etichette };
})();
