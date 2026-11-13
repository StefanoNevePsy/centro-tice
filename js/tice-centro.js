/**
 * Centro TICE — schermate del collegamento con il Drive del centro:
 * accesso con Google, chiave del centro, sincronizzazione, persone e accessi,
 * versioni precedenti di un bambino, materiali condivisi.
 *
 * Si aggancia alla presa dati (tice-home.js) e usa il motore di tice-sync.js.
 * Se tice-config.js non indica un custode, non mostra niente: l'app resta
 * solo sul dispositivo.
 */
(function () {
    'use strict';
    const Y = window.TiceSync, C = window.TiceCifra;
    if (!Y || !window.TiceHome) return;
    const { h, grezzo, icona, foglio, conferma, avviso, barra, vai, paz, pazienti, formatoData, T } = TiceHome.strumenti;
    const S = Y.S;
    const io = () => S.io || {};
    const admin = () => !!(S.io && S.io.permessi && S.io.permessi.gestisciAccessi);
    const RUOLI = { admin: 'Amministratore', professionista: 'Professionista', tirocinante: 'Tirocinante' };
    const dataOra = (iso) => iso ? new Date(iso).toLocaleString('it-IT', Orario.opzioniOra({ day: 'numeric', month: 'short', year: 'numeric' })) : '';

    // Corsia veloce (Firestore): esiste solo se configurata
    const veloce = () => (window.TiceVeloce && TiceVeloce.app) || null;
    function rigaVeloce() {
        const v = veloce();
        if (!v) return '';
        const s = v.stato();
        return h`<div class="scheda imbottita" style="margin-top:10px">
            <b>${icona('bolt')} Corsia veloce: ${s.attiva ? 'attiva' : 'spenta'}${!s.attiva && s.motivo ? ` (${s.motivo})` : ''}</b>
            <p class="sotto piccolo">${s.attiva ? 'Le modifiche dei colleghi arrivano in tempo reale. Il custode resta la copia sicura e controlla tutto.' : 'L\'app funziona come sempre, attraverso il custode.'}</p>
            ${!s.attiva && (s.serveAccesso || s.rete || /riprova|limite/.test(s.motivo || '')) ? h`<button class="bt piccolo" data-a="attiva-veloce">${icona('bolt')} ${s.serveAccesso ? 'Attiva la corsia veloce' : 'Riprova'}</button>` : ''}
        </div>`;
    }
    function richiesteVeloci() {
        const v = veloce();
        const l = v ? v.richieste() : [];
        if (!l.length) return '';
        return h`<h3>Richieste di chiave in arrivo</h3><div class="scheda">${l.map((r) => h`<div class="riga" style="cursor:default">
            <span class="corpo"><span class="t1">${r.email} · ${r.nome}</span><span class="t2">Codice di verifica: <b>${v.formatoCodice(r.codice)}</b> (deve essere uguale a quello sul dispositivo nuovo)</span></span>
            <button class="bt piccolo primario" data-a="consegna-veloce" data-id="${r.id}">Consegna</button></div>`)}</div>`;
    }
    function codiceAttesa() {
        const v = veloce(), s = v && v.stato();
        return s && s.codice ? h`<p class="sotto">Codice di verifica: <b>${v.formatoCodice(s.codice)}</b>. Se l'amministratore te lo chiede, leggiglielo.</p>` : '';
    }

    // =====================================================================
    // Agganci nella presa dati
    // =====================================================================
    function chip() {
        if (!Y.attivo()) return '';
        let stato = 'ok', testo = '';
        if (!navigator.onLine) { stato = 'spento'; testo = 'Offline'; }
        else if (S.fase === 'fuori') { stato = 'spento'; testo = 'Accedi'; }
        else if (S.fase === 'chiave') { stato = 'attesa'; testo = 'Chiave'; }
        else if (S.fase === 'attesa') { stato = 'attesa'; testo = 'In attesa'; }
        else if (S.lavoro) { stato = 'lavoro'; }
        else if (S.errore) { stato = 'errore'; }
        else if (S.coda.size) { stato = 'attesa'; testo = String(S.coda.size); }
        return h`<button class="ib tice-stato" data-a="vai-account" data-stato="${stato}" aria-label="Collegamento con il centro" title="Collegamento con il centro">
            <i class="pallino"></i>${testo ? h`<span>${testo}</span>` : icona('cloud')}</button>`;
    }

    // Con più aule: su quale si lavora (elenco dei bambini, nuovi bambini, turni)
    function sceltaAula() {
        if (!Y.conAule || !Y.conAule()) return '';
        const aule = Y.aule(), ids = Object.keys(aule);
        if (ids.length < 2) return '';
        const a = Y.aulaAttiva();
        return h`<button type="button" class="aula-scelta" data-a="scegli-aula">${icona('school')}<span>${tutteLeAule() ? h`<b>Tutte le aule</b> <small class="sotto">· nuovi e turni: ${(aule[a] || {}).nome || a}</small>` : h`Aula: <b>${(aule[a] || {}).nome || a}</b>`}</span>${icona('chevron-down')}</button>`;
    }
    // nell'elenco si possono vedere i bambini di tutte le proprie aule insieme (nuovi bambini e turni restano dell'aula scelta)
    const tutteLeAule = () => { try { return localStorage.getItem('tice_aula_tutte') === '1' && Object.keys(Y.aule()).length > 1; } catch (e) { return false; } };
    async function scegliAula() {
        const aule = Y.aule(), a = Y.aulaAttiva();
        const r = await foglio(h`<h2>Su quale aula lavori?</h2><p class="sotto">Bambini, nuovi bambini e turni sono quelli dell'aula scelta. Vale per questo dispositivo.</p>
            <div class="opzioni">${Object.keys(aule).sort((x, y) => aule[x].nome.localeCompare(aule[y].nome, 'it')).map((k) => h`<button class="opzione ${k === a ? 'scelta' : ''}" data-foglio="${'a:' + k}">${icona('school')}<span class="corpo">${aule[k].nome}<small>${RUOLI[aule[k].ruolo] || aule[k].ruolo}</small></span>${k === a ? icona('check') : ''}</button>`)}</div>
            <label class="spunta-riga" style="margin-top:10px"><input type="checkbox" data-tutte ${tutteLeAule() ? grezzo('checked') : ''}> <span><b>Nell'elenco mostra i bambini di tutte le mie aule</b><br><span class="sotto piccolo">Accanto a ogni nome compare la sua aula.</span></span></label>
            <div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`, {
            dopo: (f) => f.querySelector('[data-tutte]').addEventListener('change', (e) => { try { localStorage.setItem('tice_aula_tutte', e.target.checked ? '1' : '0'); } catch (x) { /* niente */ } TiceHome.ridisegna(); }) });
        if (!r || r.indexOf('a:') !== 0) { TiceHome.ridisegna(); return; }
        Y.impostaAula(r.slice(2));
        aggiornaRuolo();
        TiceHome.ridisegna();
    }
    function banner() {
        if (!Y.attivo()) return '';
        return h`${sceltaAula()}${bannerStato()}`;
    }
    function bannerStato() {
        if (S.fase === 'fuori') {
            return h`<div class="scheda imbottita" style="margin-bottom:12px">
                <b>${icona('cloud')} Collega l'app al Drive del centro</b>
                <p class="sotto"><a href="privacy.html" target="_blank" rel="noopener">Informativa privacy</a></p>
                <p class="sotto">Con il tuo account Google vedi i bambini che ti sono assegnati e le sedute registrate da tutti. Senza accesso l'app funziona solo su questo dispositivo.</p>
                ${S.negato ? h`<div class="banda">${icona('triangle-exclamation')}<div>${S.negato}</div></div>` : ''}
                ${window.TICE_CONFIG.dev ? h`<form data-a-form="accesso-dev" style="display:flex;gap:8px;flex-wrap:wrap">
                    <input class="campo-in" name="email" type="email" placeholder="email (prova locale)" required style="flex:1;min-width:180px">
                    <button class="bt primario">Entra</button></form>` : h`<div id="tice-gis" style="min-height:44px"></div>`}
            </div>`;
        }
        if (S.fase === 'attesa') {
            return h`<div class="scheda imbottita" style="margin-bottom:12px">
                <b>${icona('hourglass-half')} Questo dispositivo aspetta la chiave del centro</b>
                <p class="sotto">${io().cifratura
                    ? 'Non devi inserire niente: la riceve da solo appena un amministratore apre l\'app. Intanto puoi lavorare sui bambini di questo dispositivo.'
                    : 'Un amministratore deve ancora creare la chiave del centro.'}</p>
                ${codiceAttesa()}
                <button class="bt piccolo" data-a="controlla-chiave">${icona('rotate')} Controlla adesso</button>
            </div>`;
        }
        if (S.fase === 'chiave') {
            const serveCrearla = !io().cifratura;
            return h`<div class="scheda imbottita" style="margin-bottom:12px">
                <b>${icona('key')} ${serveCrearla ? 'Manca la chiave del centro' : 'Chiave del centro su questo dispositivo'}</b>
                <p class="sotto">${serveCrearla
                    ? 'I dati dei bambini sul Drive sono cifrati con una chiave che conoscono solo gli amministratori. Creala adesso: conservala tu, agli altri dispositivi l\'app la consegna senza mostrarla.'
                    : 'Sei amministratore: inserisci la chiave del centro, oppure aspetta che la consegni l\'app di un altro amministratore.'}</p>
                ${serveCrearla ? h`<button class="bt primario" data-a="crea-chiave">${icona('key')} Crea la chiave del centro</button>`
                    : h`<div class="bottoni"><button class="bt primario" data-a="inserisci-chiave">${icona('key')} Inserisci la chiave</button>
                        <button class="bt" data-a="controlla-chiave">${icona('rotate')} Controlla se è arrivata</button></div>`}
            </div>`;
        }
        if (S.lavoro && S.scaricati && S.scaricati.totale > 1) {
            return h`<div class="banda">${icona('spinner fa-spin')}<div>Scarico i bambini dal Drive del centro: ${S.scaricati.fatti} di ${S.scaricati.totale}…</div></div>`;
        }
        if (S.errore && !S.lavoro) {
            return h`<div class="banda" style="justify-content:space-between">${icona('triangle-exclamation')}<div style="flex:1">${S.errore}</div>
                <button class="bt piccolo" data-a="sincronizza">Riprova</button></div>`;
        }
        return '';
    }

    function pillola(p) {
        if (!Y.attivo() || S.fase === 'fuori') return '';
        if (!Y.condiviso(p.id)) return h`<span class="pill grigia">solo su questo dispositivo</span> `;
        const inf = Y.info(p.id);
        const aulaP = tutteLeAule() && Y.aulaDi(p.id) ? h`<span class="pill grigia">${(Y.aule()[Y.aulaDi(p.id)] || {}).nome || ''}</span> ` : '';
        if (aulaP) return h`${aulaP}${Y.inAttesa(p.id) ? h`<span class="pill arancio">da inviare</span> ` : ''}`;
        const lucchetto = inf && inf.riservato ? h`<span class="pill grigia" title="Non dell'aula: lo vedono solo ${inf.creatoDa === (Y.io() || {}).email ? 'tu' : (inf.creatoDa || 'chi l\'ha creato')}${inf.condivisi.length ? ' e ' + inf.condivisi.length + (inf.condivisi.length === 1 ? ' persona' : ' persone') : ''}">${icona('lock')} non dell'aula</span> ` : '';
        if (Y.inAttesa(p.id)) return h`${lucchetto}<span class="pill arancio">da inviare</span> `;
        return lucchetto;
    }
    // nel modulo «Nuovo bambino»: dell'aula (predefinito) o solo mio
    function sceltaRiservato() {
        if (!Y.pronto() || !Y.conRiservati() || !Y.puo('creaPazienti')) return '';
        return h`<div class="campo"><span>Chi lo vede</span><div class="scelta">
            <label><input type="radio" name="visibilita" value="aula" checked><span>Dell'aula</span></label>
            <label><input type="radio" name="visibilita" value="mio"><span>${icona('lock')} Solo mio</span></label></div>
            <span class="sotto piccolo">Solo mio: lo vedi tu e le persone con cui lo condividi, non chi vede tutti i bambini dell'aula. Si cambia poi dalle opzioni del bambino.</span></div>`;
    }
    let personeCentro = null;
    async function condivisioneBambino(p) {
        const inf = Y.info(p.id), io = (Y.io() || {}).email;
        const riservato = !!(inf && inf.riservato), creatore = riservato ? inf.creatoDa === io : true;
        if (riservato && !creatore) { avviso('Solo chi l\'ha creato ne cambia la condivisione.'); return; }
        try { personeCentro = await Y.chiama('persone.elenco'); } catch (e) { personeCentro = personeCentro || []; }
        const gia = (inf && inf.condivisi) || [];
        const altre = personeCentro.filter((x) => x.email !== io && x.email !== (inf && inf.creatoDa)).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
        const r = await foglio(h`<form><h2>Chi vede ${p.name}</h2>
            <div class="scelta">
                <label><input type="radio" name="vis" value="aula" ${!riservato ? grezzo('checked') : ''}><span>Dell'aula</span></label>
                <label><input type="radio" name="vis" value="mio" ${riservato ? grezzo('checked') : ''}><span>${icona('lock')} Non dell'aula</span></label></div>
            <p class="sotto piccolo" data-vis-aula ${riservato ? grezzo('hidden') : ''}>Lo vedono gli amministratori, chi vede tutti i bambini e chi ci è assegnato.</p>
            <div data-vis-mio ${riservato ? '' : grezzo('hidden')}>
                <p class="sotto piccolo">Lo vedi tu${riservato && inf.creatoDa !== io ? ' e chi l\'ha creato' : ''}, più le persone che spunti qui. Nessun altro, nemmeno gli amministratori.</p>
                <div class="campo scelte-stampa"><span>Condividi con</span>${altre.length ? altre.map((x) => h`<label class="spunta-riga"><input type="checkbox" name="c" value="${x.email}" ${gia.includes(x.email) ? grezzo('checked') : ''}><span>${x.nome}${x.nome !== x.email ? h` <small class="sotto">${x.email}</small>` : ''}</span></label>`) : h`<p class="sotto piccolo">Nessun'altra persona nel centro.</p>`}</div>
            </div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
            dopo: (f) => f.querySelectorAll('[name=vis]').forEach((x) => x.addEventListener('change', () => {
                f.querySelector('[data-vis-aula]').hidden = x.value !== 'aula'; f.querySelector('[data-vis-mio]').hidden = x.value !== 'mio';
            })),
            invia: (form) => { const fd = new FormData(form); return { mio: fd.get('vis') === 'mio', condivisi: fd.getAll('c') }; }
        });
        if (!r) return;
        try {
            await Y.condivisione(p.id, r.mio, r.condivisi);
            avviso(r.mio ? `${p.name}: non dell'aula${r.condivisi.length ? ', condiviso con ' + r.condivisi.length : ''}` : `${p.name} ora è dell'aula`);
        } catch (e) { avviso(e.message, 'errore'); }
        TiceHome.ridisegna();
    }

    function opzioniBambino(p) {
        if (!Y.pronto()) return '';
        const cond = Y.condiviso(p.id);
        const inf = Y.info(p.id), io = (Y.io() || {}).email;
        const puoCond = cond && Y.conRiservati() && (inf && inf.riservato ? inf.creatoDa === io : true);
        return h`${puoCond ? h`<button class="opzione" data-foglio="est:visibilita">${icona(inf && inf.riservato ? 'lock' : 'users')}<span class="corpo">Chi lo vede<small>${inf && inf.riservato ? 'Non dell\'aula' + (inf.condivisi.length ? ' · condiviso con ' + inf.condivisi.length : ' · solo ' + (inf.creatoDa === io ? 'tu' : inf.creatoDa)) : 'Dell\'aula · puoi renderlo solo tuo'}</small></span></button>` : ''}
            ${!cond && Y.puo('creaPazienti') ? h`<button class="opzione" data-foglio="est:condividi">${icona('cloud-arrow-up')}<span class="corpo">Condividi con il centro<small>Lo vedranno le persone a cui verrà assegnato</small></span></button>` : ''}
            ${cond ? h`<button class="opzione" data-foglio="est:versioni">${icona('clock-rotate-left')}<span class="corpo">Versioni precedenti<small>Per recuperare dati cancellati o modificati per errore</small></span></button>` : ''}
            ${cond && Y.conAule && Y.conAule() && Y.puoIn(p.id, 'gestisciAccessi') && Object.keys(Y.aule()).filter((k) => (Y.aule()[k].permessi || {}).gestisciAccessi).length > 1 ? h`<button class="opzione" data-foglio="est:aula">${icona('school')}<span class="corpo">Sposta in un'altra aula<small>Ora in ${(Y.aule()[Y.aulaDi(p.id)] || {}).nome || 'quest\'aula'}: lo vedranno solo le persone della nuova aula</small></span></button>` : ''}
            ${cond && Y.puoIn(p.id, 'eliminaPazienti') ? h`<button class="opzione" data-foglio="est:archivia">${icona('box-archive')}<span class="corpo">Elimina per tutti (archivia)<small>Sparisce dai dispositivi di tutti; resta sul Drive con le sue versioni e si può recuperare</small></span></button>` : ''}`;
    }
    async function sceltaBambino(k, p) {
        if (k === 'visibilita') return condivisioneBambino(p);
        if (k === 'aula') {
            const aule = Y.aule(), ora = Y.aulaDi(p.id);
            const altre = Object.keys(aule).filter((x) => x !== ora && (aule[x].permessi || {}).gestisciAccessi);
            const r = await foglio(h`<h2>Sposta ${p.name}</h2><p class="sotto">Le persone che non fanno parte della nuova aula non lo vedranno più dalla prossima sincronizzazione; le sedute e il programma restano com'erano.</p>
                <div class="opzioni">${altre.map((x) => h`<button class="opzione" data-foglio="${'a:' + x}">${icona('school')}<span class="corpo">${aule[x].nome}</span>${icona('arrow-right')}</button>`)}</div>
                <div class="bottoni"><button class="bt" data-foglio="chiudi">Annulla</button></div>`);
            if (!r || r.indexOf('a:') !== 0) return;
            try { await Y.spostaAula(p.id, r.slice(2)); avviso(`${p.name} ora è in ${aule[r.slice(2)].nome}`); }
            catch (e) { avviso(e.message, 'errore'); }
            vai('bambini');
            return;
        }
        if (k === 'condividi') {
            try { await Y.condividi(p.id); avviso(`${p.name} ora è sul Drive del centro`); }
            catch (e) { avviso(e.message, 'errore'); }
            TiceHome.ridisegna();
        } else if (k === 'versioni') {
            T.versioniDi = p.id;
            vai('versioni');
        } else if (k === 'archivia') {
            if (!await conferma(`Archiviare ${p.name}?`, 'Sparisce dai dispositivi di tutti alla prossima sincronizzazione. Il file resta sul Drive con le versioni precedenti e un amministratore può recuperarlo.', { ok: 'Archivia', pericolo: true })) return;
            try {
                await Y.chiama('paziente.archivia', { id: p.id });
                await Y.sincronizza();
                vai('bambini');
                avviso(`${p.name} archiviato`);
            } catch (e) { avviso(e.message, 'errore'); }
        }
    }

    function opzioniMenu() {
        if (!Y.attivo()) return '';
        return h`<button class="opzione" data-foglio="est:account">${icona('cloud')}<span class="corpo">Account e sincronizzazione</span></button>
            ${Y.pronto() ? h`<button class="opzione" data-foglio="est:materiali">${icona('layer-group')}<span class="corpo">Materiali del centro<small>Set condivisi tra le professioniste</small></span></button>` : ''}
            ${admin() ? h`<button class="opzione" data-foglio="est:persone">${icona('users')}<span class="corpo">Persone e accessi</span></button>` : ''}`;
    }
    function sceltaMenu(k) {
        if (k === 'account') vai('account');
        else if (k === 'materiali') vai('materiali');
        else if (k === 'persone') vai('persone');
    }

    async function nuovoBambino(p, opz) {
        if (!Y.pronto() || !Y.puo('creaPazienti')) return;
        try { await Y.condividi(p.id, opz); } catch (e) { avviso('Salvato sul dispositivo; invio al centro non riuscito: ' + e.message, 'errore'); }
    }
    const puoProgrammi = (p) => !Y.attivo() || !Y.condiviso(p.id) || Y.puoIn(p.id, 'programmi');
    // un bambino del centro è dell'aula su cui si lavora; quelli solo su questo dispositivo si vedono sempre
    const nellAula = (p) => !Y.conAule || !Y.conAule() || tutteLeAule() || !Y.condiviso(p.id) || !Y.aulaDi(p.id) || Y.aulaDi(p.id) === Y.aulaAttiva();

    // =====================================================================
    // Versione semplice per le tirocinanti: presa dati, giochi, storico in
    // sola lettura. Niente import, programmi, archivio dei set, impostazioni,
    // condivisioni, export e report esterni.
    // =====================================================================
    const tirocinante = () => Y.attivo() && S.fase !== 'fuori' && Y.ruolo() === 'tirocinante';
    const VIETATE = ['openLibrary', 'openSettings', 'openFirebaseSettings', 'openActivityLayout', 'createNewPatient',
        'renamePatient', 'editPatientCategory', 'deletePatient', 'deleteSession', 'editSession', 'startPatientPhotoUpload',
        'openThresholdEditor', 'addCriterionOverride', 'generateAIReport', 'openReportHistoryStandalone', 'openReportHistory',
        'exportPatientExcel', 'quickSharePatientDirect', 'offlineSharePatient', 'openQuickShare', 'openP2PSync', 'openOfflineShare',
        'openDailyNoteEditor', 'deleteDailyNote', 'openSessionNoteEditor', 'toggleOutlierDay', 'openDayTagPicker', 'setDayTag',
        'exportAllSets', 'importSets', 'createEmptySet', 'openGeminiGenerator'];
    function limitaApp() {
        VIETATE.forEach((nome) => {
            const f = window[nome];
            if (typeof f !== 'function' || f._tice) return;
            const g = function () {
                if (tirocinante()) { avviso('Non disponibile nella versione per le tirocinanti.'); return undefined; }
                return f.apply(this, arguments);
            };
            g._tice = true;
            window[nome] = g;
        });
    }
    function aggiornaRuolo() { document.body.classList.toggle('tice-tirocinante', tirocinante()); }

    function dopo(vista, r) {
        const gis = r.querySelector('#tice-gis');
        // il contenitore resta lo stesso fra un ridisegno e l'altro (morph): il pulsante si monta e il gestore si attacca una volta sola
        if (gis && !gis._montato) { gis._montato = true; Y.Auth.pulsante(gis).catch((e) => { gis._montato = false; gis.innerHTML = String(h`<p class="sotto">${e.message}</p>`); }); }
        const f = r.querySelector('[data-a-form="accesso-dev"]');
        if (f && !f._accessoDev) { f._accessoDev = true; f.addEventListener('submit', (e) => { e.preventDefault(); Y.Auth.accessoDev(f.email.value); }); }
    }

    // =====================================================================
    // Chiave del centro
    // =====================================================================
    function scaricaTesto(nome, testo) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([testo], { type: 'text/plain;charset=utf-8' }));
        a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function testoChiave(frase, cfg) {
        return `CHIAVE DEL CENTRO TICE — Quaderno digitale\n\n    ${frase}\n\n` +
            `Dati tecnici (non segreti, servono ad aprire i file anche senza _config/cifratura.json):\n` +
            `    identificativo ${cfg.kid} · PBKDF2-SHA256 ${cfg.kdf.iterazioni} iterazioni · sale ${cfg.kdf.sale}\n\n` +
            `Serve ad aprire i dati dei bambini salvati sul Drive del centro.\n` +
            `- La conoscono solo gli amministratori: agli altri dispositivi l'app la consegna senza mostrarla.\n` +
            `- Senza questa chiave i dati NON si possono recuperare: nessuno la conosce oltre al centro,\n  nemmeno Google o gli amministratori del Drive.\n` +
            `- Per aprire un file senza l'app: strumenti/apri-dati.html (anche offline) oppure tools/decifra_tice.py.\n` +
            `- Conservala in un gestore di password e su carta in un luogo chiuso. Non mandarla per email o chat.\n\n` +
            `Creata il ${new Date().toLocaleDateString('it-IT')} da ${io().email || ''}.\n`;
    }
    // Mostra una frase nuova da conservare; conferma riscrivendo l'ultimo gruppo
    function foglioFrase(frase, cfg, { titolo, intro, bottone }) {
        return foglio(h`<form><h2>${icona('key')} ${titolo}</h2>
            <p class="sotto">${intro}</p>
            <div class="chiave-grande" aria-label="Chiave del centro">${frase}</div>
            <div class="bottoni" style="margin-top:8px">
                <button type="button" class="bt" data-copia>${icona('copy')} Copia</button>
                <button type="button" class="bt" data-scarica>${icona('download')} Scarica</button>
                <button type="button" class="bt" data-stampa>${icona('print')} Stampa</button>
            </div>
            <ul class="sotto piccolo" style="padding-left:18px">
                <li>Mettila in un gestore di password e su carta in un luogo chiuso. Il file scaricato serve anche ad aprire i dati senza l'app.</li>
                <li>La conoscono solo gli amministratori. Agli altri dispositivi l'app la consegna da sola, senza mostrarla.</li>
                <li>Se si perdono tutte le copie, i dati sul Drive non si recuperano più.</li>
            </ul>
            <label class="campo"><span>Per conferma, riscrivi l'ultimo gruppo (${'•'.repeat(5)})</span><input name="conferma" required autocomplete="off" maxlength="5" style="text-transform:uppercase;font-family:monospace;letter-spacing:2px"></label>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${bottone}</button></div></form>`,
        {
            invia: (f) => {
                const v = C.normalizzaFrase(frase.slice(0, -5) + f.conferma.value);
                if (v !== frase) { f.conferma.setCustomValidity('Non corrisponde'); f.conferma.reportValidity(); f.conferma.setCustomValidity(''); return undefined; }
                return true;
            },
            dopo: (f) => {
                f.querySelector('[data-copia]').onclick = () => navigator.clipboard && navigator.clipboard.writeText(frase).then(() => avviso('Chiave copiata'));
                f.querySelector('[data-scarica]').onclick = () => scaricaTesto('chiave-centro-tice-' + cfg.kid + '.txt', testoChiave(frase, cfg));
                f.querySelector('[data-stampa]').onclick = () => {
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write('<pre style="font:16px/1.5 monospace;padding:24px;white-space:pre-wrap">' + testoChiave(frase, cfg).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>');
                    w.document.close(); w.print();
                };
            }
        });
    }
    async function creaChiave() {
        const frase = C.generaFrase();
        avviso('Preparazione della chiave…');
        const preparata = await C.nuovaConfigurazione(frase, true);
        const r = await foglioFrase(frase, preparata.cfg, { titolo: 'La chiave del centro', bottone: 'Crea la chiave',
            intro: 'Questa è la chiave che apre i dati dei bambini. Conservala adesso: su questo dispositivo potrai rivederla, ma se lo perdi resta solo la tua copia.' });
        if (!r) return;
        try {
            await Y.creaChiave(frase, preparata);
            avviso('Chiave del centro creata');
        } catch (e) { avviso(e.message, 'errore'); }
        TiceHome.ridisegna();
    }
    async function cambiaChiave() {
        const ok = await conferma('Cambiare la chiave del centro?',
            'Serve quando qualcuno potrebbe averla conservata (per esempio una persona che non collabora più). Tutti i bambini vengono cifrati con una chiave nuova; i dispositivi delle persone abilitate la ricevono da soli, quelli tolti no. La chiave vecchia apre ancora le versioni precedenti al cambio: conservala. Tieni l\'app aperta finché non finisce.',
            { ok: 'Continua' });
        if (!ok) return;
        const frase = C.generaFrase();
        avviso('Preparazione della chiave…');
        const preparata = await C.nuovaConfigurazione(frase, true);
        const r = await foglioFrase(frase, preparata.cfg, { titolo: 'Nuova chiave del centro', bottone: 'Cambia la chiave',
            intro: 'Questa sostituisce la chiave attuale. Conservala come la precedente, e tieni anche la vecchia: serve ad aprire le versioni salvate prima del cambio.' });
        if (!r) return;
        try {
            T.lavoroChiave = 'Cambio della chiave…'; TiceHome.ridisegna();
            const esito = await Y.cambiaChiave(frase, preparata, (i, n) => { T.lavoroChiave = `Ricifratura dei bambini: ${i} di ${n}…`; TiceHome.ridisegna(); });
            avviso(`Chiave cambiata: ${esito.bambini} bambini ricifrati`);
        } catch (e) { avviso('Cambio non completato: ' + e.message + '. Riprova: riprende da dove si è fermato.', 'errore'); }
        T.lavoroChiave = null;
        TiceHome.ridisegna();
    }
    async function mostraChiave() {
        const frase = await Y.mostraFrase();
        if (!frase) { avviso('Su questo dispositivo la chiave è arrivata già pronta: la frase non c\'è. Inseriscila una volta per poterla rivedere qui.', 'errore'); return; }
        const kid = S.cfg && S.cfg.kid;
        await foglio(h`<h2>${icona('key')} Chiave del centro</h2>
            <div class="chiave-grande">${frase}</div>
            <p class="sotto piccolo">Identificativo ${kid}. Serve agli amministratori e per aprire i file senza l'app: non darla a professioniste e tirocinanti (la ricevono dall'app) e non mandarla per email o chat.</p>
            <div class="bottoni"><button class="bt" data-foglio="scarica">${icona('download')} Scarica</button><button class="bt primario" data-foglio="chiudi">Chiudi</button></div>`)
            .then((v) => { if (v === 'scarica') scaricaTesto('chiave-centro-tice-' + kid + '.txt', testoChiave(frase, S.cfg)); });
    }
    async function inserisciChiave(b, kid) {
        const r = await foglio(h`<form><h2>${icona('key')} ${kid ? 'Chiave precedente' : 'Chiave del centro'}</h2>
            <p class="sotto">${kid ? `Questa versione è cifrata con la chiave ${kid}, sostituita in seguito. Inserisci quella frase: resta su questo dispositivo per le versioni vecchie.`
                : '25 caratteri, anche senza trattini. Si inserisce una volta su questo dispositivo.'}</p>
            <label class="campo"><input name="frase" required autocomplete="off" autofocus placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" style="font-family:monospace;letter-spacing:1px;text-transform:uppercase"></label>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Apri</button></div></form>`);
        if (!r) return;
        try {
            avviso('Controllo della chiave…');
            await Y.inserisciChiave(r.frase, kid);
            avviso(kid ? 'Chiave precedente aggiunta' : 'Chiave corretta: sincronizzazione in corso');
        } catch (e) { avviso(e.message, 'errore'); }
        TiceHome.ridisegna();
    }

    // =====================================================================
    // Velocità del custode
    // =====================================================================
    const secondi = (ms) => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1).replace('.', ',') + ' s';
    function giudizioVelocita(ms) {
        return ms < 1000 ? ['Veloce', 'verde'] : ms < 2500 ? ['Nella norma', ''] : ['Lento', 'arancio'];
    }
    function rigaVelocita(titolo, r, vuoto) {
        if (!r) return h`<tr><td>${titolo}</td><td class="num sotto">${vuoto}</td></tr>`;
        const [g, colore] = giudizioVelocita(r.medio);
        return h`<tr><td>${titolo}<br><span class="sotto piccolo">ultime ${r.n} ${r.n === 1 ? 'volta' : 'volte'}</span></td>
            <td class="num"><b>${secondi(r.medio)}</b> <span class="pill ${colore}">${g}</span><br>
            <span class="sotto piccolo">tipico ${secondi(r.mediano)}${r.custode !== null ? h` · custode ${secondi(r.custode)} · rete e avvio ${secondi(r.rete)}` : ''}</span></td></tr>`;
    }
    // Dove e' andato il tempo dentro il custode, per gli ultimi salvataggi: da mandare a chi cura l'app
    function dettagliVelocita() {
        const l = Y.velocita.ultime('salvataggio', 6).filter((e) => e.fasi);
        if (!l.length) return h`<p class="sotto piccolo">Nessun dettaglio ancora: compare dopo i prossimi salvataggi (serve il custode aggiornato).</p>`;
        const ora = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return h`${l.map((e) => { const f = e.fasi; return h`<div class="scheda imbottita" style="margin-top:6px">
            <b>${ora(e.t)}</b> · totale ${secondi(e.tot)}${e.int !== null ? h` · custode ${secondi(e.int)}` : ''}<br>
            <span class="sotto piccolo">attesa del lucchetto ${secondi(f.attesaLock)} · letture ${secondi(f.letture)} (${f.nLetture}) · scritture ${secondi(f.scritture)} (${f.nScritture}) · cache ${secondi(f.cache)} · altro ${secondi(f.altro)} · chiamate a Drive ${f.nDrive}</span>
            ${f.file.length ? h`<br><span class="sotto piccolo">file più lenti: ${f.file.join(' · ')}</span>` : ''}
        </div>`; })}`;
    }
    function riquadroVelocita() {
        const c = Y.velocita.riepilogo('controllo'), v = Y.velocita.riepilogo('salvataggio'), m = T.velMisura;
        return h`<div class="scheda imbottita" style="margin-top:10px">
            <b>${icona('gauge-high')} Velocità del custode</b>
            <table class="tabella" style="margin-top:6px"><tbody>
                ${rigaVelocita('Controllo novità', c, 'ancora nessuna misura')}
                ${rigaVelocita('Salvataggio', v, 'ancora nessun salvataggio')}
            </tbody></table>
            <p class="sotto piccolo">Il «controllo novità» parte da solo ogni pochi secondi per vedere se qualcuno ha cambiato qualcosa. Il tempo totale è quello che aspetti tu: una parte è il lavoro del custode, il resto è la strada fino a Google e l'avvio del suo servizio. Se il tempo è alto ma la parte del custode è bassa, il rallentamento non dipende dai dati.</p>
            ${m ? h`<p class="sotto">${m.length ? h`Ultimi 3 controlli: <b>${m.map((e) => secondi(e.tot)).join(' · ')}</b>${m.every((e) => e.int !== null) ? h` (lavoro del custode: ${m.map((e) => secondi(e.int)).join(' · ')})` : ''}` : 'Nessuna misura riuscita.'}</p>` : ''}
            ${T.velErrore ? h`<p class="sotto">${icona('triangle-exclamation')} ${T.velErrore}</p>` : ''}
            <details data-morph="velocita-dettagli" style="margin:8px 0"><summary>Dettagli</summary>
                <p class="sotto piccolo">Ultimi salvataggi, dentro il custode: tra parentesi quante operazioni. Se vuoi farli controllare, copia queste righe.</p>
                ${dettagliVelocita()}
            </details>
            <button class="bt largo" data-a="misura-velocita" ${T.velLavoro ? grezzo('disabled') : ''}>${icona(T.velLavoro ? 'spinner fa-spin' : 'gauge-high')} ${T.velLavoro ? 'Misuro…' : 'Misura ora'}</button>
        </div>`;
    }

    // =====================================================================
    // Account
    // =====================================================================
    function vistaAccount() {
        const u = Y.Auth.utente();
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Collegamento con il centro' })}
            <main class="tice-main">
                ${banner()}
                ${u ? h`<div class="scheda imbottita">
                    <b>${io().nome || u.nome}</b> <span class="sotto">${u.email}</span><br>
                    <span class="pill">${RUOLI[io().ruolo] || 'accesso da verificare'}</span>
                    ${io().scadenza ? h` <span class="pill arancio">fino al ${formatoData(io().scadenza, true)}</span>` : ''}
                    ${io().proprietario ? h` <span class="pill verde">proprietario del custode</span>` : ''}
                </div>` : ''}
                ${Y.pronto() ? h`<div class="scheda imbottita" style="margin-top:10px">
                    <table class="tabella"><tbody>
                        <tr><td>Bambini del centro su questo dispositivo</td><td class="num"><b>${S.condivisi.size}</b></td></tr>
                        <tr><td>Da inviare</td><td class="num"><b>${S.coda.size}</b></td></tr>
                        <tr><td>Ultima sincronizzazione</td><td class="num">${S.ultimo ? dataOra(S.ultimo) : '—'}</td></tr>
                    </tbody></table>
                    ${S.errore ? h`<p class="sotto">${icona('triangle-exclamation')} ${S.errore}</p>` : ''}
                    <button class="bt primario largo" style="margin-top:10px" data-a="sincronizza" ${S.lavoro ? grezzo('disabled') : ''}>${icona('rotate')} ${S.lavoro ? 'Sincronizzazione…' : 'Sincronizza ora'}</button>
                </div>` : ''}
                ${u ? rigaVeloce() : ''}
                ${Y.pronto() ? riquadroVelocita() : ''}
                ${!u ? '' : admin() ? h`<div class="scheda imbottita" style="margin-top:10px">
                    <b>${icona('key')} Chiave del centro</b> <span class="sotto piccolo">${S.cfg ? S.cfg.kid : ''}</span>
                    <p class="sotto">La conoscono solo gli amministratori. Ai dispositivi delle persone abilitate l'app la consegna da sola, senza mostrarla: chi perde l'accesso non ha niente da conservare.</p>
                    ${T.lavoroChiave ? h`<p class="sotto">${icona('spinner fa-spin')} ${T.lavoroChiave}</p>` : ''}
                    <button class="bt primario largo" data-a="consegna-chiavi" style="margin-bottom:8px" ${T.consegnando ? grezzo('disabled') : ''}>${icona(T.consegnando ? 'spinner fa-spin' : 'paper-plane')} ${T.consegnando ? 'Controllo…' : 'Consegna la chiave a chi la aspetta'}${io().inAttesa > 0 ? h` <span class="pill arancio">${io().inAttesa}</span>` : ''}</button>
                    <p class="sotto piccolo">Quando una persona entra per la prima volta (o da un dispositivo nuovo), toccalo: la riceve subito. Senza toccarlo arriva comunque da sola, ma può volerci qualche minuto.</p>
                    <div class="bottoni">
                        <button class="bt" data-a="mostra-chiave">${icona('eye')} Mostra la chiave</button>
                        <button class="bt" data-a="vai-dispositivi">${icona('mobile-screen')} Dispositivi</button>
                        <button class="bt pericolo" data-a="cambia-chiave" ${T.lavoroChiave ? grezzo('disabled') : ''}>${icona('arrows-rotate')} Cambia la chiave</button>
                    </div>
                </div>` : !Y.pronto() ? '' : h`<div class="scheda imbottita" style="margin-top:10px">
                    <b>${icona('shield-halved')} Dati protetti</b>
                    <p class="sotto">Questo dispositivo ha ricevuto la chiave del centro e la usa senza mostrarla. I dati dei bambini sul Drive sono cifrati.</p>
                </div>`}
                <div class="bottoni" style="margin-top:14px">
                    ${admin() ? h`<button class="bt" data-a="vai-persone">${icona('users')} Persone e accessi</button>` : ''}
                    ${Y.pronto() ? h`<button class="bt" data-a="vai-materiali">${icona('layer-group')} Materiali del centro</button>` : ''}
                    ${u ? h`<button class="bt pericolo" data-a="esci">${icona('right-from-bracket')} Esci</button>` : ''}
                </div>
            </main>`;
    }

    // =====================================================================
    // Persone e accessi (admin)
    // =====================================================================
    function nomeBambino(pid) {
        const e = S.etichette[pid];
        const l = paz(pid);
        return (e && e.nome) || (l && l.name) || pid;
    }
    // le aule degli accessi (custode senza aule: nessuna) e il ruolo di una persona in ciascuna
    const auleAcc = (a) => (a && a.aule) || null;
    const ruoliDi = (u) => (u.aule ? u.aule : { principale: u.ruolo });
    function descriviRuoli(a, u) {
        const aule = auleAcc(a), r = ruoliDi(u);
        if (!aule || Object.keys(aule).length < 2) return RUOLI[u.ruolo] || u.ruolo;
        return Object.keys(r).filter((k) => aule[k]).map((k) => `${aule[k].nome}: ${(RUOLI[r[k]] || r[k]).toLowerCase()}`).join(' · ') + (u.altreAule ? ' · anche in altre aule' : '');
    }
    function vistaPersone() {
        const a = T.accessi;
        if (!a) {
            Y.chiama('accessi.leggi').then((x) => { T.accessi = x; TiceHome.ridisegna(); }).catch((e) => avviso(e.message, 'errore'));
            return h`${barra({ indietro: 'vai-account', titolo: 'Persone e accessi' })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const oggi = new Date().toISOString().slice(0, 10);
        const prop = String(a.proprietario || '').toLowerCase();
        // il proprietario ha una riga a parte: nella sua voce conta solo il nome
        const nomeProp = (a.utenti[prop] && a.utenti[prop].nome) || (prop === String(io().email || '').toLowerCase() ? io().nome : '') || '';
        const persone = Object.keys(a.utenti).filter((e) => e !== prop).sort((x, y) => (a.utenti[x].nome || x).localeCompare(a.utenti[y].nome || y, 'it'));
        const aule = auleAcc(a), proprietario = !!io().proprietario;
        const nAule = aule ? Object.keys(aule).length : 0;
        return h`${barra({ indietro: 'vai-account', titolo: 'Persone e accessi' })}
            <main class="tice-main">
                <p class="sotto">Chi è in elenco entra con il suo account Google (anche Gmail personale) e vede solo i bambini delle sue aule che gli sono assegnati. Togliere l'accesso ha effetto alla richiesta successiva, e i dati del centro spariscono dal suo dispositivo alla prossima sincronizzazione.</p>
                ${aule ? h`<div class="scheda imbottita" style="margin-bottom:12px">
                    <b>${icona('school')} ${proprietario ? 'Aule del centro' : nAule === 1 ? 'La tua aula' : 'Le tue aule'}</b>
                    <p class="sotto">${Object.keys(aule).map((k) => aule[k].nome).join(' · ')}</p>
                    <p class="sotto piccolo">${proprietario ? 'Ogni aula ha i suoi bambini, le sue persone e i suoi turni. Gli amministratori di un\'aula non vedono né modificano niente delle altre; solo tu le vedi tutte.' : 'Gestisci le persone e i bambini di queste aule; le altre aule del centro non sono visibili da qui.'}</p>
                    <div class="bottoni-piccoli" style="display:flex;flex-wrap:wrap;gap:8px">${proprietario ? h`<button class="bt piccolo" data-a="gestisci-aule">${icona('pen')} Aule: crea, rinomina, togli</button>` : ''}
                    ${nAule > 1 ? h`<button class="bt piccolo" data-a="sposta-bambini">${icona('right-left')} Sposta bambini fra aule</button>` : ''}</div>
                </div>` : ''}
                <button class="bt primario largo" data-a="persona" data-email="">${icona('user-plus')} Aggiungi una persona</button>
                <div class="scheda" style="margin-top:12px">
                    ${proprietario || !aule || a.utenti[prop] ? (proprietario
                        ? h`<button class="riga" data-a="nome-proprietario"><span class="corpo"><span class="t1">${nomeProp && nomeProp.toLowerCase() !== prop ? nomeProp : a.proprietario}</span><span class="t2">${nomeProp && nomeProp.toLowerCase() !== prop ? a.proprietario + ' · ' : ''}Amministratore di tutte le aule · proprietario del custode, sempre abilitato</span></span>${icona('pen')}</button>`
                        : h`<div class="riga" style="cursor:default"><span class="corpo"><span class="t1">${nomeProp || a.proprietario}</span><span class="t2">${nomeProp ? a.proprietario + ' · ' : ''}Amministratore di tutte le aule · proprietario del custode, sempre abilitato</span></span></div>`) : ''}
                    ${persone.map((em) => {
                        const u = a.utenti[em];
                        const scaduto = u.scadenza && u.scadenza < oggi;
                        const n = u.pazienti === '*' ? 'tutti i bambini' : `${(u.pazienti || []).length} bambini`;
                        return h`<button class="riga" data-a="persona" data-email="${em}">
                            <span class="corpo"><span class="t1">${u.nome || em}${!u.attivo ? h` <span class="pill grigia">disattivato</span>` : ''}${scaduto ? h` <span class="pill arancio">scaduto</span>` : ''}</span>
                            <span class="t2">${em} · ${descriviRuoli(a, u)} · ${n}${u.scadenza ? ' · fino al ' + formatoData(u.scadenza) : ''}</span></span>${icona('pen')}</button>`;
                    })}
                </div>
            </main>`;
    }
    async function salvaAccessi(nuovi, a) {
        try {
            const corpo = { utenti: nuovi.utenti };
            if (nuovi.aule) corpo.aule = nuovi.aule;
            T.accessi = await Y.chiama('accessi.salva', { accessi: corpo, versioneBase: a.version || 0 });
            T.accessi.proprietario = a.proprietario;
            if (io().proprietario && nuovi.aule) T.accessi.aule = T.accessi.aule || nuovi.aule;
            avviso('Accessi salvati');
            // i nomi nuovi si vedono subito ovunque (cartella, diario, turni)
            await Y.aggiornaPersone();
            // le aule e i ruoli di chi usa l'app possono essere cambiati
            Y.sincronizza().catch(() => {});
            return true;
        } catch (e) {
            avviso(e.message, 'errore');
            if (e.codice === 'conflitto') T.accessi = null;
            return false;
        } finally { TiceHome.ridisegna(); }
    }
    async function spostaBambini() {
        const aule = auleAcc(T.accessi) || {};
        const ids = Object.keys(aule);
        const bambini = Object.keys(S.etichette).filter((pid) => aule[Y.S.aulaDi[pid]]).sort((x, y) => nomeBambino(x).localeCompare(nomeBambino(y), 'it'));
        const r = await foglio(h`<form><h2>Sposta bambini fra aule</h2>
            <p class="sotto piccolo">Chi non fa parte della nuova aula non li vedrà più dalla prossima sincronizzazione; sedute e programma restano com'erano.</p>
            <label class="campo"><span>Nell'aula</span><select name="aula" class="campo-in" required>${ids.map((k) => h`<option value="${k}">${aule[k].nome}</option>`)}</select></label>
            <div class="opzioni" style="max-height:44vh;overflow-y:auto">${bambini.map((pid) => h`<label class="opzione"><input type="checkbox" name="p" value="${pid}"><span class="corpo">${nomeBambino(pid)}<small>ora in ${aule[Y.S.aulaDi[pid]].nome}</small></span></label>`)}</div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Sposta</button></div></form>`,
            { invia: (f) => { const d = new FormData(f); return { aula: d.get('aula'), p: d.getAll('p') }; } });
        if (!r) return;
        const da = r.p.filter((pid) => Y.S.aulaDi[pid] !== r.aula);
        if (!da.length) { avviso('Nessun bambino da spostare.'); return; }
        try { const n = await Y.spostaAule(da, r.aula); avviso(`${n} ${n === 1 ? 'bambino spostato' : 'bambini spostati'} in ${aule[r.aula].nome}`); }
        catch (e) { avviso(e.message, 'errore'); }
        TiceHome.ridisegna();
    }
    async function gestisciAule() {
        const a = T.accessi;
        if (!a || !io().proprietario) return;
        const aule = JSON.parse(JSON.stringify(a.aule || { principale: { nome: 'Centro' } }));
        const ids = Object.keys(aule);
        const quanti = (k) => Object.keys(Y.S.aulaDi || {}).filter((pid) => Y.S.aulaDi[pid] === k).length;
        const r = await foglio(h`<form><h2>Aule del centro</h2>
            <p class="sotto">Ogni aula ha i suoi bambini, le sue persone (con un ruolo per aula) e i suoi turni. I materiali e le modalità restano comuni a tutto il centro.</p>
            ${ids.map((k) => h`<div class="riga-campi" style="align-items:end"><label class="campo"><span>${k === 'principale' ? 'Aula di partenza (i bambini di prima)' : 'Aula'} <small class="sotto">· ${quanti(k)} bambini</small></span><input name="${'n_' + k}" required maxlength="60" value="${aule[k].nome}"></label>
                ${k !== 'principale' ? h`<label class="spunta-riga" style="flex:0 0 auto"><input type="checkbox" name="${'x_' + k}" ${quanti(k) ? grezzo('disabled') : ''}> <span class="sotto piccolo">${quanti(k) ? 'ha bambini' : 'togli'}</span></label>` : ''}</div>`)}
            <label class="campo"><span>Nuova aula</span><input name="nuova" maxlength="60" placeholder="es. Aula Verde, Sede di Monza"></label>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
        if (!r) return;
        ids.forEach((k) => { if (r['x_' + k]) delete aule[k]; else aule[k].nome = String(r['n_' + k] || aule[k].nome).trim(); });
        const nome = String(r.nuova || '').trim();
        if (nome) {
            let id = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'aula';
            while (aule[id]) id += '-2';
            aule[id] = { nome };
        }
        const nuovi = JSON.parse(JSON.stringify(a));
        nuovi.aule = aule;
        // chi era solo in un'aula tolta resta senza aule: gli si toglie quell'aula (e, se non ne ha altre, l'accesso)
        Object.keys(nuovi.utenti).forEach((em) => {
            const u = nuovi.utenti[em], r0 = Object.assign({}, ruoliDi(u));
            Object.keys(r0).forEach((k) => { if (!aule[k]) delete r0[k]; });
            if (!Object.keys(r0).length) delete nuovi.utenti[em]; else u.aule = r0;
        });
        await salvaAccessi(nuovi, a);
    }
    async function persona(email) {
        const a = T.accessi;
        const aule = auleAcc(a);
        const u = email ? a.utenti[email] : { nome: '', ruolo: 'tirocinante', aule: aule ? { [Object.keys(aule)[0]]: 'tirocinante' } : null, pazienti: [], attivo: true, scadenza: null };
        const ruoli = ruoliDi(u);
        // i bambini che si possono assegnare: quelli delle aule visibili qui
        const bambini = Object.keys(S.etichette).filter((pid) => !aule || !Y.S.aulaDi[pid] || aule[Y.S.aulaDi[pid]]).sort((x, y) => nomeBambino(x).localeCompare(nomeBambino(y), 'it'));
        const tutti = u.pazienti === '*';
        const piuAule = aule && Object.keys(aule).length > 1;
        const scegliRuolo = (nome, valore, conNessuno) => h`<select class="campo-in" name="${nome}">${conNessuno ? h`<option value="">— non ne fa parte</option>` : ''}${Object.keys(RUOLI).map((k) => h`<option value="${k}" ${valore === k ? grezzo('selected') : ''}>${RUOLI[k]}</option>`)}</select>`;
        const r = await foglio(h`<form><h2>${email ? u.nome || email : 'Nuova persona'}</h2>
            <label class="campo"><span>Email Google</span><input name="email" type="email" required value="${email || ''}" ${email ? grezzo('readonly') : grezzo('autofocus')}></label>
            <label class="campo"><span>Nome</span><input name="nome" maxlength="60" value="${u.nome || ''}" ${u.altreAule ? grezzo('readonly') : ''}></label>
            ${piuAule ? h`<div class="campo"><span>Ruolo in ogni aula</span>
                ${Object.keys(aule).map((k) => h`<label class="riga-campi" style="align-items:center"><span style="flex:1">${aule[k].nome}</span>${scegliRuolo('aula_' + k, ruoli[k] || '', true)}</label>`)}
                ${u.altreAule ? h`<span class="sotto piccolo">Fa parte anche di altre aule, che non vedi da qui: lì il suo ruolo resta com'è.</span>` : ''}
            </div>` : h`<div class="campo"><span>Ruolo</span><div class="scelta">
                ${Object.keys(RUOLI).map((k) => h`<label><input type="radio" name="ruolo" value="${k}" ${(aule ? ruoli[Object.keys(aule)[0]] : u.ruolo) === k ? grezzo('checked') : ''}><span>${RUOLI[k]}</span></label>`)}
            </div></div>`}
            <span class="sotto piccolo">Tirocinante: registra le sedute e vede lo storico. Professionista: anche programmi e nuovi bambini. Amministratore: tutto, persone comprese${aule ? ', ma solo nelle sue aule' : ''}.</span>
            <div class="campo"><span>Durata dell'accesso</span><div class="scelta">
                <label><input type="radio" name="durata" value="sempre" ${!u.scadenza ? grezzo('checked') : ''}><span>Senza scadenza</span></label>
                <label><input type="radio" name="durata" value="fino" ${u.scadenza ? grezzo('checked') : ''}><span>Con scadenza</span></label></div>
                <label class="campo" data-solo="fino" style="margin-top:8px" ${u.scadenza ? '' : grezzo('hidden')}><span>Fino al (compreso)</span><input name="scadenza" type="date" value="${u.scadenza || ''}"></label>
                <span class="sotto piccolo" data-solo="fino" ${u.scadenza ? '' : grezzo('hidden')}>Il giorno dopo l'accesso si chiude da solo: il custode revoca la chiave ai suoi dispositivi e i dati del centro spariscono da lì, anche senza rete. Prolungando la data, la chiave gli torna in automatico.</span></div>
            <div class="campo"><span>Bambini</span><div class="scelta">
                <label><input type="radio" name="quali" value="tutti" ${tutti ? grezzo('checked') : ''}><span>Tutti${aule ? ' quelli delle sue aule' : ''}</span></label>
                <label><input type="radio" name="quali" value="alcuni" ${!tutti ? grezzo('checked') : ''}><span>Solo alcuni</span></label></div>
                <span class="sotto piccolo" data-solo="tutti" ${tutti ? '' : grezzo('hidden')}>Anche i bambini aggiunti in futuro.</span>
                <div class="opzioni" data-solo="alcuni" style="max-height:30vh;overflow-y:auto;margin-top:8px" ${tutti ? grezzo('hidden') : ''}>
                    ${bambini.length ? bambini.map((pid) => h`<label class="opzione"><input type="checkbox" name="p" value="${pid}" ${!tutti && (u.pazienti || []).includes(pid) ? grezzo('checked') : ''}><span class="corpo">${nomeBambino(pid)}${piuAule && Y.S.aulaDi[pid] && aule[Y.S.aulaDi[pid]] ? h`<small>${aule[Y.S.aulaDi[pid]].nome}</small>` : ''}</span></label>`)
                        : h`<p class="sotto">Nessun bambino sul Drive del centro.</p>`}
                </div></div>
            ${email && !u.altreAule ? h`<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" name="attivo" ${u.attivo !== false ? grezzo('checked') : ''}> Accesso attivo</label>` : ''}
            ${email ? h`<button type="button" class="bt pericolo" data-foglio="togli" style="width:100%;margin-top:6px">${u.altreAule ? 'Togli dalle mie aule' : 'Togli dall\'elenco'}</button>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        {
            dopo: (el) => {
                const mostra = () => {
                    const durata = (el.querySelector('[name=durata]:checked') || {}).value, quali = (el.querySelector('[name=quali]:checked') || {}).value;
                    el.querySelectorAll('[data-solo]').forEach((x) => { x.hidden = x.dataset.solo !== durata && x.dataset.solo !== quali; });
                    const sc = el.querySelector('[name=scadenza]');
                    sc.required = durata === 'fino';
                };
                el.querySelectorAll('[name=durata], [name=quali]').forEach((x) => x.addEventListener('change', mostra));
            },
            invia: (f) => {
                const d = new FormData(f);
                const ra = {};
                if (piuAule) Object.keys(aule).forEach((k) => { const v = d.get('aula_' + k); if (v) ra[k] = v; });
                else if (aule) ra[Object.keys(aule)[0]] = d.get('ruolo');
                if (aule && !Object.keys(ra).length) { avviso('Scegli almeno un\'aula con un ruolo.', 'errore'); return undefined; }
                return { email: d.get('email'), nome: d.get('nome'), ruolo: d.get('ruolo') || Object.values(ra)[0], aule: ra, scadenza: d.get('durata') === 'fino' ? d.get('scadenza') : '',
                    tutti: d.get('quali') === 'tutti', p: d.getAll('p'), attivo: email && !u.altreAule ? !!d.get('attivo') : u.attivo !== false };
            }
        });
        if (!r) return;
        const nuovi = JSON.parse(JSON.stringify(a));
        const em = String(email || r.email).trim().toLowerCase();
        if (r === 'togli') {
            if (!await conferma(`Togliere ${em}?`, u.altreAule ? 'Esce dalle tue aule; nelle altre aule del centro resta com\'è.' : 'Non potrà più entrare; i dati del centro spariranno dal suo dispositivo.', { ok: 'Togli', pericolo: true })) return;
            delete nuovi.utenti[em];
        } else {
            nuovi.utenti[em] = { nome: r.nome.trim(), ruolo: r.ruolo, pazienti: r.tutti ? '*' : r.p, scadenza: r.scadenza || null, attivo: r.attivo };
            if (aule) nuovi.utenti[em].aule = r.aule;
        }
        if (!io().proprietario) delete nuovi.aule;
        const salvato = await salvaAccessi(nuovi, a);
        if (salvato && r !== 'togli' && email) await nomeCambiato(email, u.nome, nuovi.utenti[em] && nuovi.utenti[em].nome);
    }
    // Il proprietario non ha ruolo da modificare: gli si dà solo un nome
    async function nomeProprietario() {
        const a = T.accessi;
        if (!a || !io().proprietario) return;
        const em = String(a.proprietario || io().email || '').toLowerCase();
        const voce = a.utenti[em];
        const attuale = (voce && voce.nome) || (em === String(io().email || '').toLowerCase() ? io().nome : '') || '';
        const r = await foglio(h`<form><h2>Nome del proprietario</h2>
            <label class="campo"><span>Nome</span><input name="nome" maxlength="60" required autofocus value="${attuale && attuale.toLowerCase() !== em ? attuale : ''}"></label>
            <p class="sotto piccolo">Il proprietario è sempre amministratore di tutte le aule. Qui si cambia solo il nome con cui compare.</p>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
            { invia: (f) => ({ nome: String(new FormData(f).get('nome') || '').trim() }) });
        if (!r || !r.nome || r.nome === attuale) return;
        const nuovi = JSON.parse(JSON.stringify(a));
        const tutte = {};
        Object.keys(auleAcc(a) || { principale: 1 }).forEach((k) => { tutte[k] = 'admin'; });
        nuovi.utenti[em] = { nome: r.nome, ruolo: 'admin', aule: tutte, pazienti: '*', scadenza: null, attivo: true };
        if (await salvaAccessi(nuovi, a)) await nomeCambiato(em, attuale && attuale.toLowerCase() !== em ? attuale : '', r.nome);
    }

    // ---------- un nome cambiato in «Persone e accessi» ----------
    // Le sedute e le note nuove ricordano l'email e mostrano il nome attuale; quelle vecchie
    // hanno solo il nome scritto: si sostituisce (con conferma) il nome vecchio con il nuovo.
    const tokenOp = (t) => String(t || '').split('+').map((x) => x.trim()).filter(Boolean);
    /** «Anna + Marta» con Marta → Marta Rossi: solo i nomi uguali per intero. null se non cambia niente. */
    function sostituisciNome(testo, vecchio, nuovo) {
        const l = tokenOp(testo);
        if (!l.includes(vecchio)) return null;
        return l.map((x) => (x === vecchio ? nuovo : x)).join(' + ');
    }
    function correggiPaziente(p, vecchio, nuovo, email, scrivi) {
        let n = 0;
        (p.history || []).forEach((s) => {
            const t = s && sostituisciNome(s.operatore, vecchio, nuovo);
            if (t != null) { n++; if (scrivi) s.operatore = t; }
        });
        (p.diario || []).forEach((d) => {
            if (!d) return;
            let t = sostituisciNome(d.autore, vecchio, nuovo);
            // una nota scritta da lui (non di seduta) porta il suo nome di allora, qualunque fosse
            if (t == null && email && d.email === email && d.tag !== 'seduta' && d.autore && d.autore !== nuovo) t = nuovo;
            if (t != null) { n++; if (scrivi) d.autore = t; }
        });
        return n;
    }
    function correggiBozza(b, vecchio, nuovo) {
        if (!b) return false;
        let c = false;
        const t = sostituisciNome(b.operatore, vecchio, nuovo);
        if (t != null) { b.operatore = t; c = true; }
        Object.keys(b.voci || {}).forEach((k) => { const v = b.voci[k], x = v && sostituisciNome(v.operatore, vecchio, nuovo); if (x != null) { v.operatore = x; c = true; } });
        return c;
    }
    async function nomeCambiato(email, vecchio, nuovo) {
        vecchio = String(vecchio || '').trim(); nuovo = String(nuovo || '').trim();
        email = String(email || '').toLowerCase();
        if (!vecchio || !nuovo || vecchio === nuovo) return;
        // suggerimenti e bozze di questo dispositivo: si aggiornano senza chiedere
        try {
            if (localStorage.getItem('tice_operatore') === vecchio) localStorage.setItem('tice_operatore', nuovo);
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || k.indexOf('tice_bozza_') !== 0) continue;
                if (T.bozza && 'tice_bozza_' + T.bozza.pid === k) continue;
                const b = JSON.parse(localStorage.getItem(k) || 'null');
                if (correggiBozza(b, vecchio, nuovo)) localStorage.setItem(k, JSON.stringify(b));
            }
        } catch (e) { /* solo una comodità */ }
        if (T.bozza && correggiBozza(T.bozza, vecchio, nuovo)) TiceHome.strumenti.salvaBozza();
        const toccati = pazienti().filter((p) => correggiPaziente(p, vecchio, nuovo, email, false) > 0);
        if (!toccati.length) return;
        const q = toccati.length === 1 ? '1 bambino' : toccati.length + ' bambini';
        if (!await conferma(`Aggiornare anche il nome scritto nelle sedute e nelle note già registrate (${q})?`,
            `Dove compare «${vecchio}» come chi ha svolto o come autore, diventa «${nuovo}». Cambia solo il nome scritto: i dati restano gli stessi. Vale per i bambini che vedi su questo dispositivo.`, { ok: 'Aggiorna' })) return;
        let fatti = 0;
        for (const p of toccati) {
            try { correggiPaziente(p, vecchio, nuovo, email, true); await TiceHome.strumenti.salvaPaziente(p); fatti++; }
            catch (e) { avviso(`${p.name}: ${e.message || e}`, 'errore'); }
        }
        avviso(fatti === 1 ? 'Nome aggiornato in 1 bambino' : `Nome aggiornato in ${fatti} bambini`);
        TiceHome.ridisegna();
    }

    // =====================================================================
    // Dispositivi (admin)
    // =====================================================================
    function vistaDispositivi() {
        if (!T.elencoDisp) {
            Y.dispositivi().then((d) => { T.elencoDisp = d; TiceHome.ridisegna(); }).catch((e) => avviso(e.message, 'errore'));
            return h`${barra({ indietro: 'vai-account', titolo: 'Dispositivi' })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const perPersona = {};
        T.elencoDisp.forEach((d) => { (perPersona[d.email] = perPersona[d.email] || []).push(d); });
        return h`${barra({ indietro: 'vai-account', titolo: 'Dispositivi' })}
            <main class="tice-main">
                ${richiesteVeloci()}
                ${veloce() ? h`<label class="sotto" style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" data-a="consegna-manuale" ${localStorage.getItem('tice_consegna_manuale') === '1' ? grezzo('checked') : ''}> Consegna la chiave solo quando tocco «Consegna» (con il codice di verifica)</label>` : ''}
                <p class="sotto">Ogni dispositivo che accede riceve la chiave del centro dall'app di un amministratore, senza vederla. Qui controlli quali sono: se ne vedi uno che non riconosci, toglilo e valuta di cambiare la chiave.</p>
                ${T.elencoDisp.some((d) => !d.abilitato && d.personaAbilitata) ? h`<button class="bt primario largo" data-a="consegna-chiavi" ${T.consegnando ? grezzo('disabled') : ''}>${icona('paper-plane')} Consegna la chiave a chi la aspetta</button>` : ''}
                ${Object.keys(perPersona).sort().map((em) => h`<h3>${em}</h3><div class="scheda">
                    ${perPersona[em].map((d) => h`<div class="riga" style="cursor:default">
                        <span class="corpo"><span class="t1">${d.nome}${!d.personaAbilitata ? h` <span class="pill grigia">persona non abilitata</span>` : ''}</span>
                        <span class="t2">${d.abilitato ? `chiave consegnata${d.abilitatoIl ? ' il ' + dataOra(d.abilitatoIl) : ''}` : 'in attesa della chiave'} · ultimo accesso ${dataOra(d.ultimoAccesso)}</span></span>
                        ${d.abilitato ? h`<span class="pill verde">${icona('check')}</span>` : h`<span class="pill arancio">attesa</span>`}
                        <button class="ib" data-a="togli-dispositivo" data-id="${d.id}" aria-label="Togli il dispositivo">${icona('trash')}</button>
                    </div>`)}
                </div>`)}
                ${!T.elencoDisp.length ? h`<div class="vuoto">Nessun dispositivo registrato.</div>` : ''}
            </main>`;
    }

    // =====================================================================
    // Versioni precedenti
    // =====================================================================
    function vistaVersioni() {
        const pid = T.versioniDi;
        const p = paz(pid);
        if (!T.elencoVersioni || T.elencoVersioni.pid !== pid) {
            Y.versioni(pid).then((v) => { T.elencoVersioni = { pid, v }; TiceHome.ridisegna(); }).catch((e) => avviso(e.message, 'errore'));
            return h`${barra({ indietro: 'vai-seduta', titolo: 'Versioni precedenti', sotto: { testo: p ? p.name : '' } })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const v = T.elencoVersioni.v;
        return h`${barra({ indietro: 'vai-seduta', titolo: 'Versioni precedenti', sotto: { testo: p ? p.name : '' } })}
            <main class="tice-main">
                <p class="sotto">Ogni salvataggio conserva la versione di prima: le ultime 20, più l'ultima di ogni giorno per due mesi. Ripristinare una versione non cancella niente: diventa la versione attuale e quella di adesso resta tra le precedenti.</p>
                <div class="scheda">
                    ${v.length ? v.map((x) => h`<button class="riga" data-a="versione" data-v="${x.version}">
                        <span class="corpo"><span class="t1">${dataOra(x.aggiornato)}</span><span class="t2">versione ${x.version} · ${x.aggiornatoDa || ''}</span></span>${icona('chevron-right')}</button>`)
                        : h`<div class="vuoto">Ancora nessuna versione precedente.</div>`}
                </div>
            </main>`;
    }
    async function versione(b) {
        const pid = T.versioniDi, n = +b.dataset.v;
        let vecchia;
        try { vecchia = await Y.anteprimaVersione(pid, n); }
        catch (e) {
            if (e.senzaChiave && admin()) { await inserisciChiave(null, e.senzaChiave); return; }
            avviso(e.message, 'errore'); return;
        }
        const ora = paz(pid) || {};
        const conta = (p) => (p.history || []).length;
        const ultima = (p) => (p.history || []).reduce((m, s) => (s.date > m ? s.date : m), '');
        const r = await foglio(h`<h2>Versione ${n}</h2>
            <table class="tabella"><thead><tr><th></th><th class="num">Questa versione</th><th class="num">Adesso</th></tr></thead><tbody>
                <tr><td>Nome</td><td class="num">${vecchia.name}</td><td class="num">${ora.name || ''}</td></tr>
                <tr><td>Sedute</td><td class="num">${conta(vecchia)}</td><td class="num">${conta(ora)}</td></tr>
                <tr><td>Ultima seduta</td><td class="num">${formatoData((ultima(vecchia) || '').slice(0, 10))}</td><td class="num">${formatoData((ultima(ora) || '').slice(0, 10))}</td></tr>
                <tr><td>Attività nel programma</td><td class="num">${((vecchia.programma || {}).attivita || []).length}</td><td class="num">${((ora.programma || {}).attivita || []).length}</td></tr>
            </tbody></table>
            <div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button><button class="bt primario" data-foglio="ripristina">Ripristina questa versione</button></div>`);
        if (r !== 'ripristina') return;
        if (!await conferma('Ripristinare la versione ' + n + '?', 'Diventa la versione attuale per tutti. Quella di adesso resta tra le precedenti.', { ok: 'Ripristina' })) return;
        try {
            await Y.ripristina(pid, n);
            T.elencoVersioni = null;
            avviso('Versione ripristinata');
            vai('seduta', pid);
        } catch (e) { avviso(e.message, 'errore'); }
    }

    // =====================================================================
    // Materiali del centro: set condivisi. Immagini e audio viaggiano una volta
    // sola, per impronta (sha256): un set aggiornato scarica solo le novità.
    // =====================================================================
    const setLocali = () => (typeof state !== 'undefined' && state.savedSets) || [];
    async function sha256(b64) {
        const buf = await crypto.subtle.digest('SHA-256', C.daB64(b64));
        return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    // Sostituisce ogni "data:..." con "img:<hash>" e raccoglie i file
    async function perRiferimento(set) {
        const file = {};
        const RE = /^data:((?:image\/(?:png|jpeg|webp|gif))|(?:audio\/(?:mpeg|mp4|webm|ogg|wav|x-m4a)));base64,(.+)$/;
        async function visita(v) {
            if (typeof v === 'string') {
                if (v.indexOf('data:') !== 0) return v;
                const m = RE.exec(v);
                if (!m) throw new Error('Nel set c\'è un file di tipo non ammesso (solo immagini PNG, JPEG, WebP, GIF e audio).');
                const hs = await sha256(m[2]);
                file[hs] = v;
                return 'img:' + hs;
            }
            if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await visita(x)); return o; }
            if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await visita(v[k]); return o; }
            return v;
        }
        return { set: await visita(set), file };
    }
    function hashDi(set) {
        const tr = {};
        (function visita(v) {
            if (typeof v === 'string') { const m = /^img:([a-f0-9]{64})/.exec(v); if (m) tr[m[1]] = true; }
            else if (Array.isArray(v)) v.forEach(visita);
            else if (v && typeof v === 'object') Object.keys(v).forEach((k) => visita(v[k]));
        })(set);
        return Object.keys(tr);
    }
    function sostituisci(v, mappa) {
        if (typeof v === 'string') { const m = /^img:([a-f0-9]{64})/.exec(v); return m && mappa[m[1]] ? mappa[m[1]] : v; }
        if (Array.isArray(v)) return v.map((x) => sostituisci(x, mappa));
        if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = sostituisci(v[k], mappa); }); return o; }
        return v;
    }
    async function ricaricaSet() {
        state.savedSets = await DB.getAllSets();
        const b = document.getElementById('lib-count');
        if (b) b.innerText = state.savedSets.length;
        if (typeof filterSetsByMode === 'function') filterSetsByMode();
    }

    function vistaMateriali() {
        if (!T.indiceMateriali) {
            if (T.erroreMateriali) {
                return h`${barra({ indietro: 'vai-bambini', titolo: 'Materiali del centro' })}<main class="tice-main">
                    <div class="banda">${icona('triangle-exclamation')}<div>Non riesco a leggere i materiali del centro: ${T.erroreMateriali}</div></div>
                    <button class="bt primario largo" style="margin-top:10px" data-a="vai-materiali">${icona('rotate')} Riprova</button></main>`;
            }
            if (!T.caricoMateriali) {
                T.caricoMateriali = true;
                Y.chiama('materiali.indice')
                    .then((x) => { T.indiceMateriali = x; })
                    .catch((e) => { T.erroreMateriali = e.message; })
                    .finally(() => { T.caricoMateriali = false; TiceHome.ridisegna(); });
            }
            return h`${barra({ indietro: 'vai-bambini', titolo: 'Materiali del centro' })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const ind = T.indiceMateriali.sets || {};
        const ids = Object.keys(ind).sort((a, b) => (ind[a].categoria + ind[a].nome).localeCompare(ind[b].categoria + ind[b].nome, 'it'));
        const stati = statiMateriali();
        const daPrendere = ids.filter((id) => stati[id] !== 'ok');
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Materiali del centro' })}
            <main class="tice-main">
                <p class="sotto">I set pubblicati qui si scaricano una volta e poi si usano anche senza rete, nei giochi e nei programmi.</p>
                ${Y.puo('pubblicaMateriali') ? h`<button class="bt primario largo" data-a="pubblica-set" ${T.lavoroMateriali ? grezzo('disabled') : ''}>${icona('cloud-arrow-up')} Pubblica set del tuo archivio</button>` : ''}
                ${daPrendere.length > 1 ? h`<button class="bt largo" style="margin-top:8px" data-a="scarica-tutti" ${T.lavoroMateriali ? grezzo('disabled') : ''}>${icona('cloud-arrow-down')} Scarica tutti i nuovi e gli aggiornati (${daPrendere.length})</button>` : ''}
                ${T.lavoroMateriali ? h`<p class="sotto" style="margin-top:10px" data-lavoro-materiali>${icona('spinner fa-spin')} ${T.lavoroMateriali}</p>` : ''}
                <div class="scheda" style="margin-top:12px">
                    ${ids.length ? ids.map((id) => {
                        const v = ind[id], stato = stati[id];
                        return h`<div class="riga" style="cursor:default">
                            <span class="corpo"><span class="t1">${v.nome}</span><span class="t2">${v.categoria ? v.categoria + ' · ' : ''}${v.nItems} elementi · ${v.aggiornatoDa || ''} · ${formatoData((v.aggiornato || '').slice(0, 10))}</span></span>
                            ${stato === 'ok' ? h`<span class="pill verde">${icona('check')} sul dispositivo</span>`
                                : h`<button class="bt piccolo ${stato === 'aggiorna' ? 'arancio' : ''}" data-a="scarica-set" data-id="${id}" ${T.lavoroMateriali ? grezzo('disabled') : ''}>${stato === 'aggiorna' ? 'Aggiorna' : 'Scarica'}</button>`}
                        </div>`;
                    }) : h`<div class="vuoto">Ancora nessun set pubblicato.</div>`}
                </div>
            </main>`;
    }
    // id del centro → 'scarica' | 'aggiorna' | 'ok'
    function statiMateriali() {
        const ind = (T.indiceMateriali && T.indiceMateriali.sets) || {};
        const locali = {};
        setLocali().forEach((s) => { if (s.centro && s.centro.id) locali[s.centro.id] = s; });
        const out = {};
        Object.keys(ind).forEach((id) => { const l = locali[id]; out[id] = !l ? 'scarica' : l.centro.versione < ind[id].versione ? 'aggiorna' : 'ok'; });
        return out;
    }
    // Le chiamate dei materiali: se il custode non risponde si riprova da soli
    // e intanto lo si dice, invece di restare fermi su "Caricamento…"
    function chiamaM(azione, dati) {
        const prima = T.lavoroMateriali;
        return Y.chiama(azione, dati, {
            suTentativo: (n, max) => lavoro(`${prima ? prima.replace(/…$/, '') + ' · ' : ''}il custode non ha risposto, riprovo (${n} di ${max})…`)
        }).finally(() => { if (prima && T.lavoroMateriali !== prima && T.lavoroMateriali) lavoro(prima); });
    }
    function lavoro(testo) {
        T.lavoroMateriali = testo;
        // durante i lotti si aggiorna solo la riga di avanzamento, non tutta la vista
        const p = testo && document.querySelector('#tice [data-lavoro-materiali]');
        if (p) p.innerHTML = String(h`${icona('spinner fa-spin')} ${testo}`);
        else TiceHome.ridisegna();
    }
    // Esito di un lavoro su più set: un avviso se è andato tutto bene, altrimenti il dettaglio
    async function esito(verbo, fatti, falliti) {
        if (!falliti.length) { avviso(fatti.length === 1 ? `«${fatti[0]}» ${verbo}` : `${fatti.length} set ${verbo.replace(/o$/, 'i')}`); return; }
        await foglio(h`<h2>${fatti.length} set ${verbo.replace(/o$/, 'i')}, ${falliti.length} no</h2>
            <div class="opzioni" style="max-height:50vh;overflow-y:auto">
                ${falliti.map((x) => h`<div class="opzione">${icona('triangle-exclamation')}<span class="corpo">${x.nome}<small>${x.errore}</small></span></div>`)}
            </div>
            <p class="sotto">Gli altri sono a posto: puoi riprovare solo questi.</p>
            <div class="bottoni"><button class="bt primario" data-foglio="chiudi">Ho capito</button></div>`);
    }

    // Scarica uno o più set; le immagini già prese per un set non si richiedono per gli altri
    async function scarica(ids) {
        const ind = (T.indiceMateriali && T.indiceMateriali.sets) || {};
        const presi = {}, fatti = [], falliti = [];
        for (let n = 0; n < ids.length; n++) {
            const id = ids[n], pre = ids.length > 1 ? `Set ${n + 1} di ${ids.length} · ` : '';
            try {
                lavoro(pre + 'scaricamento…');
                const set = await chiamaM('materiali.set', { id });
                const hs = hashDi(set);
                // Il custode manda al massimo ~8 MB per risposta: quelle che non
                // arrivano si richiedono; se un giro non porta niente, mancano davvero.
                let coda = hs.filter((x) => !presi[x]);
                const totale = coda.length, assenti = [];
                while (coda.length) {
                    const lotto = coda.slice(0, 40);
                    lavoro(`${pre}immagini ${totale - coda.length + 1}–${Math.min(totale - coda.length + lotto.length, totale)} di ${totale}…`);
                    const arrivate = await chiamaM('materiali.immagini', { hashes: lotto });
                    Object.assign(presi, arrivate);
                    const restano = lotto.filter((x) => !arrivate[x]);
                    if (restano.length === lotto.length) { assenti.push(...restano); coda = coda.slice(lotto.length); }
                    else coda = restano.concat(coda.slice(lotto.length));
                }
                const locale = sostituisci(set, presi);
                const esistente = setLocali().find((s) => s.centro && s.centro.id === id);
                locale.id = esistente ? esistente.id : id;
                locale.centro = { id, versione: set.versione, aggiornato: set.aggiornato };
                delete locale.versione; delete locale.aggiornato; delete locale.aggiornatoDa;
                await DB.saveSet(locale);
                await ricaricaSet();
                if (assenti.length) falliti.push({ nome: locale.name, errore: `Scaricato, ma ${assenti.length === 1 ? 'un\'immagine non c\'è' : assenti.length + ' immagini non ci sono'} nel Drive del centro: chi l'ha pubblicato può ripubblicarlo.` });
                else fatti.push(locale.name);
            } catch (e) { falliti.push({ nome: (ind[id] && ind[id].nome) || id, errore: e.message }); }
        }
        lavoro(null);
        await esito('scaricato', fatti, falliti);
    }
    const scaricaSet = (b) => scarica([b.dataset.id]);
    function scaricaTutti() {
        const stati = statiMateriali();
        return scarica(Object.keys(stati).filter((id) => stati[id] !== 'ok'));
    }

    async function pubblicaSet() {
        const sets = setLocali().filter((s) => !(s.modes || []).some((m) => m === 'quaderno' || m === 'quaderno_task'))
            .slice().sort((a, b) => ((a.category || '') + a.name).localeCompare((b.category || '') + b.name, 'it'));
        if (!sets.length) { avviso('Nel tuo archivio non ci sono set da pubblicare.'); return; }
        const ind = (T.indiceMateriali && T.indiceMateriali.sets) || {};
        const categorie = [...new Set(sets.map((s) => s.category || ''))].filter(Boolean);
        const nota = (s) => {
            const c = s.centro && ind[s.centro.id];
            return c ? ' · già nel centro (v' + c.versione + ')' : s.centro ? ' · dal centro' : '';
        };
        const r = await foglio(h`<form><h2>Pubblica set</h2>
            <p class="sotto">Le colleghe li troveranno nei materiali del centro. Un set già pubblicato o scaricato dal centro viene aggiornato. Le immagini in comune tra più set viaggiano una volta sola.</p>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
                <input type="search" placeholder="Cerca" data-filtro-set autocomplete="off" style="flex:1;min-width:140px">
                ${categorie.length > 1 ? h`<select data-filtro-cat style="flex:none;max-width:45%"><option value="">Tutte le categorie</option>${categorie.map((c) => h`<option value="${c}">${c}</option>`)}</select>` : ''}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap">
                <button type="button" class="bt piccolo" data-sel="tutti">Tutti quelli visibili</button>
                <button type="button" class="bt piccolo" data-sel="nuovi">Solo i nuovi</button>
                <button type="button" class="bt piccolo" data-sel="nessuno">Nessuno</button>
            </div>
            <div class="opzioni" style="max-height:44vh;overflow-y:auto" data-elenco-set>
                ${sets.map((s) => h`<label class="opzione" data-nome="${String(s.name + ' ' + (s.category || '')).toLowerCase()}" data-cat="${s.category || ''}" data-nuovo="${s.centro ? '' : '1'}"><input type="checkbox" name="id" value="${s.id}">
                    <span class="corpo">${s.name}<small>${[s.category, (s.items || []).length + ' elementi'].filter(Boolean).join(' · ')}${nota(s)}</small></span></label>`)}
            </div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario" data-conta disabled>Pubblica</button></div></form>`,
        {
            invia: (f) => ({ ids: new FormData(f).getAll('id') }),
            dopo: (f) => {
                const q = f.querySelector('[data-filtro-set]'), cat = f.querySelector('[data-filtro-cat]'), ok = f.querySelector('[data-conta]');
                const righe = [...f.querySelectorAll('[data-elenco-set] > label')];
                const conta = () => { const n = righe.filter((l) => l.querySelector('input').checked).length; ok.disabled = !n; ok.textContent = n > 1 ? `Pubblica ${n} set` : 'Pubblica'; };
                const filtra = () => {
                    const v = q.value.trim().toLowerCase(), c = cat ? cat.value : '';
                    righe.forEach((l) => { l.hidden = !l.querySelector('input').checked && ((!!v && !l.dataset.nome.includes(v)) || (!!c && l.dataset.cat !== c)); });
                };
                q.addEventListener('input', filtra);
                if (cat) cat.addEventListener('change', filtra);
                f.addEventListener('change', (e) => { if (e.target.name === 'id') conta(); });
                f.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => {
                    const modo = b.dataset.sel;
                    if (modo !== 'nessuno') filtra();
                    righe.forEach((l) => {
                        const i = l.querySelector('input');
                        if (modo === 'nessuno') i.checked = false;
                        else if (!l.hidden) i.checked = modo === 'tutti' || !!l.dataset.nuovo;
                    });
                    filtra(); conta();
                }));
            }
        });
        if (!r || !r.ids || !r.ids.length) return;
        await pubblica(r.ids);
    }
    async function pubblica(ids) {
        const fatti = [], falliti = [];
        const scelti = ids.map((id) => setLocali().find((s) => s.id === id)).filter(Boolean);
        try {
            // 1. ogni set con i file al posto delle immagini; i file di tutti in un solo elenco
            const pronti = [], file = {};
            for (let n = 0; n < scelti.length; n++) {
                const locale = scelti[n];
                lavoro(`Preparazione ${n + 1} di ${scelti.length}…`);
                try {
                    const copia = JSON.parse(JSON.stringify(locale));
                    const idCentro = (copia.centro && copia.centro.id) || String(copia.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
                    delete copia.centro;
                    copia.id = idCentro;
                    const p = await perRiferimento(copia);
                    Object.assign(file, p.file);
                    pronti.push({ locale, idCentro, set: p.set });
                } catch (e) { falliti.push({ nome: locale.name, errore: e.message }); }
            }
            // 2. le immagini che il centro non ha ancora, a lotti piccoli: se un
            //    lotto non passa si divide in due, e un'immagine che proprio non
            //    passa ferma solo i set che la usano
            const tutti = Object.keys(file), mancanti = [];
            for (let i = 0; i < tutti.length; i += 1000) {
                lavoro(`Controllo delle immagini già nel centro${tutti.length > 1000 ? ` (${Math.min(i + 1000, tutti.length)} di ${tutti.length})` : ''}…`);
                mancanti.push(...await chiamaM('materiali.mancanti', { hashes: tutti.slice(i, i + 1000) }));
            }
            const nonCaricate = {};
            let inviati = 0;
            const invia = async (hs) => {
                try {
                    const lotto = {};
                    hs.forEach((x) => { lotto[x] = file[x]; });
                    await chiamaM('materiali.caricaImmagini', { immagini: lotto });
                    inviati += hs.length;
                    lavoro(`Caricamento immagini ${inviati} di ${mancanti.length}…`);
                } catch (e) {
                    if (e && (e.accesso || e.codice === 'vietato')) throw e;
                    if (hs.length === 1) { nonCaricate[hs[0]] = e.message; inviati++; return; }
                    const meta = Math.ceil(hs.length / 2);
                    await invia(hs.slice(0, meta));
                    await invia(hs.slice(meta));
                }
            };
            if (mancanti.length) lavoro(`Caricamento immagini 0 di ${mancanti.length}…`);
            let lotto = [], peso = 0;
            for (const hs of mancanti) {
                if (lotto.length && (lotto.length >= 20 || peso + file[hs].length > 6e6)) { await invia(lotto); lotto = []; peso = 0; }
                lotto.push(hs); peso += file[hs].length;
            }
            if (lotto.length) await invia(lotto);
            // 3. i set, uno alla volta: se uno non passa, gli altri vanno avanti
            const indice = await chiamaM('materiali.indice');
            for (let n = 0; n < pronti.length; n++) {
                const { locale, idCentro, set } = pronti[n];
                const rotte = hashDi(set).filter((x) => nonCaricate[x]);
                if (rotte.length) {
                    falliti.push({ nome: locale.name, errore: `${rotte.length === 1 ? 'Un\'immagine non si è caricata' : rotte.length + ' immagini non si sono caricate'}: ${nonCaricate[rotte[0]]}` });
                    continue;
                }
                lavoro(pronti.length > 1 ? `Pubblicazione ${n + 1} di ${pronti.length}…` : 'Pubblicazione…');
                const base = ((indice.sets || {})[idCentro] || {}).versione || 0;
                try {
                    let voce;
                    try { voce = await chiamaM('materiali.pubblica', { set, versioneBase: base }); }
                    catch (e) {
                        // La risposta era andata persa ma la pubblicazione era fatta (custode
                        // senza memoria dei reinvii): lo si riconosce dall'indice
                        if (!e || e.codice !== 'conflitto') throw e;
                        const ora = ((await chiamaM('materiali.indice')).sets || {})[idCentro];
                        const mie = ora && ora.versione === base + 1 && ora.aggiornatoDa === io().email &&
                            JSON.stringify((ora.immagini || []).slice().sort()) === JSON.stringify(hashDi(set).sort());
                        if (!mie) throw e;
                        voce = ora;
                    }
                    locale.centro = { id: idCentro, versione: voce.versione, aggiornato: voce.aggiornato };
                    await DB.saveSet(locale);
                    fatti.push(locale.name);
                } catch (e) { falliti.push({ nome: locale.name, errore: e.message }); }
            }
            await ricaricaSet();
        } catch (e) {
            // un errore prima della pubblicazione (rete, immagini) ferma tutto
            scelti.filter((s) => !fatti.includes(s.name) && !falliti.some((x) => x.nome === s.name)).forEach((s) => falliti.push({ nome: s.name, errore: e.message }));
        }
        T.indiceMateriali = null;
        lavoro(null);
        await esito('pubblicato', fatti, falliti);
    }

    // =====================================================================
    // Registrazione
    // =====================================================================
    TiceHome.estendi({
        viste: { account: vistaAccount, persone: vistaPersone, versioni: vistaVersioni, materiali: vistaMateriali, dispositivi: vistaDispositivi },
        azioni: {
            'vai-account': () => vai('account'),
            'vai-persone': () => { T.accessi = null; vai('persone'); },
            'attiva-veloce': () => veloce().attivaConAccesso().then(() => TiceHome.ridisegna(), (e) => { avviso((e && e.message) || 'Non riesco ad attivare la corsia veloce.', 'errore'); }),
            'consegna-veloce': async (b) => {
                try { const ok = await veloce().consegna(b.dataset.id); avviso(ok ? 'Chiave consegnata' : 'Persona non riconosciuta come abilitata: usa «Consegna la chiave a chi la aspetta».', ok ? undefined : 'errore'); }
                catch (e) { avviso(e.message || 'Consegna non riuscita', 'errore'); }
                TiceHome.ridisegna();
            },
            'consegna-manuale': (el) => { try { localStorage.setItem('tice_consegna_manuale', el.checked ? '1' : '0'); } catch (e) { /* ok */ } },
            'scegli-aula': () => scegliAula(),
            'consegna-chiavi': async () => {
                T.consegnando = true; TiceHome.ridisegna();
                try {
                    const r = await Y.consegnaOra();
                    avviso(r.consegnate ? `Chiave consegnata a ${r.consegnate} ${r.consegnate === 1 ? 'dispositivo' : 'dispositivi'}: ${r.consegnate === 1 ? 'si collega' : 'si collegano'} entro pochi secondi` : 'Nessun dispositivo aspetta la chiave. Se la persona ha appena fatto l\'accesso, riprova fra qualche secondo.');
                    T.elencoDisp = null;
                } catch (e) { avviso(e.message, 'errore'); }
                T.consegnando = false; TiceHome.ridisegna();
            },
            'misura-velocita': async () => {
                T.velLavoro = true; T.velErrore = null; TiceHome.ridisegna();
                try { T.velMisura = await Y.velocita.misuraOra(3); }
                catch (e) { T.velErrore = (e && e.message) || 'Misura non riuscita.'; }
                T.velLavoro = false; TiceHome.ridisegna();
            },
            'gestisci-aule': () => gestisciAule(),
            'sposta-bambini': () => spostaBambini(),
            'vai-materiali': () => { T.indiceMateriali = null; T.erroreMateriali = null; vai('materiali'); },
            'crea-chiave': creaChiave,
            'inserisci-chiave': inserisciChiave,
            sincronizza: () => Y.sincronizza().then((ok) => avviso(ok ? 'Sincronizzato' : (S.errore || 'Sincronizzazione non riuscita'), ok ? undefined : 'errore')),
            'controlla-chiave': () => Y.preparaCentro().then(() => { if (!Y.pronto()) avviso('La chiave non è ancora arrivata.'); }).catch((e) => avviso(e.message, 'errore')),
            'mostra-chiave': mostraChiave,
            'cambia-chiave': cambiaChiave,
            'vai-dispositivi': () => { T.elencoDisp = null; vai('dispositivi'); },
            'togli-dispositivo': async (b) => {
                if (!await conferma('Togliere questo dispositivo?', 'Perde la chiave del centro. Se la persona è ancora abilitata e rientra, il dispositivo si registra di nuovo e la riceve. Per chiudere fuori qualcuno, toglila da Persone e accessi.', { ok: 'Togli', pericolo: true })) return;
                try { T.elencoDisp = await Y.togliDispositivo(b.dataset.id); } catch (e) { avviso(e.message, 'errore'); }
                TiceHome.ridisegna();
            },
            esci: async () => {
                const r = await foglio(h`<h2>Esci</h2>
                    <p class="sotto">Su un dispositivo personale puoi uscire lasciando i dati: ritrovi tutto al prossimo accesso. Su un dispositivo condiviso cancella i dati del centro.</p>
                    ${S.coda.size ? h`<div class="banda">${icona('triangle-exclamation')}<div>${S.coda.size} bambini hanno modifiche non ancora inviate: se cancelli i dati andranno perse.</div></div>` : ''}
                    <div class="opzioni">
                        <button class="opzione" data-foglio="tieni">${icona('right-from-bracket')}<span class="corpo">Esci e basta</span></button>
                        <button class="opzione" data-foglio="cancella">${icona('trash')}<span class="corpo">Esci e cancella i dati del centro da questo dispositivo<small>Anche la chiave del centro</small></span></button>
                    </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Annulla</button></div>`);
                if (!r) return;
                await Y.esci(r === 'cancella');
                vai('bambini');
            },
            persona: (b) => persona(b.dataset.email),
            'nome-proprietario': () => nomeProprietario(),
            versione,
            'scarica-set': scaricaSet,
            'scarica-tutti': scaricaTutti,
            'pubblica-set': pubblicaSet
        },
        aggancio: { chip, banner, pillola, nellAula, sceltaRiservato, opzioniBambino, sceltaBambino, condiviso: (pid) => !!(Y.pronto() && Y.condiviso(pid)), opzioniMenu, sceltaMenu, nuovoBambino, puoProgrammi, dopo, limitato: tirocinante,
            // modalità e sinonimi: quelli del centro, uguali per tutti
            dizionario: () => (Y.attivo() && S.io ? S.modalita || {} : null),
            salvaDizionario: (aggiunte) => Y.aggiornaModalita(aggiunte) }
    });

    Y.alCambio((cosa) => {
        if (cosa === 'stato') aggiornaRuolo();
        if (cosa === 'modalita' && ['programma', 'import', 'diario'].includes(TiceHome.attuale().vista)) TiceHome.ridisegna();
        if (cosa === 'stato' || cosa === 'coda' || cosa === 'pazienti' || String(cosa).indexOf('paziente:') === 0) {
            if (cosa === 'pazienti' && typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            // non si ridisegna sotto le dita di chi sta segnando: solo il chip e gli elenchi
            const v = TiceHome.attuale().vista;
            if (['seduta', 'turni', 'turni-modello'].includes(v) && (cosa === 'stato' || cosa === 'coda')) {
                const c = document.querySelector('#tice .tice-stato');
                if (c) c.outerHTML = String(chip());
                return;
            }
            TiceHome.ridisegna();
        }
    });
    const parti = () => { limitaApp(); Y.avvia().catch((e) => console.error('avvio sincronizzazione', e)); };
    if (document.readyState === 'complete') parti(); else window.addEventListener('load', parti);
})();
