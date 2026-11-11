/**
 * Centro TICE — fine seduta e salvataggio: il foglio «Fine seduta» (azione «termina»), la sistemazione
 * delle attività aggiunte per un giorno, il salvataggio delle sedute nella cartella del bambino,
 * la proposta del target successivo a criterio e l'annotazione del cambio di time delay.
 * Spostato da js/tice-home.js: il nucleo (presa dati, bozza) chiama proponiProssimo al momento dell'uso.
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, M = window.TiceModalita, C = window.TiceComportamenti;
    if (!P || !M || !C || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const EST = X.agganci;   // i punti di aggancio delle estensioni: si leggono al momento dell'uso
    const { h, grezzo, icona, foglio, conferma, avviso, disegna, T, paz, salvaPaziente, puoProgrammi, formatoData, ETICHETTE_STATO, chiOpera, sec, secMmss, oggi, timbro, classePct,
        bozza, salvaBozza, eliminaBozza, haDati, episodiBozza, riassunto, eGruppo, attivitaDi, attPerVoce, msDi, misure, statoLU, convertiVoce, sceltePersone, agganciaChi,
        moduloAttivita, creaAttivitaDaModulo } = X;

    // Se i secondi sono diversi dall'ultima seduta in time delay dell'attività,
    // il cambio si legge nella seduta (nota e campo tdCambio) e quindi nei grafici
    function annotaTD(p, att, s) {
        if (s.sessionType !== 'timedelay' || s.timeDelaySeconds == null) return;
        const prima = P.sedute(p, att).filter((x) => x.sessionType === 'timedelay' && x.timeDelaySeconds != null);
        if (!prima.length) return;
        const da = prima[prima.length - 1].timeDelaySeconds;
        if (da === s.timeDelaySeconds) return;
        s.tdCambio = { da, a: s.timeDelaySeconds };
        const testo = `Time delay da ${sec(da)} a ${sec(s.timeDelaySeconds)}`;
        s.note = s.note ? testo + ' — ' + s.note : testo;
    }

    // Prima di salvare: le attività scritte solo per questa seduta vanno unite a una del programma
    // o aggiunte come nuove (con modalità e target, come dal programma), così i dati non restano sparsi.
    // Restituisce false se si torna alla seduta.
    async function sistemaTemporanee(p, b) {
        const conDati = () => b.temp.filter((t) => !t.fuori && haDati(b.voci[t.id]));
        let giro = 0;
        while (conDati().length && giro++ < 50) {
            const t = conDati()[0], v = b.voci[t.id], n = v.v + v.p + v.x;
            const resto = conDati().length;
            const nt = M.normalizza(t.nome);
            const candidati = P.programma(p).attivita.filter((a) => !misure(a).length);
            const simile = (a) => { const na = M.normalizza(a.nome); return (t.modalita && a.modalita === t.modalita) || (na && nt && (na === nt || na.includes(nt) || nt.includes(na))); };
            const vicine = candidati.filter(simile);
            const altre = candidati.filter((a) => !simile(a)).sort((x, y) => (x.stato === 'attivo' ? 0 : 1) - (y.stato === 'attivo' ? 0 : 1) || String(x.nome).localeCompare(String(y.nome), 'it'));
            const opz = (a) => h`<button type="button" class="opzione" data-foglio="${'u:' + a.id}"><span class="corpo">${a.nome}<small>${ETICHETTE_STATO[a.stato] || a.stato}${(() => { const c = P.targetCorrente(a); return c ? ' · ' + c.target.testo : ''; })()}</small></span>${icona('arrow-right')}</button>`;
            const r = await foglio(h`<div><h2>«${t.nome}»</h2>
                <p class="sotto">L'hai aggiunta solo per questa seduta (${n} ${n === 1 ? 'risposta' : 'risposte'}). Prima di salvare, dove vanno questi dati?${resto > 1 ? h` <b>${resto} da sistemare.</b>` : ''}</p>
                ${vicine.length ? h`<h3>Forse è</h3><div class="opzioni">${vicine.map(opz)}</div>` : ''}
                ${puoProgrammi(p) ? h`<div class="opzioni" style="margin-top:10px"><button type="button" class="opzione" data-foglio="nuova">${icona('plus')}<span class="corpo">Aggiungila al programma come attività nuova<small>Con modalità, target e criterio, come dal programma</small></span></button></div>` : ''}
                ${altre.length ? h`<details class="sez apribile" ${vicine.length ? '' : grezzo('open')}><summary><span class="sez-titolo">Unisci a un'altra attività del programma</span> <span class="sotto piccolo">${altre.length}</span></summary><div class="opzioni">${altre.map(opz)}</div></details>` : ''}
                <details style="margin-top:12px"><summary class="sotto piccolo">Altro</summary>
                    <div class="opzioni" style="margin-top:6px"><button type="button" class="opzione" data-foglio="fuori"><span class="corpo">Lasciala fuori dal programma${puoProgrammi(p) ? '' : ': la sistema la referente'}<small>I dati restano con il nome «${t.nome}», senza grafico dell'attività né criterio</small></span></button></div></details>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Torna alla seduta</button></div></div>`);
            if (!r) return false;
            if (r === 'fuori') { t.fuori = true; salvaBozza(); continue; }
            let dest = null;
            if (r === 'nuova') {
                const m = await moduloAttivita(p, null, Object.assign({ nome: t.nome, sessionType: t.sessionType || 'independent' }, t.modalita ? { modalita: t.modalita } : {}));
                if (!m) continue;
                dest = await creaAttivitaDaModulo(p, m);
            } else if (typeof r === 'string' && r.startsWith('u:')) dest = P.attivita(p, r.slice(2));
            if (!dest) continue;
            unisciTemporanea(p, b, t, dest);
        }
        return true;
    }
    // I dati di un'attività di un giorno passano a una del programma (sommandosi a quelli già presi oggi)
    function unisciTemporanea(p, b, t, att) {
        const v = Object.assign({}, b.voci[t.id]), c = P.targetCorrente(att);
        const gia = b.voci[att.id];
        if (gia && haDati(gia)) {
            // stesso tipo di risposte (✗ o P) prima di sommare
            const tipo = gia.sessionType || att.sessionType || 'independent';
            if ((v.sessionType || 'independent') !== tipo) { v.sessionType = tipo; convertiVoce(v, tipo, att); }
            gia.v += v.v; gia.p += v.p; gia.x += v.x;
            gia.sequenza = (gia.sequenza || '') + (v.sequenza || '');
            gia.nota = [gia.nota, v.nota].filter(Boolean).join(' — ');
            if (!gia.decisione) gia.decisione = v.decisione || '';
        } else {
            // la voce tiene il tipo con cui è stata presa (vale più di quello dell'attività)
            b.voci[att.id] = Object.assign(v, { targetId: c ? c.target.id : null, mantenimento: !!(c && c.mantenimento) });
        }
        if (att.stato !== 'attivo' && !b.extra.includes(att.id)) b.extra.push(att.id);
        delete b.voci[t.id];
        b.temp = b.temp.filter((x) => x.id !== t.id);
        delete T.aperte[t.id];
        salvaBozza();
        avviso(`«${t.nome}» → ${att.nome}`);
    }
    async function salvaSeduta(p, b, dati) {
        const quando = b.data === oggi() ? new Date().toISOString() : b.data + 'T12:00:00';
        const operatore = String(dati.operatore || '').trim();
        const nuove = [];
        const controlla = [];
        const attese = [];   // { nome, n, di }: prove che aspettano di completare la LU
        Object.keys(b.voci).forEach((k) => {
            const v = b.voci[k];
            if (!haDati(v)) return;
            const att = attivitaDi(p, k);
            if (!att) return;
            // una delle prese dati dell'attività: seduta a sé, con il suo nome e il suo grafico
            const m = misure(att).find((x) => x.id === msDi(k)) || null;
            const marca = (x) => {
                if (m && x) {
                    x.setName += ' · ' + m.nome; x.setId += '~' + m.id; x.misura = m.id; x.misuraNome = m.nome;
                    if (m.mantenimento) { x.mantenimento = true; x.fuoriStatistiche = true; }
                    if (m.bambino) { x.bambino = m.id; x.bambinoNome = m.nome; x.gruppo = p.id; }
                }
                return x;
            };
            const voceS = Object.assign({}, v, { operatore: String(v.operatore || '').trim() || operatore });
            // il time delay di oggi resta scritto nella seduta, anche se poi il programma cambia
            if (!att.temporanea && (v.sessionType || att.sessionType) === 'timedelay' && P.secondiTD(v.tdSeconds) == null) {
                const tt = v.targetId ? att.target.find((x) => x.id === v.targetId) : null;
                const d = P.tdDi(att, tt);
                if (d != null) voceS.tdSeconds = d;
            }
            let s;
            if (att.temporanea) {
                s = P.seduta({ id: null, nome: att.nome, area: '', sessionType: att.sessionType }, null, voceS, quando);
                s.attivitaId = null;
                s.setId = 'quaderno_' + att.nome.replace(/\s+/g, '_').toLowerCase();
            } else {
                const t = v.targetId ? att.target.find((x) => x.id === v.targetId) : null;
                const senza = !(att.target || []).length;
                const prima = t || senza ? P.criterioDi(p, att, t) : null;
                if (t && !t.inizio) t.inizio = b.data;
                const giaIn = controlla.some((c) => c.att === att);
                // con più prese dati: quali erano già a criterio, per avvisare di quelle nuove
                const primaM = misure(att).map((x) => x.mantenimento || !!P.criterioRaggiunto(P.sedute(p, att, t || undefined, x.id), att.criterio));
                if (!giaIn && ((t && t.stato === 'attivo') || senza) && !prima && !att.mantenimento) controlla.push({ att, t: t || null, primaM });
                const attL = m ? attPerVoce(att, k) : att;
                if (P.conAttesa(attL, t)) {
                    // LU contate: entrano nei dati solo a blocchi completi, il resto aspetta
                    const n = +attL.prove, k = P.chiaveAttesa(t, m && m.id), prec = P.inAttesaDi(att, t, m && m.id);
                    const seq = (v.sequenza || '').length === v.v + v.p + v.x ? v.sequenza : 'V'.repeat(v.v) + 'P'.repeat(v.p) + 'X'.repeat(v.x);
                    const { blocchi, resto } = P.dividiLU(prec && prec.seq, seq, n);
                    const testoOggi = [voceS.decisione ? '**' + voceS.decisione + '**' : '', voceS.nota].filter(Boolean).join(' — ');
                    blocchi.forEach((bl, i) => {
                        const ultimo = i === blocchi.length - 1;
                        const vb = Object.assign({}, voceS, P.contaRisposte(bl), { sequenza: bl, nota: '', decisione: '' });
                        const sb = marca(P.seduta(att, t, vb, quando));
                        const note = [];
                        if (i === 0 && prec && prec.seq) {
                            note.push(`LU iniziata il ${formatoData(prec.dal)} (${prec.seq.length} prove) e completata oggi`);
                            (prec.note || []).forEach((x) => note.push(x));
                        }
                        if (ultimo && testoOggi) note.push(testoOggi);
                        if (note.length) sb.note = note.join(' — ');
                        if (i === 0 && prec && prec.dal) sb.iniziata = prec.dal;
                        annotaTD(p, att, sb);
                        nuove.push(sb);
                        p.history = p.history || [];
                        p.history.push(sb);   // la seduta dopo confronta il time delay con questa
                    });
                    att.inAttesa = att.inAttesa || {};
                    if (resto) {
                        att.inAttesa[k] = { seq: resto, dal: blocchi.length ? b.data : ((prec && prec.dal) || b.data),
                            note: blocchi.length ? [] : ((prec && prec.note) || []).concat(testoOggi ? [testoOggi] : []) };
                        attese.push({ nome: att.nome + (m ? ' · ' + m.nome : ''), n: resto.length, di: n });
                    } else delete att.inAttesa[k];
                    if (!Object.keys(att.inAttesa).length) delete att.inAttesa;
                    return;
                }
                s = marca(P.seduta(att, t, voceS, quando));
                annotaTD(p, att, s);
            }
            nuove.push(s);
            p.history = p.history || [];
            p.history.push(s);
        });
        // "Passa a 2" T/D" nella decisione: dalla prossima seduta il programma usa i nuovi secondi
        const passati = [];
        if (puoProgrammi(p)) Object.keys(b.voci).forEach((k) => {
            const v = b.voci[k], att = attivitaDi(p, k);
            if (!att || att.temporanea || !haDati(v)) return;
            const n = P.tdDaDecisione(v.decisione);
            if (n != null && P.impostaTD(att, n, { chi: operatore || chiOpera(), il: b.data })) {
                att.sessionType = 'timedelay';
                att.modificato = new Date().toISOString();
                passati.push(`${att.nome} → ${sec(n)}`);
            }
        });
        // comportamenti problema: una voce dello storico per ciascuno osservato
        const compSalvati = dati.comportamenti ? C.sedute(p, b, quando, Math.max(1, Math.min(600, parseInt(dati.minutiOss, 10) || 60)), operatore) : [];
        if (compSalvati.length) { p.history = p.history || []; compSalvati.forEach((x) => p.history.push(x)); }
        const nota = String(dati.nota || '').trim();
        if (nota) {
            if (window.TiceNote) {
                const me = (window.TiceSync && TiceSync.attivo() && TiceSync.S.io) || {};
                window.TiceNote.aggiungi(p, { testo: nota, data: b.data, tag: 'seduta', autore: operatore || me.nome || '', email: me.email || '' });
            } else {
                p.dailyNotes = p.dailyNotes || {};
                p.dailyNotes[b.data] = p.dailyNotes[b.data] ? p.dailyNotes[b.data] + '\n\n' + nota : nota;
            }
        }
        await salvaPaziente(p);
        eliminaBozza(p.id);
        T.aperte = {};
        timbro('Salvata · ' + formatoData(b.data));
        avviso(`Seduta salvata${attese.length ? ' · in attesa di completare la LU: ' + attese.map((x) => `${x.nome} ${x.n}/${x.di}`).join(', ') : ''}${passati.length ? ' · time delay: ' + passati.join(', ') : ''}`);
        disegna();
        // Criteri raggiunti con questa seduta: si propone il passo successivo
        for (const { att, t, primaM } of controlla) {
            // una presa dati arrivata a criterio, le altre ancora no
            misure(att).forEach((x, i) => {
                if (!primaM[i] && P.criterioRaggiunto(P.sedute(p, att, t || undefined, x.id), att.criterio) && !P.criterioDi(p, att, t)) {
                    const acq = misure(att).filter((y) => !y.mantenimento);
                    const fatte = acq.filter((y) => P.criterioRaggiunto(P.sedute(p, att, t || undefined, y.id), att.criterio)).length;
                    avviso(`${att.nome} · ${x.nome}: a criterio (${fatte} di ${acq.length}). L'attività ci arriva quando ci arrivano tutte.`);
                }
            });
            if (!t) {
                if (P.criterioDi(p, att, null)) avviso(`${att.nome}: criterio raggiunto (${att.criterio.soglia}% per ${att.criterio.sedute} giorni).`);
                continue;
            }
            const data = P.criterioDi(p, att, t);
            if (data) await proponiProssimo(p, att, t, data);
        }
        disegna();
    }

    async function proponiProssimo(p, att, t, data) {
        if (!puoProgrammi(p)) {
            avviso(`${att.nome}: criterio raggiunto su «${t.testo}». Il passaggio al prossimo target lo decide la referente.`);
            return;
        }
        const pianificati = att.target.filter((x) => x.stato === 'pianificato');
        const r = await foglio(h`<form><h2>${icona('flag-checkered')} ${att.nome}</h2>
            <p>${data ? h`Il target <b>${t.testo}</b> ha raggiunto il criterio (${att.criterio.soglia}% per ${att.criterio.sedute} giorni di fila) il ${formatoData(data)}.`
                : h`Chiudere a criterio il target <b>${t.testo}</b>?`}</p>
            ${pianificati.length ? h`<h3>Passa a</h3><div class="opzioni">${pianificati.map((x, i) => h`
                <button type="button" class="opzione" data-foglio="${'t:' + x.id}">${icona(i === 0 ? 'circle-play' : 'circle')}<span class="corpo">${x.testo}${i === 0 ? h`<small>il prossimo in programma</small>` : ''}</span></button>`)}</div>` : ''}
            <h3>${pianificati.length ? 'Oppure un target nuovo' : 'Prossimo target'}</h3>
            <div style="display:flex;gap:8px"><input name="nuovo" maxlength="300" placeholder="Scrivi il prossimo target" style="flex:1;min-width:0">
                <button class="bt primario" style="flex:0 0 auto">Apri</button></div>
            <div class="bottoni" style="margin-top:18px">
                <button type="button" class="bt" data-foglio="dopo">Più tardi</button>
                <button type="button" class="bt" data-foglio="solo">Chiudi e basta</button>
            </div>
            <p class="sotto piccolo">"Più tardi" lascia il target in corso: si chiude quando si vuole dalla presa dati o dal programma. "Chiudi e basta" lo segna a criterio senza aprirne un altro.</p></form>`,
            { invia: (f) => { const n = f.querySelector('[name=nuovo]').value.trim(); if (!n) { f.querySelector('[name=nuovo]').focus(); return undefined; } return 'n:' + n; } });
        if (!r || r === 'dopo') return;
        if (r === 'solo') P.chiudiTarget(att, t.id, 'criterio', data || P.oggi(), null);
        else if (r.startsWith('t:')) P.chiudiTarget(att, t.id, 'criterio', data || P.oggi(), r.slice(2));
        else if (r.startsWith('n:')) {
            const nuovo = P.aggiungiTarget(att, r.slice(2), false);
            P.chiudiTarget(att, t.id, 'criterio', data || P.oggi(), nuovo.id);
        }
        await salvaPaziente(p);
        const c = P.targetCorrente(att);
        avviso(c && !c.mantenimento ? `${att.nome}: ora «${c.target.testo}»` : `${att.nome}: target chiuso`);
    }

    TiceHome.estendi({
        azioni: {
            termina: async () => {
                const p = paz(T.pid);
                const b = bozza(p.id);
                if (!await sistemaTemporanee(p, b)) { T.mantieniScroll = true; disegna(); return; }
                T.mantieniScroll = true; disegna();
                const r0 = riassunto(p);
                // i comportamenti osservati sono un dato anche senza risposte (zero episodi compreso)
                const comp = eGruppo(p) ? [] : C.attivi(p).filter((c) => !((b.comp || {})[c.id] || {}).nonOsservato);
                const conComp = comp.length && (episodiBozza(b) || r0.n || await conferma('Salvare solo i comportamenti?', `Nessuna risposta registrata: si salvano ${comp.map((c) => c.nome).join(', ')} con zero episodi.`, { ok: 'Salva' }));
                if (!r0.n && !conComp) { if (!comp.length) avviso('Nessuna risposta registrata.', 'errore'); return; }
                const minutiDa = Math.max(5, Math.min(600, Math.round((Date.now() - Date.parse(b.inizio || new Date().toISOString())) / 60000)));
                const righe = Object.keys(b.voci).filter((k) => haDati(b.voci[k])).map((k) => {
                    const v = b.voci[k], a = attivitaDi(p, k), tot = v.v + v.p + v.x, pct = Math.round(100 * v.v / tot);
                    const tt = a && v.targetId ? (a.target || []).find((x) => x.id === v.targetId) : null;
                    const lu = a ? statoLU(attPerVoce(a, k), v, tt, msDi(k)) : null;
                    const mm = a ? misure(a).find((x) => x.id === msDi(k)) : null;
                    return h`<tr><td>${a ? a.nome : '?'}${mm ? ' · ' + mm.nome : ''}${lu ? h`<br><small class="sotto">${lu.blocchi.length ? `${lu.blocchi.length} LU nei dati` : 'non entra ancora nei dati'}${lu.resto ? ` · ${lu.resto}/${lu.n} in attesa` : ''}</small>` : ''}</td><td class="num">${v.v}/${tot}</td><td class="num"><b class="${classePct(pct, a && a.criterio && a.criterio.soglia)}">${pct}%</b></td></tr>`;
                });
                // chi ha svolto la seduta: dai turni del calendario; se non c'è nessuno, lo si chiede
                const cal = EST.chiDi ? await EST.chiDi(p.id, b.data).catch(() => ({ nomi: [], persone: [] })) : { nomi: [], persone: [] };
                const operatore = b.operatore || cal.nomi.join(' + ');
                let ultimo = '';
                try { ultimo = localStorage.getItem('tice_operatore') || ''; } catch (e) { /* niente */ }
                const suggeriti = [...new Set([ultimo, ...cal.persone].filter(Boolean))];
                const dati = await foglio(h`<form class="fine-seduta"><h2>Fine seduta</h2>
                    ${r0.n ? h`<table class="tabella" style="margin-bottom:14px"><tbody>${righe}</tbody>
                        <tfoot><tr><th>Learn unit</th><th class="num">${r0.corrette}/${r0.prove}</th><th class="num">${Math.round(100 * r0.corrette / r0.prove)}%</th></tr></tfoot></table>` : ''}
                    ${conComp ? h`<h3>Comportamenti</h3><table class="tabella" style="margin-bottom:8px"><tbody>${comp.map((c) => { const x = (b.comp || {})[c.id]; const n = x ? x.episodi.length + (x.inCorso ? 1 : 0) : 0; return h`<tr><td>${c.nome}</td><td class="num">${n} ${n === 1 ? 'episodio' : 'episodi'}${c.misura === 'durata' && x ? ' · ' + secMmss(C.secondiTotali(x)) : ''}</td></tr>`; })}</tbody></table>
                        <label class="campo"><span>Minuti di osservazione <small class="sotto">· per gli episodi all'ora</small></span><input name="minutiOss" type="number" min="1" max="600" inputmode="numeric" required value="${minutiDa}"></label>` : ''}
                    <label class="campo campo-chi"><span>Chi ha svolto la seduta${!b.operatore && cal.nomi.length ? h` <small class="sotto">· dal calendario</small>` : ''}</span><input name="operatore" maxlength="120" required value="${operatore}" placeholder="Nome, o più nomi separati da +" list="tice-chi" autocomplete="off">
                        <datalist id="tice-chi">${suggeriti.map((n) => h`<option value="${n}">`)}</datalist></label>
                    ${sceltePersone(cal.nomi.concat(cal.persone), 'operatore')}
                    <label class="campo"><span>Note sulla seduta (vanno nel diario del giorno)</span><textarea name="nota" maxlength="5000" placeholder="Comportamento, rinforzatori, osservazioni…"></textarea></label>
                    <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Torna alla seduta</button><button class="bt primario">${icona('check')} Salva</button></div></form>`, { dopo: agganciaChi });
                if (!dati) return;
                try { localStorage.setItem('tice_operatore', dati.operatore.trim().split('+')[0].trim()); } catch (e) { /* niente */ }
                if (conComp) dati.comportamenti = true;
                await salvaSeduta(p, b, dati);
            }
        },
        aggancio: { proponiProssimo }
    });
    X.proponiProssimo = proponiProssimo;
})();
