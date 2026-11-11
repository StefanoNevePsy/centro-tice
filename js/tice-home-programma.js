/**
 * Centro TICE — la schermata del programma di un bambino: le schede delle attività con i loro target,
 * il modulo per crearle e modificarle, i target (aggiunti a mano, numerati, il menu di ognuno) e le griglie
 * da stampare. Spostato da js/tice-home.js: nel nucleo restano le etichette degli stati e gli strumenti
 * che servono anche alla presa dati (lancio del set, grafico SCC, fine seduta).
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, M = window.TiceModalita;
    if (!P || !M || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const EST = X.agganci;   // i punti di aggancio delle estensioni: si leggono al momento dell'uso
    const { h, grezzo, icona, esc, barra, testata, foglio, conferma, avviso, disegna, T, paz, salvaPaziente, puoProgrammi, formatoData, dizionario, ETICHETTE_STATO,
        eGruppo, allineaMembri, ecoico, sec, chiOpera, perCategoria, etichettaModo, rinominaSedute, impostaCondizioni, celerazioneTarget, stampa, lancia, graficoSCC, proponiProssimo,
        moduloAttivita, creaAttivitaDaModulo, moduloTarget, aggiungiTargetDaModulo, numerazione, targetDaAggiungere, impostaField, impostaMisure, risolviNuovaModalita, modalitaDaModulo } = X;

    function schedaProgramma(p, att) {
        const t = att.target || [];
        const modifica = puoProgrammi(p);
        const ultimo = (tg) => {
            const s = P.sedute(p, att, tg);
            if (!s.length) return '';
            const u = s[s.length - 1];
            return ` · ${s.length} ${s.length === 1 ? 'seduta' : 'sedute'}, ultima ${formatoData(P.giorno(u.date))} ${u.percentage}%`;
        };
        const CHIUSI = ['criterio', 'repertorio', 'chiuso'];
        const chiusi = t.filter((tg) => CHIUSI.includes(tg.stato));
        const aperti = t.filter((tg) => !CHIUSI.includes(tg.stato));
        // con più prese dati: quali sono già a criterio su quel target
        const statoMisure = (tg) => {
            if (!(att.misure || []).length || tg.stato !== 'attivo') return '';
            const acq = att.misure.filter((m) => !m.mantenimento);
            const ok = acq.filter((m) => P.criterioRaggiunto(P.sedute(p, att, tg, m.id), att.criterio));
            return ok.length ? h` <span class="pill verde chiara" title="${ok.map((m) => m.nome).join(', ')} a criterio">${icona('flag-checkered')} ${ok.length} di ${acq.length}: ${ok.map((m) => m.nome).join(', ')}</span>` : '';
        };
        const riga = (tg) => h`<li class="${CHIUSI.includes(tg.stato) ? 'chiuso' : ''}">
                    <span class="punto ${tg.stato}"></span>
                    <span class="tt">${P.passiDi(tg).length ? h`${icona('list-ol')} ` : ''}${tg.testo}${P.passiDi(tg).length ? h` <span class="sotto piccolo">· ${P.passiDi(tg).length} passi</span>` : ''}${tg.suggerimento ? h` <span class="sotto" title="Ha dei suggerimenti">${icona('lightbulb')}</span>` : ''}${celerazioneTarget(p, att, tg)}${statoMisure(tg)}<small>${P.STATI_TARGET[tg.stato] || tg.stato}${tg.fine ? ' il ' + formatoData(tg.fine) : ''}${ultimo(tg)}</small></span>
                    ${modifica || tg.setId ? h`<button class="ib" data-a="menu-target" data-id="${att.id}" data-t="${tg.id}" aria-label="Opzioni del target">${icona('ellipsis')}</button>` : ''}
                </li>`;
        const ultimaS = !t.length ? P.sedute(p, att).slice(-1)[0] : null;
        return h`<div class="scheda" data-prog="${att.id}" style="--col:${P.coloreDi(p, att)}">
            <button class="att-testa" ${modifica ? grezzo(`data-a="mod-att" data-id="${esc(att.id)}"`) : ''}>
                <span class="corpo"><span class="nome"><span class="nome-testo">${att.nome}</span>
                    ${(() => { const e = M.etichetta(att, dizionario()); return e && M.normalizza(e) !== M.normalizza(att.nome) ? h` <span class="pill grigia">${e}</span>` : ''; })()}
                    ${ecoico(att) ? h` <span class="pill">Echo to tact</span>` : att.sessionType === 'timedelay' ? (() => {
                        const d = P.tdDi(att), u = (att.tdCambi || []).slice(-1)[0];
                        return h` <span class="pill" title="${u ? `Cambiato il ${formatoData(u.il)}${u.da != null ? ' da ' + sec(u.da) : ''} a ${sec(u.a)}` : 'Time delay'}">T/D${d != null ? ' ' + sec(d) : ''}</span>`;
                    })() : h` <span class="pill grigia">Indip.</span>`}
                    ${att.stato !== 'attivo' ? h` <span class="pill arancio">${ETICHETTE_STATO[att.stato] || att.stato}</span>` : ''}
                    ${att.mantenimento ? h` <span class="pill grigia" title="Il dato si prende ma non entra nelle statistiche">mantenimento</span>` : ''}
                    ${att.field ? h` <span class="pill field">F${att.field}</span>` : ''}
                    ${att.suggerimenti ? h` <span class="pill grigia" title="${att.suggerimenti}">${icona('lightbulb')} suggerimenti</span>` : ''}</span>
                    <span class="target">${(att.misure || []).length ? h`${icona('table-cells')} ${att.misure.map((m) => m.nome + (m.mantenimento ? ' (mant.)' : '')).join(' · ')} — ` : ''}Criterio ${att.criterio.soglia}% per ${att.criterio.sedute} giorni${att.prove ? ' · ' + att.prove + ' prove' : ''}${att.descrizione ? ' · ' + att.descrizione : ''}</span></span>
                ${modifica ? icona('pen') : ''}
            </button>
            <ul class="targets">
                ${chiusi.length ? h`<li><details class="chiusi" ${T.chiusiAperti[att.id] ? grezzo('open') : ''} data-chiusi="${att.id}"><summary class="sotto piccolo">${chiusi.length} ${chiusi.length === 1 ? 'target chiuso' : 'target chiusi'}</summary>
                    <ul class="targets" style="padding:0">${chiusi.map(riga)}</ul></details></li>` : ''}
                ${aperti.map(riga)}
                ${!t.length ? h`<li class="senza-target"><span class="punto"></span><span class="tt">${P.inPercentuale(att) ? h`${icona('percent')} Senza numero di prove: il dato si prende in percentuale a ogni seduta` : h`${icona('layer-group')} LU da ${att.prove} prove: il dato entra quando se ne completano ${att.prove}`}<small>${ultimaS ? `${P.sedute(p, att).length} sedute, ultima ${formatoData(P.giorno(ultimaS.date))} ${ultimaS.percentage}%` : 'Nessuna seduta ancora'}</small></span></li>` : ''}
                <li class="azioni-att">${modifica ? h`<button class="bt piccolo fantasma" data-a="nuovo-target" data-id="${att.id}">${icona('plus')} Target</button>` : ''}
                    ${modifica && numerazione(att) ? (() => { const nn = numerazione(att); const nome = (nn.nome ? nn.nome + ' ' : '') + nn.prossimo; return h`<button class="bt piccolo fantasma" data-a="target-numerato" data-id="${att.id}" title="Aggiunge «${nome}» in coda">${icona('plus')} ${nome}</button>`; })() : ''}
                    ${P.sedute(p, att).length ? h`<button class="bt piccolo fantasma" data-a="scc-att" data-id="${att.id}">${icona('chart-line')} Andamento</button>` : ''}</li>
            </ul>
        </div>`;
    }
    function vistaProgramma() {
        const p = paz(T.pid);
        if (!p) { T.vista = 'bambini'; return X.viste.bambini(); }
        if (eGruppo(p)) allineaMembri(p);
        const tutte = P.programma(p).attivita;
        const modifica = puoProgrammi(p);
        const attive = tutte.filter((a) => a.stato === 'attivo');
        const altre = tutte.filter((a) => a.stato !== 'attivo');
        const gruppi = perCategoria(attive);
        const senza = tutte.filter((a) => !a.modalita || !M.trovaModalita(a.modalita, dizionario()));
        return h`${barra({ indietro: 'vai-seduta', titolo: 'Programma', sotto: { testo: p.name },
                destra: h`<button class="ib" data-a="apri-cartella" aria-label="Cartella clinica" title="Cartella clinica">${icona('chart-line')}</button>` })}
            <main class="tice-main">
                ${testata('Programma · ' + attive.length + (attive.length === 1 ? ' attività in corso' : ' attività in corso'), p.name)}
                <p class="sotto">Le attività in corso compaiono nella presa dati con il loro target. Quando un target raggiunge il criterio l'app propone di passare al successivo.</p>
                ${modifica ? h`<button class="bt primario largo" data-a="nuova-att">${icona('plus')} Nuova attività</button>`
                    : h`<div class="banda">${icona('lock')}<div>Il programma lo modificano le professioniste: tu registri le sedute.</div></div>`}
                <button class="bt largo fantasma" data-a="stampa-griglie" style="margin-top:8px">${icona('print')} Stampa le griglie per la presa dati su carta</button>
                ${modifica && senza.length ? h`<p class="sotto piccolo riga-riordina">${icona('layer-group')} ${senza.length} ${senza.length === 1 ? 'attività non ha' : 'attività non hanno'} ancora una modalità del centro · <button class="link" data-a="classifica">riordina</button></p>` : ''}
                ${gruppi.map((g) => h`<h3>${g.area}</h3>${g.att.map((a) => schedaProgramma(p, a))}`)}
                ${!attive.length ? h`<div class="vuoto">Nessuna attività in corso.</div>` : ''}
                ${altre.length ? h`<details style="margin-top:18px"><summary>Sospese e terminate (${altre.length})</summary>${altre.map((a) => schedaProgramma(p, a))}</details>` : ''}
                ${eGruppo(p) || !EST.sezioneComportamenti ? '' : EST.sezioneComportamenti(p, modifica)}
                ${(() => { const fuori = modifica && EST.datiFuori ? EST.datiFuori(p) : []; return fuori.length ? h`<h3>Dati fuori dal programma</h3>
                    <p class="sotto piccolo">Sedute di attività aggiunte solo per un giorno o tolte dal programma: uniscile a un'attività, o creane una, così finiscono nei grafici e nel criterio.</p>
                    <div class="scheda">${fuori.map((g) => h`<button class="riga" data-a="sistema-fuori" data-nome="${g.nome}"><span class="corpo"><span class="t1">${g.nome}</span>
                        <span class="t2">${g.sedute.length} ${g.sedute.length === 1 ? 'seduta' : 'sedute'} · ${formatoData(P.giorno(g.sedute[0].date))}${g.sedute.length > 1 ? ' – ' + formatoData(P.giorno(g.sedute[g.sedute.length - 1].date)) : ''}</span></span>${icona('chevron-right')}</button>`)}</div>` : ''; })()}
            </main>`;
    }

    TiceHome.estendi({
        viste: { programma: vistaProgramma },
        azioni: {
            'stampa-griglie': async () => {
                const p = paz(T.pid);
                if (!p) return;
                const elenco = TiceStampa.voci(p, { P, M, diz: dizionario() });
                if (!elenco.length) { avviso('Il programma non ha ancora attività da stampare.'); return; }
                const nTA = elenco.filter((v) => v.ta).length, nLU = elenco.length - nTA;
                const maxProve = Math.max(0, ...elenco.filter((v) => !v.ta).map((v) => +v.att.prove || 0));
                const r = await foglio(h`<form><h2>Griglie da stampare</h2>
                    <p class="sotto">Fogli A4 per prendere i dati su carta quando serve, con le attività del programma, i target in corso e le prove già marcate. Si ricopiano poi nella presa dati.</p>
                    <div class="campo scelte-stampa"><span>Attività</span>
                        ${elenco.map((v) => h`<div class="riga-stampa"><label class="spunta-riga"><input type="checkbox" name="att" value="${v.att.id}" ${v.attiva ? grezzo('checked') : ''}>
                            <span><b>${v.att.nome}</b> <span class="sotto piccolo">${v.categoria.nome}${v.ta ? ' · task analysis' : v.att.scala === 'percentuale' ? ' · dato in %' : v.att.prove ? ' · ' + v.att.prove + ' prove' : ''}${v.attiva ? '' : ' · sospesa'}</span></span></label>
                            ${v.ta ? '' : h`<input class="campo-in lu-per" type="number" name="${'lu_' + v.att.id}" min="1" max="200" inputmode="numeric" placeholder="auto" aria-label="${'LU da prevedere per ' + v.att.nome}" title="LU da prevedere sul foglio (vuoto: in automatico)">`}</div>`)}
                        ${nLU ? h`<span class="sotto piccolo">Il numero accanto all'attività: quante LU prevedere sul foglio. Vuoto: in automatico, secondo la scelta qui sotto.</span>` : ''}
                    </div>
                    ${nLU ? h`<label class="campo"><span>Spazio per ogni attività</span><select name="spazio" class="campo-in">
                        <option value="riempi" selected>Riempi il foglio (righe in più, soprattutto ai dati in %)</option>
                        <option value="piu1">Le prove previste e una riga in più</option>
                        <option value="piu2">Le prove previste e due righe in più</option>
                        <option value="previste">Solo le prove previste</option></select></label>` : ''}
                    <div class="campo scelte-stampa"><span>Fogli</span>
                        ${nLU ? h`<label class="spunta-riga"><input type="checkbox" name="lu" checked> <span>Presa dati delle learn unit <span class="sotto piccolo">(${nLU} attività su un foglio)</span></span></label>` : ''}
                        ${nTA ? h`<label class="spunta-riga"><input type="checkbox" name="ta" checked> <span>Task analysis <span class="sotto piccolo">(${nTA}, due o tre per foglio)</span></span></label>` : ''}
                    </div>
                    <div class="riga-campi">
                        ${nLU ? h`<label class="campo"><span>Caselle per riga</span><select name="colonne" class="campo-in">${[10, 15].map((n) => h`<option value="${n}" ${n === (maxProve > 10 && maxProve % 15 === 0 ? 15 : 10) ? grezzo('selected') : ''}>${n}</option>`)}</select></label>` : ''}
                        ${nTA ? h`<label class="campo"><span>Colonne task analysis</span><select name="colonneTA" class="campo-in">${[10, 15, 20].map((n) => h`<option value="${n}" ${n === 15 ? grezzo('selected') : ''}>${n}</option>`)}</select></label>` : ''}
                        <label class="campo"><span>Data (facoltativa)</span><input type="date" name="data" class="campo-in"></label>
                    </div>
                    <div class="campo scelte-stampa"><span>Righe</span>
                    <label class="spunta-riga"><input type="checkbox" name="prossimi" checked> <span>Scrivi il target successivo</span></label>
                    <label class="spunta-riga"><input type="checkbox" name="mantenimento" checked> <span>Una riga per il mantenimento dell'ultimo target a criterio</span></label></div>
                    <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${icona('print')} Stampa</button></div></form>`, {
                    invia: (form) => {
                        const fd = new FormData(form);
                        const ids = fd.getAll('att');
                        if (!ids.length) { avviso('Scegli almeno un\'attività.'); return undefined; }
                        const d = fd.get('data');
                        const luPer = {};
                        ids.forEach((id) => { const n = parseInt(fd.get('lu_' + id), 10); if (n > 0) luPer[id] = Math.min(n, 200); });
                        return { ids, luPer, spazio: fd.get('spazio') || 'riempi', lu: fd.has('lu'), ta: fd.has('ta'), colonne: +fd.get('colonne') || 10, colonneTA: +fd.get('colonneTA') || 15,
                            prossimi: fd.has('prossimi'), mantenimento: fd.has('mantenimento'), data: d ? d.split('-').reverse().join('/') : '' };
                    }
                });
                if (r) await stampa(TiceStampa.html(p, r, { P, M, diz: dizionario() }));
            },
            'nuova-att': async () => {
                const p = paz(T.pid);
                if (!puoProgrammi(p)) return;
                const r = await moduloAttivita(p, null);
                if (!r) return;
                await creaAttivitaDaModulo(p, r);
                T.mantieniScroll = true;
                disegna();
            },
            'mod-att': async (b) => {
                const p = paz(T.pid);
                if (!puoProgrammi(p)) return;
                const att = P.attivita(p, b.dataset.id);
                const r = await moduloAttivita(p, att);
                if (!r) return;
                if (r === 'sposta') { if (EST.correggiDati) await EST.correggiDati(p, { att, sedute: P.sedute(p, att), nome: att.nome }); T.mantieniScroll = true; disegna(); return; }
                if (r === 'elimina') {
                    const n = P.sedute(p, att).length;
                    if (!await conferma(`Eliminare «${att.nome}»?`, n ? `Le sue ${n} sedute restano nella cartella clinica, ma non saranno più collegate a un'attività del programma.` : 'Non ha ancora sedute registrate.', { ok: 'Elimina', pericolo: true })) return;
                    const prog = P.programma(p);
                    prog.attivita = prog.attivita.filter((x) => x.id !== att.id);
                } else if (typeof r === 'string') {
                    att.stato = r;
                } else {
                    if (['attivo', 'sospeso', 'terminato'].includes(r.stato)) att.stato = r.stato;
                    att.nome = r.nome.trim() || att.nome;
                    try { await risolviNuovaModalita(r); } catch (e) { avviso('Modalità non creata: ' + (e.message || e), 'errore'); r.modalita = att.modalita || ''; }
                    modalitaDaModulo(att, r);
                    att.descrizione = r.descrizione.trim();
                    att.suggerimenti = String(r.suggerimenti || '').trim();
                    att.cronometro = !!r.cronometro;
                    if (!eGruppo(p)) impostaMisure(att, r);
                    if (r.mantenimento) att.mantenimento = true; else delete att.mantenimento;
                    att.sessionType = r.sessionType === 'timedelay' ? 'timedelay' : 'independent';
                    if (r.sessionType === 'ecoico') { att.risposte = 'ecoico'; att.nomeP = 'Ecoica'; }
                    else if (ecoico(att)) { delete att.risposte; if (att.nomeP === 'Ecoica') delete att.nomeP; }
                    if (r.colore) att.colore = r.colore; else delete att.colore;
                    if (P.secondiTD(r.tdSeconds) != null) P.impostaTD(att, r.tdSeconds, { chi: chiOpera() });
                    att.criterio = { soglia: +r.soglia || 90, sedute: +r.sedute || 2 };
                    att.prove = +r.prove || null;
                    impostaField(att, r.field, r.promptVisivo);
                    impostaCondizioni(att, r.cV, r.cP, r.cX);
                    targetDaAggiungere(r).forEach((x) => P.aggiungiTarget(att, x, true));
                    rinominaSedute(p, att);   // nome e categoria delle sedute
                }
                att.modificato = new Date().toISOString();
                await salvaPaziente(p);
                T.mantieniScroll = true;
                disegna();
            },
            // il prossimo dei target numerati («Set 6» dopo «Set 5»), in coda
            'target-numerato': async (b) => {
                const p = paz(T.pid);
                if (!puoProgrammi(p)) return;
                const att = P.attivita(p, b.dataset.id), nn = att && numerazione(att);
                if (!nn) return;
                const t = P.aggiungiTarget(att, (nn.nome ? nn.nome + ' ' : '') + nn.prossimo, true);
                await salvaPaziente(p);
                avviso(`${att.nome}: aggiunto «${t.testo}»${t.stato === 'attivo' ? ', in corso' : ' in coda'}`);
                T.mantieniScroll = true; disegna();
            },
            'nuovo-target': async (b) => {
                const p = paz(T.pid);
                if (!puoProgrammi(p)) return;
                const att = P.attivita(p, b.dataset.id);
                const r = await moduloTarget(att);
                if (!r) return;
                aggiungiTargetDaModulo(att, r);
                await salvaPaziente(p);
                T.mantieniScroll = true;
                disegna();
            },
            'menu-target': async (b) => {
                const p = paz(T.pid);
                const att = P.attivita(p, b.dataset.id);
                const t = att.target.find((x) => x.id === b.dataset.t);
                const n = P.sedute(p, att, t).length;
                const crit = P.criterioDi(p, att, t);
                const r = await foglio(h`<h2>${t.testo}</h2>
                    <p class="sotto">${P.STATI_TARGET[t.stato]}${n ? ` · ${n} sedute` : ''}${crit ? ` · criterio raggiunto il ${formatoData(crit)}` : ''}</p>
                    <div class="opzioni">
                        ${n ? h`<button class="opzione" data-foglio="grafico">${icona('chart-line')}<span class="corpo">Grafico e celerazione<small>Standard Celeration Chart: andamento, fasi, previsione</small></span></button>` : ''}
                        ${!puoProgrammi(p) && t.setId ? h`<button class="opzione" data-foglio="gioca">${icona('play')}<span class="corpo">Somministra con l'app<small>${etichettaModo(P.modoTarget(att, t))} · set ${t.testo}</small></span></button>` : ''}
                        ${!puoProgrammi(p) ? '' : h`${t.stato !== 'attivo' ? h`<button class="opzione" data-foglio="corrente">${icona('play')}<span class="corpo">Lavora su questo target<small>Diventa quello della presa dati</small></span></button>` : ''}
                        ${t.stato === 'attivo' ? h`<button class="opzione" data-foglio="criterio">${icona('flag-checkered')}<span class="corpo">Chiudi a criterio<small>E passa al successivo</small></span></button>` : ''}
                        ${t.stato === 'attivo' || t.stato === 'pianificato' ? h`<button class="opzione" data-foglio="repertorio">${icona('star')}<span class="corpo">Già in repertorio</span></button>` : ''}
                        ${t.setId ? h`<button class="opzione" data-foglio="gioca">${icona('play')}<span class="corpo">Somministra con l'app<small>${etichettaModo(P.modoTarget(att, t))} · set ${t.testo}</small></span></button>`
                            : h`<button class="opzione" data-foglio="testo">${icona('pen')}<span class="corpo">Modifica il testo</span></button>`}
                        <button class="opzione" data-foglio="passi">${icona('list-ol')}<span class="corpo">${P.passiDi(t).length ? 'Passi della task analysis' : 'Trasforma in task analysis'}<small>${P.passiDi(t).length ? P.passiDi(t).length + ' passi: modifica, aggiungi, riordina' : 'Un passo alla volta in seduta'}</small></span></button>
                        <button class="opzione" data-foglio="suggerimento">${icona('lightbulb')}<span class="corpo">Suggerimenti per questo target<small>${t.suggerimento ? 'Modifica' : 'Note su come somministrarlo, visibili in seduta'}</small></span></button>
                        <button class="opzione" data-foglio="condizioni">${icona('check-double')}<span class="corpo">Cosa vale come ✓, P, ✗ per questo target<small>${t.condizioni ? 'Modifica' : 'Vuoto: valgono quelle dell\'attività'}</small></span></button>
                        <button class="opzione" data-foglio="su">${icona('arrow-up')}<span class="corpo">Sposta prima</span></button>
                        <button class="opzione" data-foglio="giu">${icona('arrow-down')}<span class="corpo">Sposta dopo</span></button>
                        ${!n ? h`<button class="opzione" data-foglio="elimina">${icona('trash')}<span class="corpo">Elimina</span></button>` : ''}`}
                    </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
                if (!r) return;
                if (r === 'gioca') { lancia(p, att, t); return; }
                if (r === 'grafico') { await graficoSCC(p, att, t); return; }
                if (!puoProgrammi(p)) return;
                if (r === 'corrente') P.rendiCorrente(att, t.id);
                else if (r === 'criterio') { await proponiProssimo(p, att, t, crit); T.mantieniScroll = true; disegna(); return; }
                else if (r === 'repertorio') P.chiudiTarget(att, t.id, 'repertorio');
                else if (r === 'su' || r === 'giu') P.spostaTarget(att, t.id, r === 'su' ? -1 : 1);
                else if (r === 'elimina') { att.target = att.target.filter((x) => x.id !== t.id); att.modificato = new Date().toISOString(); }
                else if (r === 'suggerimento') {
                    const ns = await foglio(h`<form><h2>Suggerimenti · ${t.testo}</h2>
                        <label class="campo"><span>Come somministrare questo target</span><textarea name="s" maxlength="3000" rows="5" autofocus placeholder="es. Presentare la carta a sinistra; aiuto gestuale prima del verbale">${t.suggerimento || ''}</textarea></label>
                        <p class="sotto piccolo">In seduta si aprono dal tasto «Suggerimenti», insieme a quelli dell'attività.</p>
                        <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                    if (!ns) return;
                    t.suggerimento = String(ns.s || '').trim();
                    t.modificato = att.modificato = new Date().toISOString();
                }
                else if (r === 'condizioni') {
                    const nc = await foglio(h`<form><h2>${t.testo}</h2>
                        <p class="sotto piccolo">Scrivi solo quello che cambia per questo target: le voci vuote prendono quelle dell'attività${att.condizioni ? ' (le vedi qui come suggerimento)' : ''}.</p>
                        <div class="riga-campi campi-cond">
                            <label class="campo"><span>✓ vale come corretta</span><input name="cV" maxlength="200" value="${(t.condizioni && t.condizioni.V) || ''}" placeholder="${(att.condizioni && att.condizioni.V) || 'es. una casella segnata restando seduto'}"></label>
                            <label class="campo"><span>P / e+ promptata</span><input name="cP" maxlength="200" value="${(t.condizioni && t.condizioni.P) || ''}" placeholder="${(att.condizioni && att.condizioni.P) || ''}"></label>
                            <label class="campo"><span>✗ errata</span><input name="cX" maxlength="200" value="${(t.condizioni && t.condizioni.X) || ''}" placeholder="${(att.condizioni && att.condizioni.X) || ''}"></label></div>
                        <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                    if (!nc) return;
                    impostaCondizioni(t, nc.cV, nc.cP, nc.cX);
                    t.modificato = att.modificato = new Date().toISOString();
                }
                else if (r === 'passi') {
                    const ora = P.passiDi(t);
                    const np = await foglio(h`<form><h2>Passi · ${t.testo}</h2>
                        <label class="campo"><span>Uno per riga, nell'ordine in cui si fanno</span><textarea name="p" rows="9" autofocus placeholder="Apre il rubinetto&#10;Mette le mani sotto l'acqua">${ora.map((x) => x.testo).join('\n')}</textarea></label>
                        <p class="sotto piccolo">I passi con lo stesso testo tengono il loro storico. Svuota per tornare a un target normale.</p>
                        <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                    if (!np) return;
                    const nuovi = P.nuoviPassi(String(np.p || '').split('\n'), ora);
                    if (nuovi.length) t.passi = nuovi; else delete t.passi;
                    t.modificato = att.modificato = new Date().toISOString();
                }
                else if (r === 'testo') {
                    const nt = await foglio(h`<form><h2>Testo del target</h2>
                        <label class="campo"><textarea name="t" required autofocus>${t.testo}</textarea></label>
                        ${n ? h`<p class="sotto piccolo">Le ${n} sedute già registrate prendono il nuovo nome.</p>` : ''}
                        <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                    if (!nt || !nt.t.trim()) return;
                    t.testo = nt.t.trim().replace(/\s+/g, ' ');
                    t.modificato = att.modificato = new Date().toISOString();
                    rinominaSedute(p, att);
                }
                await salvaPaziente(p);
                T.mantieniScroll = true;
                disegna();
            }
        }
    });
})();
