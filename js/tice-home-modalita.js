/**
 * Centro TICE — gestione di categorie e modalità: il foglio per vederle, aggiungerle, rinominarle,
 * spostarle ed eliminarle. Spostato da js/tice-home.js: nel nucleo restano il dizionario e le funzioni
 * che servono anche ai moduli dell'attività (scelta della modalità, creazione senza doppioni).
 */
(function () {
    'use strict';
    const M = window.TiceModalita, P = window.TiceProgramma;
    if (!M || !P || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, icona, foglio, conferma, avviso, pazienti, dizionario, salvaDizionario, sceltaCategoria, campoNuovaCategoria, agganciaNuove, stessaModalita, stessaCategoria, nomeCategoria, categoriaDalModulo, creaModalita, creaCategoria } = X;


    // Il foglio per vedere e aggiungere categorie e modalità
    async function gestisciModalita() {
        for (;;) {
            const E = M.elenco(dizionario());
            const r = await foglio(h`<form><h2>Categorie e modalità</h2>
                <p class="sotto piccolo">Servono a raggruppare le attività nel programma e nelle statistiche. Nel centro valgono per tutti.</p>
                <div class="campo"><span>Nuova modalità (tipo di attività)</span>
                    <div class="riga-campi"><input class="campo-in" name="mod" maxlength="60" placeholder="es. Echo to tact" data-doppione="modalita" autocomplete="off">
                        ${sceltaCategoria('cat', 'altro')}</div>
                    ${campoNuovaCategoria('cat')}
                    <span class="sotto piccolo avviso-doppione" data-doppione-nota></span>
                    <button class="bt piccolo primario" name="azione" value="modalita">${icona('plus')} Aggiungi la modalità</button></div>
                <div class="campo"><span>Nuova categoria</span>
                    <div class="riga-campi"><input class="campo-in" name="categoria" maxlength="60" placeholder="es. Repertori accademici" data-doppione="categoria" autocomplete="off"></div>
                    <span class="sotto piccolo avviso-doppione" data-doppione-nota></span>
                    <button class="bt piccolo" name="azione" value="categoria">${icona('plus')} Aggiungi la categoria</button></div>
                <p class="sotto piccolo">Tocca una categoria o una modalità per rinominarla, spostarla o eliminarla.</p>
                <div class="elenco-modalita">${E.categorie.map((c) => { const ms = E.modalita.filter((m) => m.categoria === c.id); return h`<div class="cat-mod"><button type="button" class="cat-nome" data-foglio="${'c:' + c.id}"><b>${c.nome}</b> ${icona('pen')}</button>${c.centro ? h` <span class="pill grigia">del centro</span>` : ''}<div class="chips">${ms.length ? ms.map((m) => h`<button type="button" class="chip ${m.centro ? 'nuova' : ''}" data-foglio="${'m:' + m.id}">${m.nome}</button>`) : h`<span class="sotto piccolo">nessuna modalità</span>`}</div></div>`; })}</div>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Fatto</button></div></form>`, {
                dopo: agganciaNuove,
                invia: (form, bt) => { const d = Object.fromEntries(new FormData(form)); d.azione = bt && bt.value; return d; }
            });
            if (!r) return;
            if (typeof r === 'string' && /^[mc]:/.test(r)) {
                try { await (r[0] === 'm' ? modificaModalita(r.slice(2)) : modificaCategoria(r.slice(2))); } catch (e) { avviso(e.message || String(e), 'errore'); }
                continue;
            }
            try {
                if (r.azione === 'modalita') {
                    if (!String(r.mod || '').trim()) { avviso('Scrivi il nome della modalità.', 'errore'); continue; }
                    const gia = stessaModalita(r.mod);
                    if (gia) { avviso(`«${gia.nome}» esiste già in ${nomeCategoria(gia.categoria)}.`); continue; }
                    const cat = await categoriaDalModulo(r, 'cat');
                    await creaModalita(r.mod, cat);
                    avviso(`Modalità «${r.mod.trim()}» aggiunta in ${nomeCategoria(cat)}`);
                } else if (r.azione === 'categoria') {
                    if (!String(r.categoria || '').trim()) { avviso('Scrivi il nome della categoria.', 'errore'); continue; }
                    const gia = stessaCategoria(r.categoria);
                    if (gia) { avviso(`La categoria «${gia.nome}» esiste già.`); continue; }
                    await creaCategoria(r.categoria);
                    avviso(`Categoria «${r.categoria.trim()}» aggiunta`);
                }
            } catch (e) { avviso(e.message || String(e), 'errore'); return; }
        }
    }

    // Quante attività (su questo dispositivo) usano una modalità o una categoria
    function usoModalita(ids) {
        const set = new Set(ids);
        return pazienti().reduce((n, p) => n + P.programma(p).attivita.filter((a) => set.has(a.modalita)).length, 0);
    }
    async function modificaModalita(id) {
        const E = M.elenco(dizionario()), m = E.modalita.find((x) => x.id === id);
        if (!m) return;
        const n = usoModalita([id]);
        const r = await foglio(h`<form><h2>Modalità</h2>
            <label class="campo"><span>Nome</span><input name="nome" required maxlength="60" value="${m.nome}" autocomplete="off"></label>
            <div class="campo"><span>Categoria</span>${sceltaCategoria('cat', m.categoria)}${campoNuovaCategoria('cat')}<span class="sotto piccolo avviso-doppione" data-doppione-nota></span></div>
            <p class="sotto piccolo">${n ? `La usano ${n} ${n === 1 ? 'attività' : 'attività'} su questo dispositivo: il nuovo nome e la categoria valgono anche per loro.` : 'Nessuna attività la usa su questo dispositivo.'}</p>
            ${n ? '' : h`<button type="button" class="bt piccolo fantasma pericolo-testo" data-foglio="elimina">${icona('trash')} Elimina la modalità</button>`}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, { dopo: agganciaNuove });
        if (!r) return;
        if (r === 'elimina') {
            if (!await conferma(`Eliminare «${m.nome}»?`, 'Sparisce dall\'elenco delle modalità per tutto il centro.', { ok: 'Elimina', pericolo: true })) return;
            await salvaDizionario({ modalita: [{ id, nome: m.nome, categoria: m.categoria, nascosta: true }], sinonimi: {} });
            avviso(`Modalità «${m.nome}» eliminata`); return;
        }
        const nome = String(r.nome || '').trim();
        const altra = stessaModalita(nome);
        if (altra && altra.id !== id) { avviso(`«${altra.nome}» esiste già in ${nomeCategoria(altra.categoria)}.`, 'errore'); return; }
        const cat = await categoriaDalModulo(r, 'cat');
        await salvaDizionario({ modalita: [{ id, nome, categoria: cat }], sinonimi: {} });
        avviso(`Modalità «${nome}» salvata`);
    }
    async function modificaCategoria(id) {
        const E = M.elenco(dizionario()), c = E.categorie.find((x) => x.id === id);
        if (!c) return;
        const ms = E.modalita.filter((m) => m.categoria === id);
        const r = await foglio(h`<form><h2>Categoria</h2>
            <label class="campo"><span>Nome</span><input name="nome" required maxlength="60" value="${c.nome}" autocomplete="off"></label>
            <p class="sotto piccolo">${ms.length ? `Contiene ${ms.length} ${ms.length === 1 ? 'modalità' : 'modalità'}: per eliminarla, prima spostale o eliminale.` : 'Non contiene modalità.'}</p>
            ${ms.length || id === 'altro' ? '' : h`<button type="button" class="bt piccolo fantasma pericolo-testo" data-foglio="elimina">${icona('trash')} Elimina la categoria</button>`}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
        if (!r) return;
        if (r === 'elimina') {
            if (!await conferma(`Eliminare «${c.nome}»?`, 'Sparisce dall\'elenco delle categorie per tutto il centro.', { ok: 'Elimina', pericolo: true })) return;
            await salvaDizionario({ categorie: [{ id, nome: c.nome, nascosta: true }], modalita: [], sinonimi: {} });
            avviso(`Categoria «${c.nome}» eliminata`); return;
        }
        const nome = String(r.nome || '').trim();
        const altra = stessaCategoria(nome);
        if (altra && altra.id !== id) { avviso(`La categoria «${altra.nome}» esiste già.`, 'errore'); return; }
        await salvaDizionario({ categorie: [{ id, nome }], modalita: [], sinonimi: {} });
        avviso(`Categoria «${nome}» salvata`);
    }

    TiceHome.estendi({ aggancio: { gestisciModalita } });
})();
