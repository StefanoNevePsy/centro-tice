/**
 * Centro TICE — correzione a posteriori dei dati: le sedute già salvate fuori dal programma
 * (attività aggiunte per un giorno o tolte) si spostano su un'attività, esistente o nuova.
 * Spostato da js/tice-home.js: nel nucleo restano la sezione «Dati fuori dal programma» e il tasto «sposta».
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, M = window.TiceModalita;
    if (!P || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, foglio, conferma, avviso, paz, salvaPaziente, formatoData, T, chiOpera, puoProgrammi, disegna, dizionario, ETICHETTE_STATO, moduloAttivita, creaAttivitaDaModulo } = X;

    // Le sedute del quaderno non collegate a un'attività del programma (aggiunte per un giorno, attività eliminate)
    function datiFuori(p) {
        const ids = new Set(P.programma(p).attivita.map((a) => a.id));
        const gruppi = {};
        (p.history || []).forEach((s) => {
            if (s.attivitaId && ids.has(s.attivitaId)) return;
            if (s.mode !== 'quaderno' && s.mode !== 'quaderno_task') return;
            // le vecchie sedute del quaderno senza id sono già lette dalle attività con lo stesso nome
            if (!s.attivitaId && P.programma(p).attivita.some((a) => P.sedute(p, a).includes(s))) return;
            const n = String(s.setName || 'Senza nome');
            (gruppi[n] = gruppi[n] || { nome: n, sedute: [] }).sedute.push(s);
        });
        return Object.values(gruppi).map((g) => Object.assign(g, { sedute: g.sedute.sort((a, b) => new Date(a.date) - new Date(b.date)) }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    }
    // Le sedute passano all'attività (e al target) scelti: nome, set e categoria si aggiornano, i conteggi restano
    function spostaSedute(p, sedute, att, t) {
        const quando = new Date().toISOString();
        sedute.forEach((s) => {
            const prima = s.setName;
            s.attivitaId = att.id;
            s.targetId = t ? t.id : null;
            s.setName = P.nomeSet(att, t);
            s.setId = t && t.setId ? t.setId : 'tice_' + (t ? t.id : att.id);
            if (s.mode !== 'quaderno_task') s.mode = (t && t.setId && P.modoTarget(att, t)) || 'quaderno';
            s.setCat = (M.categoriaDi(att, dizionario()) || {}).nome || att.area || s.setCat || '';
            ['misura', 'misuraNome', 'bambino', 'bambinoNome'].forEach((k) => delete s[k]);
            if (prima !== s.setName) (s.correzioni = s.correzioni || []).push({ il: quando, da: prima, chi: chiOpera() });
        });
        if (t && !t.inizio && sedute.length) t.inizio = P.giorno(sedute[0].date);
    }
    async function correggiDati(p, g) {
        // 1. quali giorni
        const righe = g.sedute.map((s, i) => h`<label class="spunta-riga"><input type="checkbox" name="${'s' + i}" checked> <span><b>${formatoData(P.giorno(s.date))}</b> · ${s.setName}<br><span class="sotto piccolo">${s.correct}/${s.total}${s.total ? ' (' + Math.round(100 * s.correct / s.total) + '%)' : ''}${s.sessionType === 'timedelay' ? ' · T/D' : ''}${s.operatore ? ' · ' + s.operatore : ''}</span></span></label>`);
        const r1 = await foglio(h`<form><h2>Correggi i dati · ${g.nome}</h2>
            <p class="sotto">Quali sedute spostare? Poi scegli dove: un'attività del programma o una nuova. I conteggi non cambiano.</p>
            <div class="sedute-da-spostare">${righe}</div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Avanti</button></div></form>`);
        if (!r1) return;
        const scelte = g.sedute.filter((s, i) => r1['s' + i]);
        if (!scelte.length) return;
        // 2. dove
        const altre = P.programma(p).attivita.filter((a) => !g.att || a.id !== g.att.id);
        const nt = M.normalizza(g.nome.split(' · ')[0]);
        const simile = (a) => { const na = M.normalizza(a.nome); return na && nt && (na === nt || na.includes(nt) || nt.includes(na)) || (g.att && g.att.modalita && a.modalita === g.att.modalita); };
        const vicine = altre.filter(simile), resto = altre.filter((a) => !simile(a));
        const opz = (a) => h`<button type="button" class="opzione" data-foglio="${'u:' + a.id}"><span class="corpo">${a.nome}<small>${ETICHETTE_STATO[a.stato] || a.stato}${a.modalita && M.trovaModalita(a.modalita, dizionario()) ? ' · ' + M.trovaModalita(a.modalita, dizionario()).nome : ''}</small></span>${icona('arrow-right')}</button>`;
        const r2 = await foglio(h`<div><h2>Dove vanno ${scelte.length === 1 ? 'questa seduta' : 'queste ' + scelte.length + ' sedute'}?</h2>
            ${vicine.length ? h`<h3>Forse è</h3><div class="opzioni">${vicine.map(opz)}</div>` : ''}
            <div class="opzioni" style="margin-top:10px"><button type="button" class="opzione" data-foglio="nuova">${icona('plus')}<span class="corpo">Una nuova attività del programma<small>Con modalità, target e criterio</small></span></button></div>
            ${resto.length ? h`<details class="sez apribile" ${vicine.length ? '' : grezzo('open')}><summary><span class="sez-titolo">Tutte le attività del programma</span> <span class="sotto piccolo">${resto.length}</span></summary><div class="opzioni">${resto.map(opz)}</div></details>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button></div></div>`);
        if (!r2) return;
        let dest = null;
        if (r2 === 'nuova') {
            const base = { nome: g.nome.split(' · ')[0], sessionType: scelte[0].sessionType === 'timedelay' ? 'timedelay' : 'independent' };
            if (g.att && g.att.modalita) base.modalita = g.att.modalita;
            const m = await moduloAttivita(p, null, base);
            if (!m) return;
            dest = await creaAttivitaDaModulo(p, m);
        } else if (typeof r2 === 'string' && r2.startsWith('u:')) dest = P.attivita(p, r2.slice(2));
        if (!dest) return;
        // 3. su quale target
        let t = null;
        const tt = dest.target || [];
        if (tt.length === 1) t = tt[0];
        else if (tt.length > 1) {
            const c = P.targetCorrente(dest);
            const r3 = await foglio(h`<form><h2>Target · ${dest.nome}</h2>
                <div class="scelta verticale">${tt.map((x) => h`<label><input type="radio" name="t" value="${x.id}" ${c && c.target === x ? grezzo('checked') : ''}><span>${x.testo} <small class="sotto">${P.STATI_TARGET[x.stato] || x.stato}</small></span></label>`)}
                    <label><input type="radio" name="t" value="" ${!c ? grezzo('checked') : ''}><span>Nessun target (tutta l'attività)</span></label></div>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Sposta</button></div></form>`);
            if (!r3) return;
            t = tt.find((x) => x.id === r3.t) || null;
        }
        spostaSedute(p, scelte, dest, t);
        dest.modificato = new Date().toISOString();
        // l'attività di partenza rimasta senza dati: la si può togliere
        if (g.att && !P.sedute(p, g.att).length && await conferma(`Togliere «${g.att.nome}» dal programma?`, 'Non ha più sedute: i suoi dati ora sono in «' + dest.nome + '».', { ok: 'Togli' })) {
            const prog = P.programma(p);
            prog.attivita = prog.attivita.filter((x) => x.id !== g.att.id);
        }
        await salvaPaziente(p);
        avviso(`${scelte.length} ${scelte.length === 1 ? 'seduta spostata' : 'sedute spostate'} in «${dest.nome}»${t ? ' · ' + t.testo : ''}`);
    }

    TiceHome.estendi({
        azioni: {
        'sistema-fuori': async (b) => {
            const p = paz(T.pid);
            if (!puoProgrammi(p)) return;
            const g = datiFuori(p).find((x) => x.nome === b.dataset.nome);
            if (g) await correggiDati(p, g);
            T.mantieniScroll = true;
            disegna();
        },
        },
        aggancio: { datiFuori, correggiDati }
    });
})();
