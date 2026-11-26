/**
 * Centro TICE — il modulo dell'attività e dei target: il foglio per creare e modificare un'attività
 * (con le sue prese dati, condizioni, target numerati) e quello per aggiungere target a mano, da un set
 * dell'archivio o da una lista del Quaderno. Spostato da js/tice-home.js: il nucleo chiama queste funzioni
 * al momento dell'uso, tramite i punti di aggancio registrati in fondo (e fra gli strumenti per gli altri moduli).
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, M = window.TiceModalita;
    if (!P || !M || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, esc, foglio, avviso, salvaPaziente, formatoData, dizionario, eGruppo, allineaMembri, ecoico, sec, setArchivio, etichettaModo,
        impostaCondizioni, opzioniModalita, scegliModalita, sceltaCategoria, campoNuovaCategoria, agganciaNuove, categoriaDalModulo, creaModalita } = X;

    const MODI_ESCLUSI = ['quaderno', 'quaderno_task', 'pool_random', 'pool_intraverbal'];
    function listeQuaderno() {
        return ((typeof state !== 'undefined' && state.savedSets) || []).filter((s) => (s.modes || []).includes('quaderno') && !(s.modes || []).includes('quaderno_task'));
    }
    const listeTA = () => ((typeof state !== 'undefined' && state.savedSets) || []).filter((s) => (s.modes || []).includes('quaderno_task'));
    const modiDi = (sets) => [...new Set(sets.flatMap((x) => x.modes || []))].filter((m) => !MODI_ESCLUSI.includes(m));
    // Il gioco per uno o più set insieme: quello voluto se va bene per tutti, altrimenti il primo che va bene
    function modoPerSet(scelti, voluto) {
        if (!scelti.length) return voluto || '';
        const comuni = (scelti[0].modes || []).filter((m) => !MODI_ESCLUSI.includes(m) && scelti.every((x) => (x.modes || []).includes(m)));
        return comuni.includes(voluto) ? voluto : (comuni[0] || voluto || '');
    }
    const nomeCategoria = (x) => x.cat || x.category || '';
    // I set dell'archivio da scegliere: ricerca, elenco e, con due o più, «separati / insieme».
    // `pre` è il prefisso dei nomi dei campi (il foglio dei target usa «», il modulo dell'attività «g_»).
    function elencoSet(pre, sets, scelti, senzaUnione) {
        return h`<input type="search" placeholder="Cerca un set" data-filtro-set autocomplete="off" style="margin-bottom:6px">
            <div class="opzioni" style="max-height:34vh;overflow-y:auto" data-elenco-set>
                ${sets.map((x) => h`<label class="opzione" data-nome="${String(x.name + ' ' + nomeCategoria(x)).toLowerCase()}" data-modi="${(x.modes || []).join(' ')}">
                    <input type="checkbox" name="${pre + 's'}" value="${x.id}" ${(scelti || []).includes(x.id) ? grezzo('checked') : ''}><span class="corpo">${x.name}<small>${nomeCategoria(x)}${x.items ? ' · ' + x.items.length + ' elementi' : ''}</small></span></label>`)}
            </div>
            <div class="campo ma-unione" data-unione hidden style="margin-top:8px"><span>${icona('layer-group')} Con più set scelti</span>
                ${senzaUnione ? h`<span class="sotto piccolo">I set scelti si usano insieme in questo target: il gioco usa gli stimoli di tutti e il risultato è unico, con il dettaglio per set.</span>` : h`<div class="scelta verticale">
                    <label><input type="radio" name="${pre + 'unione'}" value="separati" checked><span>Set separati <small class="sotto">· un target per ogni set, uno dopo l'altro</small></span></label>
                    <label><input type="radio" name="${pre + 'unione'}" value="insieme"><span>Set insieme <small class="sotto">· un solo target: il gioco usa gli stimoli di tutti i set e il risultato è unico, con il dettaglio per set</small></span></label>
                </div>`}
                <span class="sotto piccolo avviso-doppione" data-unione-nota></span></div>`;
    }
    const sceltaGioco = (nome, modi, corrente, vuoto) => h`<select name="${nome}">${vuoto ? h`<option value="">${vuoto}</option>` : ''}
        ${modi.map((m) => h`<option value="${m}" ${m === corrente ? grezzo('selected') : ''}>${etichettaModo(m)}</option>`)}</select>`;
    // Collega i comportamenti dell'elenco: filtro, «separati / insieme» (compare con due o più set), gioco adatto a tutti
    function agganciaElencoSet(f, pre) {
        const filtro = f.querySelector('[data-filtro-set]');
        if (filtro) filtro.addEventListener('input', () => {
            const q = filtro.value.trim().toLowerCase();
            f.querySelectorAll('[data-elenco-set] > label').forEach((l) => { l.hidden = !!q && !l.dataset.nome.includes(q) && !l.querySelector('input').checked; });
        });
        const box = f.querySelector('[data-unione]');
        if (!box) return;
        const nota = box.querySelector('[data-unione-nota]'), modo = f.querySelector(`[name="${pre}modo"]`);
        const conto = f.querySelector('[data-g-conto]');
        const aggiorna = () => {
            const scelti = [...f.querySelectorAll('[data-elenco-set] input:checked')];
            box.hidden = scelti.length < 2;
            if (conto) conto.textContent = scelti.length ? `· ${scelti.length} ${scelti.length === 1 ? 'scelto' : 'scelti'}` : '';
            const radio = box.querySelector(`[name="${pre}unione"]:checked`);
            const insieme = !box.hidden && (!radio || radio.value === 'insieme');
            const manca = insieme && modo && modo.value ? scelti.filter((i) => !String(i.closest('label').dataset.modi || '').split(' ').includes(modo.value)).map((i) => i.closest('label').querySelector('.corpo').firstChild.textContent.trim()) : [];
            nota.textContent = manca.length ? `«${manca.join('», «')}» non ${manca.length === 1 ? 'è adatto' : 'sono adatti'} a questo gioco: scegli un gioco che vada bene per tutti i set.` : '';
        };
        f.addEventListener('change', aggiorna);
        aggiorna();
    }
    function moduloTarget(att) {
        const sets = setArchivio();
        const liste = listeQuaderno();
        const ta = listeTA();
        const modi = modiDi(sets);
        const modoPred = att.mode || (modi.includes('tact') ? 'tact' : modi[0]);
        return foglio(h`<form><h2>Nuovi target · ${att.nome}</h2>
            ${(() => { const nn = numerazione(att); return h`<div class="campo"><span>${icona('arrow-down-1-9')} Numerati <small class="sotto">· es. Set 1, Set 2, Set 3…</small></span>
                <div class="riga-campi" style="align-items:center"><input name="num_nome" maxlength="60" value="${nn ? nn.nome : 'Set'}" aria-label="Nome" style="flex:2">
                <span>da</span><input name="num_da" type="number" min="0" max="999" inputmode="numeric" value="${nn ? nn.prossimo : 1}" aria-label="Dal numero" style="flex:1">
                <span>a</span><input name="num_a" type="number" min="0" max="999" inputmode="numeric" value="" placeholder="—" aria-label="Al numero" style="flex:1"></div>
                <span class="sotto piccolo">Lascia vuoto «a» per non aggiungerne.</span></div>`; })()}
            <label class="campo"><span>Scritti a mano, uno per riga, nell'ordine in cui lavorarli</span><textarea name="t" placeholder="es. Battere le mani&#10;Toccare la testa"></textarea></label>
            ${sets.length ? h`<h3>Dall'archivio dei set</h3>
                <p class="sotto piccolo">Su tablet e computer, toccando l'attività si apre direttamente il gioco con il set, pronto da somministrare. Per legare target già scritti (es. «Set 1») a un set, usa «Collega i target ai set» dal programma.</p>
                ${elencoSet('', sets)}
                <label class="campo" style="margin-top:8px"><span>Con il gioco</span>${sceltaGioco('modo', modi, modoPred)}</label>` : ''}
            <details class="ta-nuova" ${ta.length ? '' : grezzo('open')}><summary><b>${icona('list-ol')} Task analysis</b> <span class="sotto piccolo">un target fatto di passi, segnati uno alla volta</span></summary>
                <label class="campo"><span>Nome</span><input name="ta_nome" placeholder="es. Lavarsi le mani" autocomplete="off"></label>
                <label class="campo"><span>Passi, uno per riga, nell'ordine</span><textarea name="ta_passi" rows="5" placeholder="Apre il rubinetto&#10;Mette le mani sotto l'acqua&#10;Prende il sapone"></textarea></label>
                ${ta.length ? h`<label class="campo"><span>Oppure da una task analysis dell'archivio</span><select name="ta_lista"><option value="">—</option>
                    ${ta.map((x) => h`<option value="${x.id}">${x.name} (${(x.items || []).length} passi)</option>`)}</select></label>` : ''}
            </details>
            ${liste.length ? h`<label class="campo"><span>Da una lista del Quaderno</span><select name="lista"><option value="">—</option>
                ${liste.map((x) => h`<option value="${x.id}">${x.name} (${(x.items || []).length})</option>`)}</select></label>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Aggiungi</button></div></form>`,
        {
            invia: (f) => {
                const fd = new FormData(f);
                const numA = String(fd.get('num_a') || '').trim();
                const numerati = numA ? nomiNumerati(fd.get('num_nome'), fd.get('num_da'), numA).join('\n') : '';
                return { t: [numerati, fd.get('t') || ''].filter(Boolean).join('\n'), set: fd.getAll('s'), modo: fd.get('modo') || '', unione: fd.get('unione') || 'separati', lista: fd.get('lista') || '',
                    taNome: fd.get('ta_nome') || '', taPassi: fd.get('ta_passi') || '', taLista: fd.get('ta_lista') || '' };
            },
            dopo: (f) => agganciaElencoSet(f, '')
        });
    }
    function aggiungiTargetDaModulo(att, r) {
        String(r.t || '').split('\n').map((x) => x.trim()).filter(Boolean).forEach((x) => P.aggiungiTarget(att, x, true));
        const sets = setArchivio();
        const scelti = r.set.map((id) => sets.find((y) => y.id === id)).filter(Boolean);
        if (r.unione === 'insieme' && scelti.length > 1) {
            // più set in un solo target: il gioco usa gli stimoli di tutti, il risultato è unico
            const modo = modoPerSet(scelti, r.modo);
            P.aggiungiTarget(att, { testo: scelti.map((x) => x.name).join(' + '), setId: scelti[0].id, setIds: scelti.map((x) => x.id), mode: modo }, true);
            if (!att.mode && modo) att.mode = modo;
        } else scelti.forEach((x) => {
            const modo = modoPerSet([x], r.modo);
            P.aggiungiTarget(att, { testo: x.name, setId: x.id, mode: modo }, true);
            if (!att.mode && modo) att.mode = modo;
        });
        const passiScritti = String(r.taPassi || '').split('\n').map((x) => x.trim()).filter(Boolean);
        if (passiScritti.length) P.aggiungiTarget(att, { testo: String(r.taNome || '').trim() || 'Task analysis', passi: passiScritti }, true);
        if (r.taLista) {
            const l = listeTA().find((y) => String(y.id) === String(r.taLista));
            const passi = ((l && l.items) || []).map((it) => String(it.name || it.label || '').trim()).filter(Boolean);
            if (passi.length) P.aggiungiTarget(att, { testo: (passiScritti.length ? '' : String(r.taNome || '').trim()) || l.name, passi }, true);
        }
        if (r.lista) {
            const l = listeQuaderno().find((y) => y.id === r.lista);
            ((l && l.items) || []).forEach((it) => {
                const n = String(it.name || it.label || '').trim();
                if (n) P.aggiungiTarget(att, n, true);
            });
        }
    }

    // ---------- collegare i target ai set dell'archivio e al gioco ----------
    const eTA = (t) => P.passiDi(t).length > 0;
    const nomeSetDi = (archivio, id) => ((archivio.find((x) => x.id === id) || {}).name || '');
    // Foglio per scegliere uno o più set (usati insieme) e, facoltativo, il gioco.
    // Restituisce { s: [id…], modo } oppure 'scollega' oppure null.
    function scegliSet(opz) {
        const archivio = opz.archivio, modi = modiDi(archivio);
        const modoPred = opz.modo && modi.includes(opz.modo) ? opz.modo : (modi.includes('tact') ? 'tact' : modi[0]);
        return foglio(h`<form class="scelta-set"><h2>${opz.titolo}</h2>
            <p class="sotto piccolo">${opz.intro}</p>
            ${elencoSet('', archivio, opz.scelti, true)}
            ${opz.senzaGioco ? '' : h`<label class="campo" style="margin-top:8px"><span>${icona('gamepad')} Con il gioco</span>${sceltaGioco('modo', modi, modoPred)}</label>`}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button>
                ${opz.scollega ? h`<button type="button" class="bt" data-foglio="scollega">${icona('link-slash')} Scollega</button>` : ''}
                <button class="bt primario">${opz.ok || 'Salva'}</button></div></form>`,
        { invia: (f) => {
            const fd = new FormData(f), ids = fd.getAll('s');
            if (!ids.length) { avviso('Scegli almeno un set', 'errore'); return undefined; }
            return { s: ids, modo: fd.get('modo') || '' };
        }, dopo: (f) => agganciaElencoSet(f, '') });
    }
    // Collega un target ai set scelti (il testo, lo stato, le sedute restano) e imposta il gioco
    function collegaTarget(p, att, t, ids, modo) {
        const archivio = setArchivio();
        const scelti = ids.map((id) => archivio.find((x) => x.id === id)).filter(Boolean);
        const m = modoPerSet(scelti, modo);
        P.collegaSet(p, att, t, ids, m);
        if (m && !att.mode) att.mode = m;
    }
    // Dal menu di un target: collegarlo a un set (o a più, insieme), cambiarlo, scollegarlo. true se è cambiato qualcosa.
    async function cambiaSetTarget(p, att, t) {
        const archivio = setArchivio();
        if (!archivio.length) { avviso('L\'archivio dei set è vuoto: crea o scarica un set dai giochi.'); return false; }
        const attuali = P.setIdsDi(t);
        const r = await scegliSet({ archivio, scelti: attuali, modo: P.modoTarget(att, t), scollega: !!attuali.length,
            titolo: (attuali.length ? 'Set · ' : 'Collega a un set · ') + t.testo,
            intro: 'Con più set il gioco usa gli stimoli di tutti insieme: il risultato è uno solo, con il dettaglio per set e per stimolo. Le sedute già registrate restano su questo target.' });
        if (!r) return false;
        if (r === 'scollega') { P.scollegaSet(p, att, t); return true; }
        // i set che non sono su questo dispositivo restano com'erano
        const ids = attuali.filter((id) => !archivio.some((x) => x.id === id)).concat(r.s);
        collegaTarget(p, att, t, ids, r.modo);   // il nome del target non cambia mai
        return true;
    }
    // Quanti target dell'attività sono collegati a un set (esclusa la task analysis)
    function statoCollegamenti(att) {
        const tg = (att.target || []).filter((t) => !eTA(t));
        return { tot: tg.length, collegati: tg.filter((t) => t.setId).length };
    }
    // Il foglio «Collega i target ai set»: per ogni target la scelta del set (con una proposta per nome simile
    // da confermare) e un gioco comune all'attività. Restituisce true se il programma è cambiato.
    async function abbinaSet(p, att) {
        const archivio = setArchivio();
        const tgs = (att.target || []).filter((t) => !eTA(t));
        if (!archivio.length) { avviso('L\'archivio dei set è vuoto: crea o scarica i set dai giochi.'); return false; }
        if (!tgs.length) { avviso('L\'attività non ha ancora target da collegare.'); return false; }
        const modi = modiDi(archivio);
        const modoPred = att.mode && modi.includes(att.mode) ? att.mode : (tgs.map((t) => P.modoTarget(att, t)).find((m) => m && modi.includes(m)) || (modi.includes('tact') ? 'tact' : modi[0]));
        // proposte (mai applicate da sole): set non ancora usati, nella stessa categoria di quelli già collegati, uno per target
        const usati = tgs.flatMap((t) => P.setIdsDi(t));
        const categorie = usati.map((id) => nomeCategoria(archivio.find((x) => x.id === id) || {})).filter(Boolean);
        const sugg = {};
        const esclusi = usati.slice();
        tgs.filter((t) => !t.setId).forEach((t) => {
            const x = P.suggerisciSet(t.testo, archivio, { categorie, categorieDeboli: [att.area, att.nome].filter(Boolean), esclusi });
            if (x) { sugg[t.id] = x; esclusi.push(x.id); }
        });
        const nSugg = Object.keys(sugg).length;
        const riga = (t) => {
            const ids = P.setIdsDi(t), s = sugg[t.id];
            return h`<div class="ab-riga" data-tid="${t.id}">
                <div class="ab-t"><b>${t.testo}</b> <small class="sotto">${P.STATI_TARGET[t.stato] || ''}</small></div>
                <input type="hidden" name="${'set_' + t.id}" value="${ids.join(',')}">
                <div class="ab-scelta"><span class="ab-set" data-ab-etichetta></span>
                    <button type="button" class="bt piccolo" data-ab-scegli>${icona('layer-group')} <span data-ab-testo-bt>Scegli il set…</span></button></div>
                ${s ? h`<div class="ab-sugg" data-ab-sugg="${s.id}"><span class="sotto piccolo">${icona('wand-magic-sparkles')} Forse: <b>${s.nome}</b></span>
                    <button type="button" class="bt piccolo fantasma" data-ab-accetta>Usa questo</button></div>` : ''}
                <div class="ab-nota sotto piccolo avviso-doppione" data-ab-nota></div></div>`;
        };
        const r = await foglio(h`<form class="abbina-set"><h2>Collega i target ai set · ${att.nome}</h2>
            <p class="sotto piccolo">Per ogni target scegli il set dell'archivio (anche più d'uno, usati insieme). Sedute, stato e storico restano com'erano: cambia solo il collegamento. I suggerimenti vanno confermati.</p>
            <label class="campo"><span>${icona('gamepad')} Gioco dell'attività</span>${sceltaGioco('modo', modi, modoPred)}</label>
            ${nSugg ? h`<button type="button" class="bt piccolo" data-ab-tutti style="margin-bottom:8px">${icona('wand-magic-sparkles')} Usa tutti i suggerimenti (${nSugg})</button>` : ''}
            <div class="ab-elenco">${tgs.map(riga)}</div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        { invia: (f) => {
            const fd = new FormData(f), scelte = {};
            tgs.forEach((t) => { scelte[t.id] = String(fd.get('set_' + t.id) || ''); });
            return { modo: fd.get('modo') || '', scelte };
        }, dopo: (f) => {
            const modo = f.querySelector('[name=modo]');
            const rigaDi = (tid) => f.querySelector(`.ab-riga[data-tid="${tid}"]`);
            const idsDi = (el) => { const v = el.querySelector('input[type=hidden]').value; return v && v !== '-' ? v.split(',') : []; };
            const aggiorna = () => f.querySelectorAll('.ab-riga').forEach((el) => {
                const v = el.querySelector('input[type=hidden]').value, ids = idsDi(el);
                const e = el.querySelector('[data-ab-etichetta]'), bt = el.querySelector('[data-ab-testo-bt]'), sg = el.querySelector('[data-ab-sugg]'), nota = el.querySelector('[data-ab-nota]');
                e.textContent = v === '-' ? 'Verrà scollegato' : ids.length ? ids.map((id) => nomeSetDi(archivio, id) || '(set non su questo dispositivo)').join(' + ') : 'Nessun set';
                e.classList.toggle('vuoto', !ids.length);
                bt.textContent = ids.length ? 'Cambia…' : 'Scegli il set…';
                if (sg) sg.hidden = !!ids.length || v === '-';
                const sel = ids.map((id) => archivio.find((x) => x.id === id)).filter(Boolean);
                const adatto = !sel.length || !modo.value || sel.every((x) => (x.modes || []).includes(modo.value));
                nota.textContent = adatto ? '' : `Non adatto al gioco «${etichettaModo(modo.value)}»: per questo target si userà ${etichettaModo(modoPerSet(sel, modo.value))}.`;
            });
            f.querySelectorAll('[data-ab-scegli]').forEach((b) => b.addEventListener('click', async () => {
                const el = b.closest('.ab-riga'), t = tgs.find((x) => x.id === el.dataset.tid);
                const c = await scegliSet({ archivio, scelti: idsDi(el), senzaGioco: true, scollega: !!t.setId || idsDi(el).length > 0, titolo: 'Set per ' + t.testo,
                    intro: 'Con più set il gioco usa gli stimoli di tutti insieme, con un risultato unico.', ok: 'Scegli' });
                if (!c) return;
                el.querySelector('input[type=hidden]').value = c === 'scollega' ? (t.setId ? '-' : '') : c.s.join(',');
                aggiorna();
            }));
            f.querySelectorAll('[data-ab-accetta]').forEach((b) => b.addEventListener('click', () => {
                const el = b.closest('.ab-riga'); el.querySelector('input[type=hidden]').value = el.querySelector('[data-ab-sugg]').dataset.abSugg; aggiorna();
            }));
            const tutti = f.querySelector('[data-ab-tutti]');
            if (tutti) tutti.addEventListener('click', () => { f.querySelectorAll('[data-ab-accetta]').forEach((b) => { const el = b.closest('.ab-riga'); if (!idsDi(el).length) b.click(); }); tutti.hidden = true; });
            modo.addEventListener('change', aggiorna);
            aggiorna();
        } });
        if (!r) return false;
        let n = 0;
        tgs.forEach((t) => {
            const v = r.scelte[t.id] || '';
            if (v === '-') { P.scollegaSet(p, att, t); n++; return; }
            const ids = v ? v.split(',') : [];
            if (!ids.length) return;
            const stesso = P.setIdsDi(t).join(',') === ids.join(',');
            if (stesso && (!r.modo || P.modoTarget(att, t) === r.modo)) return;
            collegaTarget(p, att, t, ids, r.modo); n++;
        });
        if (r.modo && modi.includes(r.modo)) att.mode = r.modo;
        att.modificato = new Date().toISOString();
        avviso(n ? `${att.nome}: ${n} ${n === 1 ? 'target collegato' : 'target collegati'} ai set` : `${att.nome}: nessun collegamento cambiato`);
        return true;
    }

    // Modalità scelta nel modulo, o riconosciuta dal nome quando è sicura
    // "+ Nuova modalità…" nel modulo: la si crea (o si usa quella con lo stesso nome)
    async function risolviNuovaModalita(r) {
        if (r.modalita !== '+') return;
        r.modalita = String(r.mod_nome || '').trim() ? await creaModalita(r.mod_nome, await categoriaDalModulo(r, 'mod_cat')) : '';
    }
    function modalitaDaModulo(att, r) {
        if (r.modalita) { att.modalita = r.modalita; att.variante = String(r.variante || '').trim(); return; }
        const x = M.riconosci(att, dizionario());
        if (x.modalita && x.certo) { att.modalita = x.modalita; att.variante = String(r.variante || '').trim() || x.variante; }
        else { delete att.modalita; att.variante = String(r.variante || '').trim(); }
    }
    // Field (quanti stimoli fra cui scegliere) e prompt visivo (le caselle «prima poi dopo»)
    function impostaField(o, field, prompt) {
        const f = parseInt(field, 10);
        if (f >= 1 && f <= 20) o.field = f; else delete o.field;
        const pv = String(prompt || '').trim().slice(0, 200);
        if (pv) o.promptVisivo = pv; else delete o.promptVisivo;
    }

    const campiCondizioni = (pre, c) => h`<div class="riga-campi campi-cond">
        <label class="campo"><span>✓ vale come corretta</span><input name="${pre + 'cV'}" maxlength="200" value="${(c && c.V) || ''}" placeholder="es. ordina le 3 carte giuste"></label>
        <label class="campo"><span>P / e+ promptata</span><input name="${pre + 'cP'}" maxlength="200" value="${(c && c.P) || ''}" placeholder="es. con le caselle prima/poi/dopo"></label>
        <label class="campo"><span>✗ errata</span><input name="${pre + 'cX'}" maxlength="200" value="${(c && c.X) || ''}" placeholder="es. ordine sbagliato o nessuna risposta"></label></div>`;
    // Le prese dati scritte nel modulo: quelle già esistenti tengono il loro id (e i dati)
    function impostaMisure(att, r) {
        const righe = Object.keys(r).filter((k) => /^ms_nome_\d+$/.test(k)).sort((x, y) => +x.slice(8) - +y.slice(8))
            .map((k) => { const i = k.slice(8); return { id: String(r['ms_id_' + i] || ''), nome: String(r[k] || '').trim(), mant: !!r['ms_mant_' + i],
                tipo: ['independent', 'timedelay', 'ecoico'].includes(r['ms_tipo_' + i]) ? r['ms_tipo_' + i] : '', sugg: String(r['ms_sugg_' + i] || '').trim(),
                prove: Math.min(200, parseInt(r['ms_prove_' + i], 10) || 0), field: r['ms_field_' + i], cV: r['ms_' + i + '_cV'], cP: r['ms_' + i + '_cP'], cX: r['ms_' + i + '_cX'] }; })
            .filter((x) => x.nome);
        const viste = new Set();
        const nuove = righe.filter((x) => { const k = x.nome.toLowerCase(); if (viste.has(k)) return false; viste.add(k); return true; }).slice(0, 8);
        if (nuove.length < 2) { delete att.misure; return; }
        const prima = att.misure || [];
        att.misure = nuove.map((x) => {
            const vecchia = prima.find((m) => m.id === x.id) || prima.find((m) => m.nome.toLowerCase() === x.nome.toLowerCase());
            const m = { id: vecchia ? vecchia.id : P.nuovoId('ms'), nome: x.nome };
            if (x.mant) m.mantenimento = true;
            if (x.tipo) m.tipo = x.tipo;
            if (x.sugg) m.suggerimenti = x.sugg;
            if (x.prove > 0) m.prove = x.prove;
            impostaField(m, x.field, vecchia && vecchia.promptVisivo);
            impostaCondizioni(m, x.cV, x.cP, x.cX);
            return m;
        });
    }
    // ---------- target numerati: «Set 1, Set 2, Set 3…» ----------
    // Il nome più usato fra i target che finiscono con un numero, e il numero che viene dopo
    function numerazione(att) {
        const conta = {};
        (att.target || []).forEach((t) => {
            const m = /^(.*?)\s*(\d+)$/.exec(String(t.testo || '').trim());
            if (!m) return;
            const k = m[1].trim(), x = conta[k] || (conta[k] = { nome: k, n: 0, max: 0 });
            x.n++; x.max = Math.max(x.max, +m[2]);
        });
        const best = Object.values(conta).sort((a, b) => b.n - a.n || b.max - a.max)[0];
        return best ? { nome: best.nome, prossimo: best.max + 1 } : null;
    }
    function nomiNumerati(nome, da, a) {
        nome = String(nome || '').trim();
        da = Math.max(0, parseInt(da, 10) || 0); a = Math.max(da, Math.min(da + 49, parseInt(a, 10) || da));
        const out = [];
        for (let i = da; i <= a; i++) out.push((nome ? nome + ' ' : '') + i);
        return out;
    }
    // I target da aggiungere dal modulo di un'attività già esistente
    function targetDaAggiungere(r) {
        if (r.tmodo === 'num') {
            const q = parseInt(r.num_quanti, 10) || 0;
            return q > 0 ? nomiNumerati(r.num_nome, r.num_da, (parseInt(r.num_da, 10) || 1) + q - 1) : [];
        }
        return String(r.nuoviTarget || '').split('\n').map((x) => x.trim()).filter(Boolean);
    }

    // Una nuova attività dal modulo (dal programma o da una seduta): modalità, target, sottoattività
    async function creaAttivitaDaModulo(p, r) {
        // come sono stati scritti i target: numerati, a mano, task analysis, o dopo
        if (r.tmodo === 'num') r.target = nomiNumerati(r.num_nome, r.num_da, r.num_a).join('\n');
        else if (r.tmodo === 'ta') r.ta = true;
        else if (r.tmodo === 'dopo') r.target = '';
        if (r.tmodo && r.tmodo !== 'ta') { r.ta = false; }
        try { await risolviNuovaModalita(r); } catch (e) { avviso('Modalità non creata: ' + (e.message || e), 'errore'); r.modalita = ''; }
        const passiTA = r.ta ? String(r.taPassi || '').split('\n').map((x) => x.trim()).filter(Boolean) : [];
        const righe = passiTA.length ? [String(r.taCompito || '').trim() || String(r.nome || '').trim() || 'Compito']
            : String(r.target || '').split('\n').map((x) => x.trim()).filter(Boolean);
        const att = P.nuovaAttivita(p, Object.assign({}, r, { target: null, sessionType: r.sessionType === 'timedelay' ? 'timedelay' : 'independent' }));
        if (r.sessionType === 'ecoico') { att.risposte = 'ecoico'; att.nomeP = 'Ecoica'; }
        if (r.colore) att.colore = r.colore;
        impostaField(att, r.field, r.promptVisivo);
        impostaCondizioni(att, r.cV, r.cP, r.cX);
        if (eGruppo(p)) allineaMembri(p); else impostaMisure(att, r);
        modalitaDaModulo(att, r);
        righe.forEach((x, i) => P.aggiungiTarget(att, x, i === 0));
        if (passiTA.length && att.target && att.target[0]) att.target[0].passi = P.nuoviPassi(passiTA, []);
        // la sezione «Gioco» del modulo: il gioco dell'attività (i nomi dei target restano quelli scritti)
        if (r.g_modo) att.mode = r.g_modo;
        await salvaPaziente(p);
        if (r.g_collega && righe.length && !passiTA.length) { if (await abbinaSet(p, att)) await salvaPaziente(p); }
        if (!righe.length) {
            // nessun target scritto: si sceglie subito da set, liste o a mano
            const rt = await moduloTarget(att);
            if (rt) { aggiungiTargetDaModulo(att, rt); await salvaPaziente(p); }
        }
        return att;
    }
    function moduloAttivita(p, att, base) {
        const a = att || Object.assign({ nome: '', area: '', descrizione: '', sessionType: 'independent', criterio: { soglia: 90, sedute: 2 }, prove: null }, base || {});
        const tdA = att ? P.tdDi(att) : null;
        const tipoA = ecoico(a) ? 'ecoico' : a.sessionType === 'timedelay' ? 'timedelay' : 'independent';
        const nMis = (a.misure || []).length;
        const conTesti = !!(a.descrizione || a.suggerimenti);
        const conDato = !!(+a.prove > 0);
        const conField = !!(a.field || a.promptVisivo), conCond = !!(a.condizioni && Object.keys(a.condizioni).length);
        const num = att ? numerazione(att) : null;
        const testa = (ic, titolo, sotto) => h`<div class="ma-testa"><span class="ma-ic">${icona(ic)}</span><h3>${titolo}</h3>${sotto ? h`<span class="ma-sotto">${sotto}</span>` : ''}</div>`;
        const tile = (val, mini, nome, sp) => h`<label class="ma-tile"><input type="radio" name="sessionType" value="${val}" ${tipoA === val ? grezzo('checked') : ''}><span class="ma-mini">${mini.map(([c, t]) => h`<i class="${c}">${t}</i>`)}</span><b>${nome}</b><small>${sp}</small></label>`;
        const chipOpz = (k, ic, nome, on) => h`<button type="button" class="ma-chip ${on ? 'on' : ''}" data-ma-apri="${k}" aria-pressed="${on ? 'true' : 'false'}">${icona(ic)} ${nome}</button>`;
        const chipSpunta = (nomeCampo, ic, nome, on, titolo) => h`<label class="ma-chip ${on ? 'on' : ''}" title="${titolo}"><input type="checkbox" name="${nomeCampo}" ${on ? grezzo('checked') : ''}>${icona(ic)} ${nome}</label>`;
        const archivio = setArchivio(), modiG = modiDi(archivio);
        if (a.mode && !modiG.includes(a.mode)) modiG.unshift(a.mode);
        const coll = att ? statoCollegamenti(att) : null;
        return foglio(h`<form class="modulo-att ma"><h2>${att ? 'Modifica attività' : 'Nuova attività'}</h2>
            <div class="ma-anteprima" data-ma-anteprima aria-live="polite"></div>

            <section class="ma-card">${testa('tag', 'Cosa')}
                <label class="campo"><span>Nome</span><input name="nome" required maxlength="120" value="${a.nome}" ${att ? '' : grezzo('autofocus')} placeholder="es. TACT, Cosa faresti se…?"></label>
                <div class="riga-campi">
                    <label class="campo"><span>${icona('layer-group')} Modalità</span><select name="modalita" class="campo-in" data-mod-scelta><option value="">Dal nome, in automatico</option>${opzioniModalita(a.modalita)}<option value="+">+ Nuova modalità…</option></select></label>
                    <label class="campo"><span>Procedura <small class="sotto">· facoltativa</small></span><input name="variante" maxlength="80" value="${a.variante || ''}" placeholder="es. intensiva"></label>
                </div>
                <div class="campo nuova-modalita" data-mod-nuova hidden><span>Nuova modalità</span>
                    <div class="riga-campi"><input class="campo-in" name="mod_nome" maxlength="60" placeholder="Nome, es. Echo to tact" data-doppione="modalita" autocomplete="off">
                        ${sceltaCategoria('mod_cat', 'altro')}</div>
                    ${campoNuovaCategoria('mod_cat')}
                    <span class="sotto piccolo avviso-doppione" data-doppione-nota></span></div>
                <div class="campo"><span>${icona('palette')} Colore</span><div class="colori-att">
                    <label title="Automatico"><input type="radio" name="colore" value="" ${!a.colore ? grezzo('checked') : ''}><span class="auto" style="--col:${att ? P.coloreDi(p, att, true) : P.PALETTE[P.programma(p).attivita.length % P.PALETTE.length]}">A</span></label>
                    ${P.PALETTE.map((c) => h`<label><input type="radio" name="colore" value="${c}" ${a.colore === c ? grezzo('checked') : ''}><span style="--col:${c}"></span></label>`)}
                </div></div>
            </section>

            <section class="ma-card">${testa('bullseye', 'Target', att ? `${(att.target || []).length} nel programma` : 'dal primo al successivo')}
                ${att ? h`${(att.target || []).length ? h`<p class="ma-target-elenco">${att.target.map((t) => h`<span class="ma-t ${t.stato}">${t.testo}</span>`)}</p>` : ''}
                    <div class="ma-modi" role="radiogroup" aria-label="Come aggiungere target">
                        <label class="ma-chip ${num ? 'on' : ''}"><input type="radio" name="tmodo" value="num" ${num ? grezzo('checked') : ''}>${icona('arrow-down-1-9')} Numerati</label>
                        <label class="ma-chip ${num ? '' : 'on'}"><input type="radio" name="tmodo" value="elenco" ${num ? '' : grezzo('checked')}>${icona('list-ul')} A mano</label></div>
                    <div data-tmodo="num" ${num ? '' : grezzo('hidden')} class="ma-num">
                        <span>Aggiungi</span><input name="num_quanti" type="number" min="0" max="50" inputmode="numeric" value="${num ? 0 : 3}" class="ma-n">
                        <span>set dopo</span><input name="num_nome" maxlength="60" value="${num ? num.nome : 'Set'}" class="ma-nome"><b data-num-da>${num ? num.prossimo - 1 : 0}</b>
                        <input type="hidden" name="num_da" value="${num ? num.prossimo : 1}">
                        <span class="sotto piccolo ma-num-anteprima" data-num-anteprima></span></div>
                    <label class="campo" data-tmodo="elenco" ${num ? grezzo('hidden') : ''}><span>Uno per riga <small class="sotto">· vanno in coda, dopo quelli che ci sono</small></span><textarea name="nuoviTarget" rows="2" placeholder="es. Vestiti 4"></textarea></label>
                    <span class="sotto piccolo">Per rinominarli, riordinarli o chiuderli: dal programma, con ⋯ accanto a ogni target. Per legarli ai set: la sezione «Gioco» qui sotto.</span>`
                : h`<div class="ma-modi" role="radiogroup" aria-label="Come sono i target">
                        <label class="ma-chip on"><input type="radio" name="tmodo" value="num" checked>${icona('arrow-down-1-9')} Numerati</label>
                        <label class="ma-chip"><input type="radio" name="tmodo" value="elenco">${icona('list-ul')} A mano</label>
                        <label class="ma-chip"><input type="radio" name="tmodo" value="ta">${icona('shoe-prints')} Task analysis</label>
                        <label class="ma-chip"><input type="radio" name="tmodo" value="dopo">${icona('box-archive')} Dopo, dai set</label></div>
                    <div data-tmodo="num" class="ma-num">
                        <input name="num_nome" maxlength="60" value="Set" class="ma-nome" aria-label="Nome dei set">
                        <span>da</span><input name="num_da" type="number" min="0" max="999" inputmode="numeric" value="1" class="ma-n" aria-label="Dal numero">
                        <span>a</span><input name="num_a" type="number" min="0" max="999" inputmode="numeric" value="5" class="ma-n" aria-label="Al numero">
                        <span class="sotto piccolo ma-num-anteprima" data-num-anteprima></span></div>
                    <label class="campo" data-tmodo="elenco" hidden><span>Uno per riga, il primo è quello da cui si parte</span><textarea name="target" rows="3" placeholder="es. Animali: cane, gatto&#10;Frutta: mela, banana"></textarea></label>
                    <div data-tmodo="ta" hidden>
                        <label class="campo"><span>Compito <small class="sotto">· vuoto: il nome dell'attività</small></span><input name="taCompito" maxlength="200" placeholder="es. Lavarsi le mani"></label>
                        <label class="campo"><span>Passi, uno per riga, nell'ordine in cui si fanno</span><textarea name="taPassi" rows="6" placeholder="Apre il rubinetto&#10;Mette le mani sotto l'acqua&#10;Prende il sapone"></textarea></label></div>
                    <p class="sotto piccolo" data-tmodo="dopo" hidden>Salvando si apre la scelta dei target: dall'archivio dei set, da una lista o a mano. Si può anche lavorare senza target.</p>`}
            </section>

            <section class="ma-card" data-ma-gioco>${testa('gamepad', 'Gioco', coll && coll.tot ? `${coll.collegati} di ${coll.tot} target con un set` : 'facoltativo')}
                <p class="sotto piccolo">I target li chiami come vuoi. Qui scegli il gioco dell'attività e poi leghi ogni target a un set dell'archivio: in seduta (tablet e computer) parte il gioco con il set già pronto, e il risultato entra nei dati del target. Il nome del target non cambia.</p>
                <label class="campo"><span>Gioco dell'attività</span>${sceltaGioco('g_modo', modiG, a.mode || '', 'Nessuno (scelgo dopo)')}</label>
                ${!archivio.length ? h`<p class="sotto piccolo">${icona('circle-info')} L'archivio dei set è vuoto: crea o scarica un set dai giochi per poterlo legare ai target.</p>` : ''}
                ${archivio.length && att ? h`<button type="button" class="bt piccolo" data-g-collega ${coll.tot ? '' : grezzo('disabled')}>${icona('link')} Collega i target ai set…</button>
                    <span class="sotto piccolo">${coll.tot ? 'Lega «Set 1», «Set 2»… ai set dell\'archivio, in un solo passaggio.' : 'Aggiungi prima dei target.'}</span>` : ''}
                ${archivio.length && !att ? h`<label class="spunta-riga" style="margin-top:6px"><input type="checkbox" name="g_collega"> <span>Subito dopo il salvataggio, collega ogni target scritto sopra a un set dell'archivio <small class="sotto">· ti propone il set con il nome più simile, da confermare</small></span></label>` : ''}
            </section>

            <section class="ma-card">${testa('hand-pointer', 'In seduta', 'i tasti che vedrai')}
                <div class="ma-tiles">
                    ${tile('independent', [['mv', '✓'], ['mx', '✗']], 'Indipendente', 'giusta o sbagliata')}
                    ${tile('timedelay', [['mv', '✓'], ['mp', 'P']], 'Time delay', 'aiuto dopo N″')}
                    ${tile('ecoico', [['mv', '✓'], ['me', 'e+'], ['mx', '✗']], 'Echo to tact', 'da solo o ripetuto')}
                </div>
                <label class="campo ma-td" data-se-tipo="timedelay" ${tipoA === 'timedelay' ? '' : grezzo('hidden')}><span>${icona('stopwatch')} Secondi di attesa prima dell'aiuto</span><input name="tdSeconds" type="number" min="0" max="60" inputmode="numeric" value="${tdA != null ? tdA : ''}" placeholder="es. 0, 1, 2…">
                    ${(a.tdCambi || []).length ? h`<span class="sotto piccolo">Cambi finora: ${a.tdCambi.map((c) => `${formatoData(c.il)} ${c.da != null ? sec(c.da) + '→' : ''}${sec(c.a)}`).join(', ')}</span>` : ''}</label>
            </section>

            <section class="ma-card">${testa('chart-simple', 'Il dato')}
                <div class="ma-tiles ma-due">
                    <label class="ma-tile"><input type="radio" name="dato" value="pct" ${conDato ? '' : grezzo('checked')}><span class="ma-grande">${icona('percent')}</span><b>Percentuale</b><small>a ogni seduta, con quante prove vuoi</small></label>
                    <label class="ma-tile"><input type="radio" name="dato" value="lu" ${conDato ? grezzo('checked') : ''}><span class="ma-grande">${icona('layer-group')}</span><b>LU contate</b><small>un dato ogni N prove, anche in più sedute</small></label>
                </div>
                <div class="ma-lu" data-dato="lu" ${conDato ? '' : grezzo('hidden')}>
                    <span>Una LU da</span><input name="prove" type="number" min="1" max="200" inputmode="numeric" value="${a.prove || 10}" class="ma-n" ${conDato ? '' : grezzo('disabled')}><span>prove</span>
                    <span class="ma-rapidi">${[5, 10, 20].map((n) => h`<button type="button" class="ma-chip" data-prove="${n}">${n}</button>`)}</span></div>
                <p class="ma-frase">${icona('flag-checkered')} Target raggiunto al <input name="soglia" type="number" min="10" max="100" inputmode="numeric" value="${a.criterio.soglia}" class="ma-n">% per <input name="sedute" type="number" min="1" max="10" inputmode="numeric" value="${a.criterio.sedute}" class="ma-n"> giorni di fila</p>
            </section>

            <section class="ma-card">${testa('sliders', 'Opzioni', 'tocca per attivare')}
                <div class="ma-chips">
                    ${chipOpz('field', 'table-cells-large', 'Field e caselle', conField)}
                    ${chipOpz('cond', 'circle-question', 'Cosa vale come…', conCond)}
                    ${eGruppo(p) ? '' : chipOpz('sotto', 'diagram-project', 'Sottoattività' + (nMis ? ' · ' + nMis : ''), !!nMis)}
                    ${chipOpz('testi', 'lightbulb', 'Descrizione e suggerimenti', conTesti)}
                    ${chipSpunta('cronometro', 'stopwatch', 'Cronometro', !!a.cronometro, 'Fluency: risposte al minuto, grafico SCC')}
                    ${chipSpunta('mantenimento', 'rotate', 'Mantenimento', !!a.mantenimento, 'Si segna, ma fuori da statistiche e criterio')}
                </div>
                <div class="ma-opz" data-ma-sez="field" ${conField ? '' : grezzo('hidden')}>
                    <div class="riga-campi">
                        <label class="campo campo-field"><span>Field <small class="sotto">· stimoli fra cui scegliere</small></span><input name="field" type="number" min="1" max="20" inputmode="numeric" value="${a.field || ''}" placeholder="es. 3"></label>
                        <label class="campo"><span>Caselle <small class="sotto">· prompt visivo</small></span><input name="promptVisivo" maxlength="200" value="${a.promptVisivo || ''}" placeholder="es. prima | poi | dopo"></label>
                    </div>
                    <p class="sotto piccolo">F3 = tre stimoli presentati, uno da scegliere. Caselle: separa con | (prima | poi | dopo); fra parentesi quadre il testo va dentro il quadrato: [X] | [X].</p></div>
                <div class="ma-opz" data-ma-sez="cond" ${conCond ? '' : grezzo('hidden')}><span class="sotto piccolo">Compare in seduta sotto i tasti.</span>${campiCondizioni('', a.condizioni)}</div>
                <div class="ma-opz" data-ma-sez="sotto" ${nMis && !eGruppo(p) ? '' : grezzo('hidden')}>
                    <div class="sottoattivita" data-sotto>${(a.misure || []).map((m, i) => rigaSotto(i, m))}</div>
                    <button type="button" class="bt piccolo fantasma" data-sotto-aggiungi>${icona('plus')} Aggiungi sottoattività</button>
                    <p class="sotto piccolo">Ognuna ha i suoi tasti e il suo dato sullo stesso target, e arriva a criterio per conto suo; l'attività quando ci arrivano tutte.</p></div>
                <div class="ma-opz" data-ma-sez="testi" ${conTesti ? '' : grezzo('hidden')}>
                    <label class="campo"><span>Descrizione</span><input name="descrizione" maxlength="300" value="${a.descrizione || ''}"></label>
                    <label class="campo"><span>Suggerimenti per chi somministra</span><textarea name="suggerimenti" maxlength="3000" rows="3" placeholder="Come presentare lo stimolo, che aiuto dare, quando rinforzare, errori da evitare…">${a.suggerimenti || ''}</textarea>
                        <span class="sotto piccolo">In seduta, con il tasto dei suggerimenti.</span></label></div>
            </section>
            ${att ? h`<section class="ma-card">${testa('toggle-on', 'Stato')}
                <div class="scelta">
                    <label><input type="radio" name="stato" value="attivo" ${att.stato === 'attivo' ? grezzo('checked') : ''}><span>Attiva</span></label>
                    <label><input type="radio" name="stato" value="sospeso" ${att.stato === 'sospeso' ? grezzo('checked') : ''}><span>Sospesa</span></label>
                    <label><input type="radio" name="stato" value="terminato" ${att.stato === 'terminato' ? grezzo('checked') : ''}><span>Terminata</span></label></div>
                <span class="sotto piccolo">Sospesa o terminata: non compare nella presa dati; i dati restano.</span>
                <div class="bottoni-piccoli">
                ${P.sedute(p, att).length ? h`<button type="button" class="bt piccolo fantasma" data-foglio="sposta">${icona('right-left')} Sposta i dati in un'altra attività…</button>` : ''}
                <button type="button" class="bt piccolo fantasma pericolo-testo" data-foglio="elimina">${icona('trash')} Elimina dal programma…</button></div></section>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
            dopo: (el) => {
                agganciaNuove(el);
                const bc = el.querySelector('[data-g-collega]');
                if (bc) bc.addEventListener('click', async () => {
                    if (!await abbinaSet(p, att)) return;
                    await salvaPaziente(p);
                    const c = statoCollegamenti(att), g = el.querySelector('[name=g_modo]');
                    el.querySelector('[data-ma-gioco] .ma-sotto').textContent = `${c.collegati} di ${c.tot} target con un set`;
                    if (g && att.mode) { if (![...g.options].some((o) => o.value === att.mode)) g.add(new Option(etichettaModo(att.mode), att.mode)); g.value = att.mode; }
                });
                agganciaModuloAttivita(el, p, att);
                const sm = el.querySelector('[data-mod-scelta]'), nm = el.querySelector('[data-mod-nuova]');
                // la tendina resta (è lei che va nel modulo) ma si sceglie dal foglio con la ricerca
                sm.hidden = true;
                const bm = document.createElement('button');
                bm.type = 'button'; bm.className = 'campo-in scegli-mod';
                const etichetta = () => { const o = sm.selectedOptions[0]; const g = o && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : ''; bm.innerHTML = `<span>${o && o.value ? esc(o.textContent) : 'Dal nome, in automatico'}${g ? ` <small>${esc(g)}</small>` : ''}</span><i class="fa-solid fa-magnifying-glass"></i>`; };
                etichetta();
                sm.after(bm);
                bm.addEventListener('click', async () => {
                    const v = await scegliModalita(sm.value === '+' ? '' : sm.value);
                    if (v == null) return;
                    const [scelta, cat, nome] = v.split('|');
                    sm.value = scelta; etichetta(); sm.dispatchEvent(new Event('change', { bubbles: true }));
                    if (scelta === '+') {
                        const n = nm.querySelector('[name=mod_nome]'), c = nm.querySelector('[name=mod_cat]');
                        if (nome) { n.value = nome; n.dispatchEvent(new Event('input', { bubbles: true })); }
                        if (cat && c) { c.value = cat; c.dispatchEvent(new Event('change', { bubbles: true })); }
                        bm.innerHTML = `<span>Nuova: ${esc(nome || '…')}${cat && c ? ` <small>${esc(c.selectedOptions[0].textContent)}</small>` : ''}</span><i class="fa-solid fa-magnifying-glass"></i>`;
                        if (!nome) n.focus();
                    }
                });
                sm.addEventListener('change', etichetta);
                sm.addEventListener('change', () => { nm.hidden = sm.value !== '+'; if (!nm.hidden) nm.querySelector('input').focus(); });
                const ta = el.querySelector('[data-ta-scelta]');
                if (ta) ta.addEventListener('change', () => {
                    el.querySelector('[data-si-ta]').hidden = !ta.checked; el.querySelector('[data-no-ta]').hidden = ta.checked;
                    if (ta.checked) el.querySelector('[name=taPassi]').focus();
                });
                // le parti che dipendono dal tipo di seduta compaiono solo quando servono
                el.querySelectorAll('[name=sessionType]').forEach((r) => r.addEventListener('change', () => {
                    el.querySelectorAll('[data-se-tipo]').forEach((x) => { x.hidden = x.dataset.seTipo !== r.value; });
                }));
                const box = el.querySelector('[data-sotto]');
                let n = box.children.length;
                const nuova = () => { box.insertAdjacentHTML('beforeend', String(rigaSotto(n++, null))); box.lastElementChild.querySelector('input').focus(); };
                el.querySelector('[data-sotto-aggiungi]').addEventListener('click', nuova);
                box.addEventListener('click', (e) => { const x = e.target.closest('[data-sotto-togli]'); if (x) x.closest('.riga-sotto').remove(); });
            }
        });
    }

    // Il modulo dell'attività: scelte a riquadri, opzioni che si aprono, anteprima di come sarà in seduta
    function agganciaModuloAttivita(el, p, att) {
        const val = (n) => { const x = el.querySelector(`[name="${n}"]:checked`) || el.querySelector(`[name="${n}"]:not([type=radio])`); return x ? x.value : ''; };
        const segna = (gruppo) => el.querySelectorAll(`[name="${gruppo}"]`).forEach((x) => { const l = x.closest('.ma-chip, .ma-tile'); if (l) l.classList.toggle('on', x.checked); });
        // target: numerati, a mano, task analysis, dopo
        el.querySelectorAll('[name=tmodo]').forEach((x) => x.addEventListener('change', () => {
            el.querySelectorAll('[data-tmodo]').forEach((d) => { d.hidden = d.dataset.tmodo !== x.value; });
            segna('tmodo'); aggiorna();
        }));
        // il dato: percentuale o LU contate (le prove contano solo per le LU)
        el.querySelectorAll('[name=dato]').forEach((x) => x.addEventListener('change', () => {
            const lu = val('dato') === 'lu', d = el.querySelector('[data-dato=lu]');
            d.hidden = !lu; d.querySelector('[name=prove]').disabled = !lu;
            segna('dato'); aggiorna();
        }));
        el.querySelectorAll('[data-prove]').forEach((b) => b.addEventListener('click', () => { el.querySelector('[name=prove]').value = b.dataset.prove; aggiorna(); }));
        el.querySelectorAll('[name=sessionType]').forEach((x) => x.addEventListener('change', () => { segna('sessionType'); aggiorna(); }));
        el.querySelectorAll('.ma-chip > input[type=checkbox]').forEach((x) => x.addEventListener('change', () => { x.closest('.ma-chip').classList.toggle('on', x.checked); aggiorna(); }));
        // le opzioni si aprono e si chiudono; chiudendole i loro campi restano come sono
        el.querySelectorAll('[data-ma-apri]').forEach((b) => b.addEventListener('click', () => {
            const s = el.querySelector(`[data-ma-sez="${b.dataset.maApri}"]`), apri = s.hidden;
            s.hidden = !apri; b.classList.toggle('on', apri); b.setAttribute('aria-pressed', apri ? 'true' : 'false');
            if (apri) { const f = s.querySelector('input, textarea'); if (f) f.focus(); }
        }));
        el.querySelectorAll('[name=colore]').forEach((x) => x.addEventListener('change', aggiorna));
        el.addEventListener('input', aggiorna);
        function primoTarget() {
            if (att) {
                const c = P.targetCorrente(att);
                if (c) return c.target.testo;
            }
            const m = val('tmodo');
            if (m === 'num') { const l = att ? targetDaAggiungere({ tmodo: 'num', num_nome: val('num_nome'), num_da: val('num_da'), num_quanti: val('num_quanti') }) : nomiNumerati(val('num_nome'), val('num_da'), val('num_a')); return l[0] || ''; }
            if (m === 'elenco') return (String(val(att ? 'nuoviTarget' : 'target')).split('\n').map((x) => x.trim()).filter(Boolean)[0]) || '';
            if (m === 'ta') return String(val('taCompito') || val('nome') || '').trim() + ' · passo 1';
            return '';
        }
        function aggiorna() {
            // anteprima dei numerati
            const na = el.querySelector('[data-num-anteprima]');
            if (na) {
                const l = att ? targetDaAggiungere({ tmodo: 'num', num_nome: val('num_nome'), num_da: val('num_da'), num_quanti: val('num_quanti') }) : nomiNumerati(val('num_nome'), val('num_da'), val('num_a'));
                na.textContent = l.length ? '→ ' + (l.length > 4 ? l.slice(0, 2).join(', ') + ' … ' + l[l.length - 1] : l.join(', ')) + ` (${l.length})` : '';
            }
            const tipo = val('sessionType') || 'independent', td = val('tdSeconds'), lu = val('dato') === 'lu';
            const col = val('colore') || (att ? P.coloreDi(p, att, true) : P.PALETTE[P.programma(p).attivita.length % P.PALETTE.length]);
            const tasti = tipo === 'timedelay' ? [['mv', '✓ Corretta'], ['mp', 'P Promptata']] : tipo === 'ecoico' ? [['mv', '✓ Autonoma'], ['me', 'e+ Ecoica'], ['mx', '✗ Errata']] : [['mv', '✓ Corretta'], ['mx', '✗ Errata']];
            const t = primoTarget();
            const prove = val('prove');
            el.querySelector('[data-ma-anteprima]').innerHTML = String(h`<div class="ma-prev" style="--col:${col}">
                <div class="ma-prev-testa"><span class="ma-prev-nome">${val('nome') || 'Nome dell\'attività'}</span>
                    ${tipo === 'timedelay' ? h`<span class="pill">T/D${td !== '' ? ' ' + td + '″' : ''}</span>` : tipo === 'ecoico' ? h`<span class="pill">Echo to tact</span>` : ''}
                    ${val('field') ? h`<span class="pill field">F${val('field')}</span>` : ''}
                    ${el.querySelector('[name=mantenimento]:checked') ? h`<span class="pill arancio">mantenimento</span>` : ''}
                    <span class="ma-prev-dato">${lu ? h`${icona('layer-group')} LU da ${prove || '?'}` : h`${icona('percent')} %`}</span></div>
                ${t ? h`<div class="ma-prev-target">${t}</div>` : h`<div class="ma-prev-target vuoto">nessun target ancora</div>`}
                <div class="ma-prev-tasti n${tasti.length}">${tasti.map(([c, x]) => h`<i class="${c}">${x}</i>`)}</div>
                <div class="ma-prev-sotto">${icona('eye')} così in seduta · ${icona('flag-checkered')} ${val('soglia') || '?'}% per ${val('sedute') || '?'} ${val('sedute') === '1' ? 'giorno' : 'giorni'}${lu ? ` · un dato ogni ${prove || '?'} prove` : ' · un dato a ogni seduta'}${el.querySelector('[name=cronometro]:checked') ? ' · cronometro' : ''}</div>
            </div>`);
        }
        aggiorna();
    }
    // Una riga del modulo: nome della sottoattività e i suoi flag (l'id tiene i dati già presi)
    function rigaSotto(i, m) {
        const tipo = (m && m.tipo) || '';
        const opz = [['', 'Tipo come l\'attività'], ['independent', 'Indipendente'], ['timedelay', 'Time delay'], ['ecoico', 'Echo to tact']];
        return h`<div class="riga-sotto">
            <div class="riga-sotto-1">
                <input type="hidden" name="${'ms_id_' + i}" value="${m ? m.id : ''}">
                <input class="campo-in" name="${'ms_nome_' + i}" maxlength="60" value="${m ? m.nome : ''}" placeholder="es. Categorizza" aria-label="Nome della sottoattività">
                <label class="spunta-riga" title="Il dato si prende ma resta fuori da statistiche e criterio"><input type="checkbox" name="${'ms_mant_' + i}" ${m && m.mantenimento ? grezzo('checked') : ''}> <span>Mantenimento</span></label>
                <button type="button" class="ib" data-sotto-togli aria-label="Togli la sottoattività" title="Togli">${icona('xmark')}</button>
            </div>
            <div class="riga-sotto-2">
                <select class="campo-in" name="${'ms_tipo_' + i}" aria-label="Tipo di seduta della sottoattività">${opz.map(([v, n]) => h`<option value="${v}" ${v === tipo ? grezzo('selected') : ''}>${n}</option>`)}</select>
                <input class="campo-in prove-sotto" name="${'ms_prove_' + i}" type="number" min="1" max="200" inputmode="numeric" value="${(m && m.prove) || ''}" placeholder="Prove" title="Prove per LU (vuoto: come l'attività)" aria-label="Prove per LU della sottoattività">
                <input class="campo-in prove-sotto" name="${'ms_field_' + i}" type="number" min="1" max="20" inputmode="numeric" value="${(m && m.field) || ''}" placeholder="Field" title="Field: quanti stimoli fra cui scegliere (vuoto: come l'attività)" aria-label="Field della sottoattività">
                <input class="campo-in" name="${'ms_sugg_' + i}" maxlength="600" value="${(m && m.suggerimenti) || ''}" placeholder="Indicazioni per chi somministra (facoltative)" aria-label="Indicazioni della sottoattività">
            </div>
            <details class="cond-sotto" ${m && m.condizioni ? grezzo('open') : ''}><summary class="sotto piccolo">Cosa vale come ✓, P, ✗${m && m.condizioni ? ' · indicato' : ''}</summary>${campiCondizioni('ms_' + i + '_', m && m.condizioni)}</details>
        </div>`;
    }

    // Quello che serve al nucleo e agli altri moduli (correzioni, programma…)
    const funzioni = { abbinaSet, cambiaSetTarget, statoCollegamenti, scegliSet, moduloAttivita, creaAttivitaDaModulo, moduloTarget, aggiungiTargetDaModulo, numerazione, nomiNumerati, targetDaAggiungere,
        impostaField, impostaMisure, risolviNuovaModalita, modalitaDaModulo, campiCondizioni, rigaSotto, agganciaModuloAttivita };
    Object.assign(X, funzioni);
    TiceHome.estendi({ aggancio: funzioni });
})();
