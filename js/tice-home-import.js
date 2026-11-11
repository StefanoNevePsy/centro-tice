/**
 * Centro TICE — import dei quaderni Numbers: la schermata per scegliere i file, controllare cosa è stato
 * letto (bambino, unione con il programma esistente, modo di raccogliere il dato, modalità) e importare.
 * Spostato da js/tice-home.js: il nucleo apre la schermata («vai-import») e chiama i gestori dei campi
 * (data-cambio) registrati qui con estendi({ cambi }).
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, M = window.TiceModalita;
    if (!P || !M || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, esc, barra, avviso, disegna, T, paz, pazienti, salvaPaziente, formatoData, dizionario, ETICHETTE_STATO,
        perCategoria, rinominaSedute, nuovoBambino } = X;
    // questi li aggiunge js/tice-home-classifica.js: si chiamano al momento dell'uso
    const statoModalita = (...a) => X.statoModalita(...a), rigaModalita = (...a) => X.rigaModalita(...a);
    const applicaScelte = (...a) => X.applicaScelte(...a), condividiScelte = (...a) => X.condividiScelte(...a);

    const normNome = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    // Fusione con un programma già creato nell'app: per ogni attività del quaderno
    // quella del programma che le somiglia (proposta), o "nuova attività".
    function proponiUnione(it) {
        const p = it.pazienteId ? paz(it.pazienteId) : null;
        it.unisci = {}; it.proposte = {};
        if (!p || !(P.programma(p).attivita || []).length) return;
        const diz = dizionario();
        // i nomi ambigui (FD) non si abbinano per modalità: solo per nome
        const mod = (a) => { if (a.modalita) return a.modalita; const r = M.riconosci(a, diz); return r.ambiguo ? null : r.modalita; };
        const r = TiceImport.abbina(it.pk, p, { modalita: mod });
        Object.entries(r).forEach(([id, x]) => { if (x.id) { it.unisci[id] = x.id; it.proposte[id] = x.punteggio; } });
    }
    function sezioneUnione(it, i) {
        const p = it.pazienteId ? paz(it.pazienteId) : null;
        const esistenti = p ? (P.programma(p).attivita || []).filter((a) => a.origine !== 'numbers' || (a.unitoDa || []).length) : [];
        if (!p || !esistenti.length) return '';
        const giaImportate = new Set((P.programma(p).attivita || []).map((a) => a.id));
        const righe = it.pk.attivita.filter((a) => !giaImportate.has(a.id));
        if (!righe.length) return '';
        const diz = dizionario();
        const opz = (scelto) => perCategoria(esistenti).map((g) => h`<optgroup label="${g.area}">${g.att.map((x) => h`<option value="${x.id}" ${scelto === x.id ? grezzo('selected') : ''}>${x.nome}${x.stato !== 'attivo' ? ' (' + (ETICHETTE_STATO[x.stato] || x.stato) + ')' : ''}</option>`)}</optgroup>`);
        const n = righe.filter((a) => it.unisci[a.id]).length;
        return h`<h3 style="margin-left:0">Unisci con il programma di ${p.name}</h3>
            <p class="sotto piccolo">${p.name} ha già un programma nell'app. Ogni attività del quaderno si può unire a una già esistente (i target uguali si uniscono, gli altri entrano come storia chiusa, le sedute nello stesso grafico) o aggiungere come nuova. ${n ? `Proposte ${n} unioni per nome simile: controllale.` : ''}</p>
            ${(() => {
                const riga = (a) => h`<div class="riga-dato"><div><b>${(a.area || 'Terminati') + ' / ' + a.nome}</b>
                    ${it.proposte[a.id] && it.unisci[a.id] ? h` <span class="pill verde">proposta</span>` : ''}</div>
                <div class="riga-campi"><label class="campo"><span>Nel programma</span>
                    <select class="campo-in" data-cambio="imp-unisci" data-i="${i}" data-att="${a.id}">
                        <option value="" ${!it.unisci[a.id] ? grezzo('selected') : ''}>Aggiungi come nuova attività</option>${opz(it.unisci[a.id])}</select></label></div></div>`;
                const unite = righe.filter((a) => it.unisci[a.id] || it.proposte[a.id]), altre = righe.filter((a) => !unite.includes(a));
                return h`${unite.map(riga)}
                    ${altre.length ? h`<details data-chiusi="${'unisci-i' + i}" ${T.chiusiAperti['unisci-i' + i] ? grezzo('open') : ''}><summary class="sotto">${unite.length ? 'Le altre' : 'Tutte le'} ${altre.length} attività: aggiunte come nuove (si possono unire anche queste)</summary>${altre.map(riga)}</details>` : ''}`;
            })()}`;
    }
    // Come si raccoglieva il dato di ogni attività: strategia, tipo di dato, prove per seduta, criterio.
    // Precompilato da quello che si legge nel quaderno; prima le attività da controllare.
    function sezioneDato(it, i, terminata) {
        const pk = it.pk;
        const dubbi = {};
        pk.daConfermare.forEach((d) => { dubbi[d.attivitaId] = d; });
        const riga = (a) => {
            const st = it.impost[a.id], d = dubbi[a.id];
            const da = (campo) => grezzo(`data-cambio="imp-imp" data-i="${i}" data-att="${esc(a.id)}" data-campo="${campo}"`);
            const sel = (campo, opz) => h`<select class="campo-in" ${da(campo)}>${opz.map(([v, n]) => h`<option value="${v}" ${String(st[campo]) === v ? grezzo('selected') : ''}>${n}</option>`)}</select>`;
            return h`<div class="riga-dato">
                <div><b>${(a.area || 'Terminati') + ' / ' + a.nome}</b>
                    ${d && !d.certo ? h` <span class="pill arancio">da controllare</span>` : d ? h` <span class="pill verde">quasi certo</span>` : ''}</div>
                ${d ? h`<div class="sotto piccolo">${d.motivo}</div>` : ''}
                <div class="riga-campi">
                    <label class="campo"><span>Strategia</span>${sel('sessionType', [['independent', 'Indipendente'], ['timedelay', 'Time delay']])}</label>
                    ${st.sessionType === 'timedelay' ? h`<label class="campo stretto"><span>Secondi T/D</span><input class="campo-in" type="number" min="1" max="30" inputmode="numeric" value="${st.tdSeconds || ''}" placeholder="—" ${da('tdSeconds')}></label>` : ''}
                    <label class="campo"><span>Dato</span>${sel('scala', [['conteggio', 'LU contate'], ['percentuale', 'Percentuale']])}</label>
                    ${st.scala !== 'percentuale' ? h`<label class="campo stretto"><span>Prove per seduta</span><input class="campo-in" type="number" min="1" max="200" inputmode="numeric" value="${st.prove || ''}" ${da('prove')}></label>` : ''}
                    <label class="campo stretto"><span>Criterio %</span><input class="campo-in" type="number" min="10" max="100" inputmode="numeric" value="${st.soglia}" ${da('soglia')}></label>
                    <label class="campo stretto"><span>Giorni di fila</span><input class="campo-in" type="number" min="1" max="10" inputmode="numeric" value="${st.sedute}" ${da('sedute')}></label>
                </div></div>`;
        };
        const attive = pk.attivita.filter((a) => !terminata[a.id]), finite = pk.attivita.filter((a) => terminata[a.id]);
        const vedere = attive.filter((a) => dubbi[a.id] && !dubbi[a.id].certo), resto = attive.filter((a) => !vedere.includes(a));
        return h`<h3 style="margin-left:0">Come si raccoglie il dato</h3>
            <p class="sotto piccolo">Per ogni attività: la <b>strategia</b> (indipendente o time delay), il <b>dato</b> (LU contate, o percentuale come «dato in %»), le <b>prove per seduta</b> (quante LU si fanno in una seduta: dove il quaderno scrive solo le corrette, la differenza diventa errori) e il <b>criterio</b> per chiudere un target. Precompilato da quello che c'è nel quaderno: cambiando il tipo di dato i valori si convertono (7 su 10 → 70%).</p>
            ${vedere.map(riga)}
            ${resto.length ? h`<details data-chiusi="${'dato-i' + i}" ${T.chiusiAperti['dato-i' + i] ? grezzo('open') : ''}><summary class="sotto">${vedere.length ? 'Le altre' : 'Tutte le'} ${resto.length} attività in corso</summary>${resto.map(riga)}</details>` : ''}
            ${finite.length ? h`<details data-chiusi="${'dato-t' + i}" ${T.chiusiAperti['dato-t' + i] ? grezzo('open') : ''}><summary class="sotto">Attività terminate (${finite.length})</summary>${finite.map(riga)}</details>` : ''}`;
    }
    function schedaImport(it, i) {
        if (it.errore) return h`<div class="scheda imbottita"><b>${it.file}</b><p class="sotto">${icona('triangle-exclamation')} ${it.errore}</p></div>`;
        const pk = it.pk;
        if (it.fatto) return h`<div class="scheda imbottita"><b>${icona('circle-check')} ${it.nome}</b>
            <p class="sotto">${it.fatto}</p>
            <button class="bt piccolo" data-a="apri-bambino" data-pid="${it.pazienteId}">Apri la presa dati</button></div>`;
        const attive = pk.attivita.filter((a) => a.stato === 'attivo');
        const nSedute = TiceImport.sedute(pk, it.conferme).length;
        const esistente = it.pazienteId ? paz(it.pazienteId) : null;
        const giaFatto = esistente && (esistente.importazioni || []).find((x) => x.file === pk.file);
        const terminata = {};
        pk.attivita.forEach((a) => { terminata[a.id] = a.stato !== 'attivo'; });
        return h`<div class="scheda imbottita" data-imp="${i}">
            <div class="sotto piccolo">${icona('file')} ${pk.file}</div>
            <label style="display:block;margin:10px 0"><span class="sotto piccolo">Bambino</span>
                <select class="campo-in" data-cambio="imp-paziente" data-i="${i}">
                    <option value="">Nuovo: ${it.nome}</option>
                    ${pazienti().map((x) => h`<option value="${x.id}" ${x.id === it.pazienteId ? grezzo('selected') : ''}>${x.name}</option>`)}
                </select></label>
            ${!it.pazienteId ? h`<label style="display:block;margin:0 0 10px"><span class="sotto piccolo">Nome del nuovo bambino</span>
                <input class="campo-in" value="${it.nome}" data-cambio="imp-nome" data-i="${i}"></label>` : ''}
            ${giaFatto ? h`<div class="banda">${icona('rotate')}<div>Questo file è già stato importato il ${formatoData(P.giorno(giaFatto.data))}: le sedute importate allora vengono sostituite, quelle registrate nell'app restano.</div></div>` : ''}
            <table class="tabella"><tbody>
                <tr><td>Attività in corso</td><td class="num"><b>${attive.length}</b></td></tr>
                <tr><td>Attività terminate</td><td class="num">${pk.attivita.length - attive.length}</td></tr>
                <tr><td>Sedute</td><td class="num"><b>${nSedute}</b></td></tr>
                <tr><td>Giorni di learn unit</td><td class="num">${pk.storico.length}</td></tr>
            </tbody></table>
            <details><summary>Attività in corso e target</summary><ul>
                ${attive.map((a) => { const c = P.targetCorrente(a); return h`<li><b>${a.nome}</b>${a.area ? ' (' + a.area + ')' : ''}${c ? ': ' + c.target.testo : ''}</li>`; })}
            </ul></details>
            ${sezioneUnione(it, i)}
            ${sezioneDato(it, i, terminata)}
            ${(() => {
                const righe = pk.attivita.map((a) => [a, it.modalita[a.id]]);
                const vedere = righe.filter(([, st]) => !st.iniziale), ok = righe.filter(([, st]) => st.iniziale);
                return h`<h3 style="margin-left:0">Modalità</h3>
                    <p class="sotto piccolo">Ogni tabella del quaderno va in una modalità del centro, dentro la sua categoria: quaderni diversi e giochi dell'app finiscono insieme. Le scelte valgono anche per i prossimi quaderni.</p>
                    ${vedere.map(([a, st]) => rigaModalita('i' + i, a.id, st))}
                    ${ok.length ? h`<details data-chiusi="${'mod-i' + i}" ${T.chiusiAperti['mod-i' + i] ? grezzo('open') : ''}><summary class="sotto">${ok.length} riconosciute: ${ok.map(([a, st]) => a.nome + ' → ' + M.etichetta({ modalita: st.modalita, variante: st.variante }, dizionario())).join(' · ')}</summary>${ok.map(([a, st]) => rigaModalita('i' + i, a.id, st))}</details>` : ''}`;
            })()}
            ${pk.avvisi.length ? h`<details><summary>${pk.avvisi.length} avvisi</summary><ul>${pk.avvisi.map((a) => h`<li>${a}</li>`)}</ul></details>` : ''}
            <button class="bt primario largo" style="margin-top:12px" data-a="importa" data-i="${i}">${icona('file-import')} Importa</button>
        </div>`;
    }
    function vistaImport() {
        const daFare = T.importazioni.filter((x) => x.pk && !x.fatto).length;
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Importa quaderni Numbers' })}
            <main class="tice-main">
                <p class="sotto">Scegli uno o più file <b>.numbers</b> (anche direttamente da Drive). Ogni file diventa il programma del bambino e il suo storico, dentro le cartelle cliniche dell'app. Prima di salvare puoi controllare cosa è stato letto.</p>
                <label class="file-scelta">${icona('file-arrow-up')} <b>Scegli i file</b><br><span class="sotto piccolo">Si legge tutto sul dispositivo: nulla viene inviato.</span>
                    <input type="file" multiple data-cambio="file-numbers"></label>
                ${T.leggendo ? h`<p class="sotto" style="margin-top:12px">${icona('spinner fa-spin')} Lettura di ${T.leggendo}…</p>` : ''}
                ${daFare > 1 ? h`<button class="bt arancio largo" style="margin-top:12px" data-a="importa-tutti">${icona('file-import')} Importa tutti (${daFare})</button>` : ''}
                <div style="margin-top:12px">${T.importazioni.map(schedaImport)}</div>
            </main>`;
    }

    async function importaUno(i) {
        const it = T.importazioni[i];
        if (!it || !it.pk || it.fatto) return;
        let p = it.pazienteId ? paz(it.pazienteId) : null;
        if (!p) {
            p = { id: Date.now().toString() + i, name: (it.nome || it.pk.nome).trim() || it.pk.nome, history: [], programma: { attivita: [] } };
        }
        try {
            const soglia = typeof DEFAULT_CRITERION !== 'undefined' ? DEFAULT_CRITERION : 90;
            const nuovo = !paz(p.id);
            const aggiunte = applicaScelte(it.pk.attivita.map((a) => [a, it.modalita[a.id]]));
            const r = TiceImport.applica(p, it.pk, it.conferme, { sogliaPredefinita: soglia, unisci: it.unisci || {} });
            new Set(Object.values(it.unisci || {})).forEach((id) => { const a = P.attivita(p, id); if (a) rinominaSedute(p, a); });
            await salvaPaziente(p);
            await condividiScelte(aggiunte);
            if (nuovo) await nuovoBambino(p);
            it.pazienteId = p.id;
            it.nome = p.name;
            it.fatto = `${r.sedute} sedute e ${it.pk.attivita.length} attività nella cartella di ${p.name}.`;
        } catch (e) {
            console.error(e);
            avviso('Import non riuscito: ' + e.message, 'errore');
        }
    }

    async function leggiFile(files) {
        for (const f of files) {
            if (!/\.numbers$/i.test(f.name)) {
                T.importazioni.push({ file: f.name, errore: 'Non è un file .numbers.' });
                continue;
            }
            T.leggendo = f.name; disegna();
            try {
                const doc = await NumbersReader.leggi(await f.arrayBuffer());
                const pk = TiceImport.analizza(doc, f.name);
                if (!pk.attivita.length) throw new Error('Nessuna tabella di attività riconosciuta in questo file.');
                const n = normNome(pk.nome);
                const esistente = pazienti().find((x) => normNome(x.name) === n);
                const conferme = {};
                pk.daConfermare.forEach((d) => { conferme[d.attivitaId] = d.proposta; });
                const modalita = {}, impost = {};
                pk.attivita.forEach((a) => {
                    modalita[a.id] = statoModalita(a);
                    const td = a.tdSeconds || ((a.target || []).find((t) => t.tdSeconds) || {}).tdSeconds || null;
                    impost[a.id] = { sessionType: a.sessionType || 'independent', tdSeconds: td, scala: a.scala === 'percentuale' ? 'percentuale' : 'conteggio',
                        prove: conferme[a.id] != null ? conferme[a.id] : a.prove, soglia: (a.criterio || {}).soglia || 90, sedute: (a.criterio || {}).sedute || 2 };
                });
                const nuovo = { file: f.name, pk, nome: pk.nome, pazienteId: esistente ? esistente.id : '', conferme, modalita, impost, unisci: {}, proposte: {} };
                proponiUnione(nuovo);
                T.importazioni.push(nuovo);
            } catch (e) {
                console.error(e);
                T.importazioni.push({ file: f.name, errore: e.message || String(e) });
            }
        }
        T.leggendo = null;
        disegna();
    }

    // I campi dell'anteprima (data-cambio): il nucleo li gira qui
    const cambi = {
        'file-numbers': (el, e) => {
            if (e.type !== 'change') return;
            const files = [...el.files];
            el.value = '';
            leggiFile(files);
        },
        'imp-unisci': (el, e) => {
            if (e.type !== 'change') return;
            const it = T.importazioni[+el.dataset.i];
            if (el.value) it.unisci[el.dataset.att] = el.value; else delete it.unisci[el.dataset.att];
            T.mantieniScroll = true; disegna();
        },
        'imp-paziente': (el, e) => {
            if (e.type !== 'change') return;
            T.importazioni[+el.dataset.i].pazienteId = el.value;
            proponiUnione(T.importazioni[+el.dataset.i]);
            T.mantieniScroll = true; disegna();
        },
        'imp-nome': (el) => {
            T.importazioni[+el.dataset.i].nome = el.value;
        },
        'imp-imp': (el, e) => {
            if (e.type !== 'change') return;
            const it = T.importazioni[+el.dataset.i];
            const st = it && it.impost[el.dataset.att];
            if (!st) return;
            const campo = el.dataset.campo;
            st[campo] = ['prove', 'tdSeconds', 'soglia', 'sedute'].includes(campo) ? (parseInt(el.value, 10) || null) : el.value;
            TiceImport.imposta(it.pk, el.dataset.att, st);
            if (st.prove) it.conferme[el.dataset.att] = st.prove; else delete it.conferme[el.dataset.att];
            T.mantieniScroll = true; disegna();
        },
        'imp-prove': (el, e) => {
            if (e.type !== 'change') return;
            const it = T.importazioni[+el.dataset.i];
            const n = parseInt(el.value, 10);
            if (n > 0) it.conferme[el.dataset.att] = n;
            T.mantieniScroll = true; disegna();
        }
    };

    TiceHome.estendi({
        viste: { import: vistaImport },
        azioni: {
            importa: async (b) => { await importaUno(+b.dataset.i); disegna(); },
            'importa-tutti': async () => {
                for (let i = 0; i < T.importazioni.length; i++) {
                    if (T.importazioni[i].pk && !T.importazioni[i].fatto) await importaUno(i);
                }
                disegna();
            }
        },
        cambi
    });
})();
