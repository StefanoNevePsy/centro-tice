/**
 * Centro TICE — riordino delle modalità del programma: ogni attività va in una modalità del centro,
 * dentro la sua categoria. Qui anche le scelte di modalità condivise con l'import dei quaderni
 * (stato, riga con le tendine, applicazione al dizionario e campi data-cambio «mod-…»).
 * Spostato da js/tice-home.js: nel nucleo restano il dizionario e il foglio di scelta della modalità.
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, M = window.TiceModalita;
    if (!P || !M || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, esc, barra, avviso, disegna, vai, T, paz, salvaPaziente, puoProgrammi, dizionario, salvaDizionario, opzioniModalita } = X;

    // Stato di una scelta di modalità (anteprima di import o riordino)
    function statoModalita(att) {
        const r = M.riconosci(att, dizionario());
        return Object.assign(r, {
            nome: att.nome, area: att.area || (att.stato && att.stato !== 'attivo' ? 'terminata' : ''),
            nuova: r.nuova ? Object.assign({ id: M.nuovoId(r.nuova.nome) }, r.nuova) : null,
            iniziale: r.certo,
        });
    }
    function sceltaModalita(k) {
        if (k === 'c') return T.classifica && T.classifica.righe;
        const it = T.importazioni[+String(k).slice(1)];
        return it && it.modalita;
    }
    function rigaModalita(k, id, st) {
        const E = M.elenco(dizionario());
        const da = (c) => grezzo(`data-cambio="${c}" data-k="${esc(k)}" data-att="${esc(id)}"`);
        const stato = st.ambiguo ? h`<span class="pill arancio">da scegliere</span>`
            : !st.modalita ? h`<span class="pill arancio">nuova</span>`
            : !st.certo ? h`<span class="pill arancio">da controllare</span>` : '';
        return h`<div class="riga-mod">
            <div><b>${st.nome}</b>${st.area ? h` <span class="sotto piccolo">· ${st.area}</span>` : ''} ${stato}</div>
            ${st.motivo && !st.certo ? h`<div class="sotto piccolo">${st.motivo}</div>` : ''}
            <div class="riga-campi">
                <label class="campo"><span>Modalità</span><select class="campo-in" ${da('mod-scelta')}>
                    <option value="+" ${!st.modalita ? grezzo('selected') : ''}>Nuova modalità…</option>${opzioniModalita(st.modalita)}</select></label>
                ${st.modalita ? h`<label class="campo"><span>Procedura</span><input class="campo-in" maxlength="80" value="${st.variante || ''}" placeholder="—" ${da('mod-variante')}></label>`
                    : h`<label class="campo"><span>Nome</span><input class="campo-in" maxlength="60" value="${st.nuova.nome}" ${da('mod-nuova-nome')}></label>
                    <label class="campo"><span>Categoria</span><select class="campo-in" ${da('mod-nuova-cat')}>${E.categorie.map((c) => h`<option value="${c.id}" ${st.nuova.categoria === c.id ? grezzo('selected') : ''}>${c.nome}</option>`)}</select></label>`}
            </div>
        </div>`;
    }
    // Le scelte fatte → attività classificate e aggiunte al dizionario.
    // Due tabelle con lo stesso nome nuovo diventano la stessa modalità.
    function applicaScelte(coppie) {
        const diz = dizionario();
        const nuoveNome = {};
        M.elenco(diz).modalita.forEach((m) => { nuoveNome[M.normalizza(m.nome)] = m.id; });
        const scelte = coppie.map(([att, st]) => {
            let id = st.modalita, nuova = null;
            if (!id) {
                const nn = M.normalizza(st.nuova.nome);
                if (nuoveNome[nn]) id = nuoveNome[nn];
                else { nuova = { id: st.nuova.id, nome: st.nuova.nome.trim() || 'Nuova modalità', categoria: st.nuova.categoria || 'altro' }; id = nuova.id; nuoveNome[nn] = id; }
            }
            att.modalita = id;
            att.variante = st.modalita ? String(st.variante || '').trim() : '';
            return { chiave: st.chiave, modalita: id, variante: att.variante, nuova };
        });
        const aggiunte = M.aggiunte(scelte, diz);
        const dopo = M.unisci(diz, aggiunte);
        coppie.forEach(([att]) => { const c = M.categoriaDi(att, dopo); if (c) att.setCat = c.nome; });
        return aggiunte;
    }
    async function condividiScelte(aggiunte) {
        try { await salvaDizionario(aggiunte); }
        catch (e) { avviso('Modalità non condivise con il centro: ' + (e.message || e), 'errore'); }
    }

    // ---------- riordino delle modalità per le attività già nel programma ----------
    function vistaClassifica() {
        const p = paz(T.pid);
        if (!p || !T.classifica || T.classifica.pid !== p.id) { T.vista = 'programma'; return X.viste.programma(); }
        const tutte = P.programma(p).attivita.filter((a) => T.classifica.righe[a.id]);
        const vedere = tutte.filter((a) => !T.classifica.righe[a.id].iniziale), ok = tutte.filter((a) => T.classifica.righe[a.id].iniziale);
        return h`${barra({ indietro: 'vai-programma', titolo: 'Modalità', sotto: { testo: p.name } })}
            <main class="tice-main">
                <p class="sotto">Ogni attività va in una modalità del centro, dentro la sua categoria. Le sedute non cambiano: cambiano solo il nome della categoria e il raggruppamento. Le scelte valgono anche per i prossimi quaderni.</p>
                ${vedere.map((a) => rigaModalita('c', a.id, T.classifica.righe[a.id]))}
                ${ok.length ? h`<details data-chiusi="mod-c" ${T.chiusiAperti['mod-c'] ? grezzo('open') : ''}><summary class="sotto">${ok.length} riconosciute: ${ok.map((a) => a.nome + ' → ' + M.etichetta({ modalita: T.classifica.righe[a.id].modalita, variante: T.classifica.righe[a.id].variante }, dizionario())).join(' · ')}</summary>
                    ${ok.map((a) => rigaModalita('c', a.id, T.classifica.righe[a.id]))}</details>` : ''}
                <button class="bt primario largo" style="margin-top:14px" data-a="salva-classifica">${icona('check')} Salva</button>
            </main>`;
    }

    // I campi di una riga di modalità (data-cambio «mod-…»): valgono per l'import e per il riordino
    function cambioModalita(el, e) {
        const c = el.dataset.cambio;
        const righe = sceltaModalita(el.dataset.k);
        const st = righe && righe[el.dataset.att];
        if (!st) return;
        if (c === 'mod-scelta' && e.type === 'change') {
            if (el.value === '+') { st.modalita = null; st.nuova = st.nuova || { id: M.nuovoId(st.nome), nome: st.nome, categoria: st.categoria || 'altro' }; }
            else { st.modalita = el.value; st.categoria = (M.trovaModalita(el.value, dizionario()) || {}).categoria; }
            st.certo = true; st.ambiguo = false;
            T.mantieniScroll = true; disegna();
        } else if (c === 'mod-variante') st.variante = el.value;
        else if (c === 'mod-nuova-nome') st.nuova.nome = el.value;
        else if (c === 'mod-nuova-cat') st.nuova.categoria = el.value;
    }

    // statoModalita, rigaModalita, applicaScelte e condividiScelte servono anche all'import dei quaderni
    Object.assign(X, { statoModalita, rigaModalita, applicaScelte, condividiScelte });
    TiceHome.estendi({
        viste: { classifica: vistaClassifica },
        azioni: {
            classifica: () => {
                const p = paz(T.pid);
                if (!puoProgrammi(p)) return;
                const righe = {};
                P.programma(p).attivita.filter((a) => !a.modalita || !M.trovaModalita(a.modalita, dizionario())).forEach((a) => { righe[a.id] = statoModalita(a); });
                T.classifica = { pid: p.id, righe };
                vai('classifica', p.id);
            },
            'salva-classifica': async () => {
                const p = paz(T.pid);
                if (!p || !T.classifica || !puoProgrammi(p)) return;
                const coppie = P.programma(p).attivita.filter((a) => T.classifica.righe[a.id]).map((a) => [a, T.classifica.righe[a.id]]);
                const aggiunte = applicaScelte(coppie);
                const ora = new Date().toISOString();
                coppie.forEach(([a]) => {
                    a.modificato = ora;
                    (p.history || []).forEach((x) => { if (x.attivitaId === a.id && a.setCat) x.setCat = a.setCat; });
                    delete a.setCat;
                });
                await salvaPaziente(p);
                await condividiScelte(aggiunte);
                T.classifica = null;
                avviso('Modalità salvate');
                vai('programma', p.id);
            }
        },
        cambi: { 'mod-scelta': cambioModalita, 'mod-variante': cambioModalita, 'mod-nuova-nome': cambioModalita, 'mod-nuova-cat': cambioModalita }
    });
})();
