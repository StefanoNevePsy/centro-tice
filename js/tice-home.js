/**
 * Centro TICE — schermata iniziale per la presa dati.
 *
 * Si apre all'avvio sopra l'app: si sceglie il bambino, compaiono le attività
 * del suo programma con il target in corso, e si segna ✓ / P / ✗ con un tocco.
 * A fine seduta ogni attività diventa una seduta Quaderno nello storico
 * (stessa struttura di quelle registrate dal Quaderno dell'app), quindi
 * cartella clinica, grafici, criterio ed export funzionano come sempre.
 *
 * Tutto il resto dell'app resta raggiungibile: giochi e attività, cartelle,
 * archivio dei set, impostazioni.
 *
 * Dati in memoria: si lavora sempre sugli oggetti di state.patients, gli
 * stessi che usa il resto dell'app, così un salvataggio non ne sovrascrive
 * un altro con una copia vecchia.
 */
(function () {
    'use strict';
    const P = window.TiceProgramma;
    const C = window.TiceComportamenti;

    // ---------- HTML con escape ----------
    class Grezzo { constructor(s) { this.s = s; } toString() { return this.s; } }
    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function val(v) {
        if (v == null || v === false) return '';
        if (v instanceof Grezzo) return v.s;
        if (Array.isArray(v)) return v.map(val).join('');
        return esc(v);
    }
    function h(parti, ...valori) {
        let s = parti[0];
        valori.forEach((v, i) => { s += val(v) + parti[i + 1]; });
        return new Grezzo(s);
    }
    const grezzo = (s) => new Grezzo(s);
    const icona = (n) => grezzo(`<i class="fa-solid fa-${n}"></i>`);
    // Aspetto: «quaderno» (righe a matita, testate, annotazioni a mano) o «classico»,
    // com'era prima: si sceglie dal menu e resta su questo dispositivo
    const stile = () => { try { return localStorage.getItem('tice_stile') === 'classico' ? 'classico' : 'quaderno'; } catch (e) { return 'quaderno'; } };
    const applicaStile = () => { document.documentElement.dataset.ticeStile = stile(); };
    applicaStile();
    // La testata della pagina: un'etichetta spaziata e il titolo grande, come le pagine di PsyDiary
    const testata = (eti, titolo, o = {}) => h`<div class="tq-testata">
        ${o.azione ? h`<button type="button" class="eti tq-eti tocca-eti" data-a="${o.azione}">${eti} ${icona('chevron-down')}</button>` : h`<span class="eti tq-eti">${eti}</span>`}
        <h1 class="tq-titolo">${titolo}${o.mano ? h` <span class="mano">${o.mano}</span>` : ''}</h1></div>`;
    // il timbro sulla pagina quando una seduta è salvata
    function timbro(testo) {
        document.querySelectorAll('.tq-timbro').forEach((x) => x.remove());
        const d = document.createElement('div');
        d.className = 'tq-timbro'; d.setAttribute('aria-hidden', 'true');
        d.innerHTML = `<span>${String(testo).replace(/[<>&]/g, '')}</span>`;
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 2200);
    }

    // ---------- stato ----------
    const T = { vista: 'turni', pid: null, aperte: {}, chiusiAperti: {}, suggerimenti: {}, cerca: '', importazioni: [] };
    // Suggerimenti per chi somministra: dell'attività e del target in corso
    const suggerimentiDi = (att, t) => [att && att.suggerimenti, t && t.suggerimento].concat(((att && !att.temporanea && att.misure) || []).map((m) => m.suggerimenti))
        .map((x) => String(x || '').trim()).filter(Boolean);
    const radice = () => document.getElementById('tice');

    function pazienti() { return (typeof state !== 'undefined' && state.patients) || []; }
    // quelli dell'aula su cui si lavora (con le aule del centro); senza aule, tutti
    function pazientiAula() { return pazienti().filter((p) => !EST.nellAula || EST.nellAula(p)); }
    function paz(pid) { return pazienti().find((x) => x.id === pid) || null; }
    async function caricaPazienti() {
        if (!pazienti().length) state.patients = await DB.getAllPatients();
    }
    async function salvaPaziente(p) {
        // le note del giorno arrivate da fuori (quaderni importati, versioni di prima) diventano voci del diario
        if (window.TiceNote) window.TiceNote.allinea(p);
        T.salvandoQui = true;
        try { await DB.savePatient(p); } finally { T.salvandoQui = false; }
        // se il resto dell'app ha ricaricato l'elenco nel frattempo, rimette questo oggetto
        const i = state.patients.findIndex((x) => x.id === p.id);
        if (i >= 0) state.patients[i] = p; else state.patients.push(p);
        if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
    }
    const oggi = () => P.oggi();
    function formatoData(iso, lungo) {
        if (!iso) return '';
        const [a, m, g] = iso.slice(0, 10).split('-');
        if (!lungo) return `${g}/${m}`;
        const d = new Date(+a, +m - 1, +g);
        return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    function classePct(pct, soglia) {
        if (pct == null) return '';
        return pct >= (soglia || 90) ? 'pct-ok' : pct >= 60 ? 'pct-medio' : 'pct-basso';
    }
    const iniziali = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

    // ---------- bozza della seduta (sopravvive a chiusure e ricariche) ----------
    const chiaveBozza = (pid) => 'tice_bozza_' + pid;
    function leggiBozza(pid) {
        try { const b = JSON.parse(localStorage.getItem(chiaveBozza(pid)) || 'null'); if (b && b.voci) return b; } catch (e) { /* bozza illeggibile: si riparte */ }
        return null;
    }
    function bozza(pid) {
        if (!T.bozza || T.bozza.pid !== pid) {
            T.bozza = leggiBozza(pid) || { pid, data: oggi(), inizio: new Date().toISOString(), voci: {}, extra: [], temp: [] };
        }
        // una bozza ancora vuota di un altro giorno (app rimasta aperta) diventa di oggi
        const b = T.bozza;
        if (b.data !== oggi() && !Object.values(b.voci).some(haDati) && !b.extra.length && !b.temp.length) { b.data = oggi(); b.inizio = new Date().toISOString(); }
        return T.bozza;
    }
    function salvaBozza() {
        if (!T.bozza) return;
        const b = T.bozza;
        const vuota = !Object.values(b.voci).some(haDati) && !b.extra.length && !b.temp.length && !episodiBozza(b);
        try {
            if (vuota) localStorage.removeItem(chiaveBozza(b.pid));
            else localStorage.setItem(chiaveBozza(b.pid), JSON.stringify(b));
        } catch (e) { console.warn('Bozza non salvata', e); }
    }
    function eliminaBozza(pid) {
        localStorage.removeItem(chiaveBozza(pid));
        if (T.ta && T.ta.pid === pid) T.ta = null;
        if (T.bozza && T.bozza.pid === pid) T.bozza = null;
    }
    const haDati = (v) => v && (v.v + v.p + v.x) > 0;
    // episodi di comportamenti nella bozza (o uno in corso)
    const episodiBozza = (b) => Object.values((b && b.comp) || {}).reduce((n, r) => n + r.episodi.length + (r.inCorso ? 1 : 0), 0);

    // Attività della seduta: il programma attivo, più quelle aggiunte solo per oggi
    function attivitaSeduta(p) {
        const b = bozza(p.id);
        const prog = P.programma(p).attivita;
        const lista = P.attiveOggi(p).slice();
        b.extra.forEach((id) => {
            const a = prog.find((x) => x.id === id);
            if (a && !lista.includes(a)) lista.push(a);
        });
        b.temp.forEach((t) => lista.push(Object.assign({ temporanea: true, target: [], criterio: { soglia: 90, sedute: 2 } }, t)));
        return lista;
    }
    // Più prese dati nella stessa attività: la voce della seduta è "idAttività~idPresa"
    const baseId = (k) => String(k).split('~')[0];
    const msDi = (k) => String(k).split('~')[1] || null;
    const misure = (att) => (att && !att.temporanea && att.misure) || [];
    // Il tipo di una sottoattività: il suo, se indicato, altrimenti quello dell'attività
    function tipoMisura(att, m) {
        if (!m || !m.tipo) return { sessionType: att.sessionType || 'independent', eco: att.risposte === 'ecoico' };
        return { sessionType: m.tipo === 'timedelay' ? 'timedelay' : 'independent', eco: m.tipo === 'ecoico' };
    }
    // L'attività "vista" da una voce: per una sottoattività con il proprio tipo, i suoi tasti
    function attPerVoce(att, k) {
        const m = misure(att).find((x) => x.id === msDi(k));
        if (!m || (!m.tipo && !(+m.prove > 0))) return att;
        const a = Object.assign({}, att);
        // le prove per LU della sottoattività, se indicate, valgono più di quelle dell'attività
        if (+m.prove > 0) a.prove = +m.prove;
        if (m.tipo) {
            const tm = tipoMisura(att, m);
            a.sessionType = tm.sessionType;
            if (tm.eco) { a.risposte = 'ecoico'; a.nomeP = 'Ecoica'; } else { delete a.risposte; if (a.nomeP === 'Ecoica') delete a.nomeP; }
        }
        return a;
    }
    function attivitaDi(p, id) {
        id = baseId(id);
        const a = P.attivita(p, id);
        if (a) return a;
        const t = bozza(p.id).temp.find((x) => x.id === id);
        return t ? Object.assign({ temporanea: true, target: [], criterio: { soglia: 90, sedute: 2 } }, t) : null;
    }
    // Le voci della seduta ancora senza risposte seguono il target in corso del programma:
    // se lo cambia un collega, o si passa al prossimo target, la presa dati si aggiorna subito
    function allineaVoci(p) {
        const b = bozza(p.id);
        Object.keys(b.voci).forEach((k) => {
            const v = b.voci[k], att = attivitaDi(p, k);
            if (!att || att.temporanea || haDati(v) || (v.esiti && Object.keys(v.esiti).length)) return;
            const c = P.targetCorrente(att), tid = c ? c.target.id : null;
            if (v.targetId !== tid) { v.targetId = tid; v.mantenimento = !!(c && c.mantenimento); delete v.passo; delete v.giri; }
        });
    }
    function voce(p, att, k) {
        const b = bozza(p.id);
        k = k || att.id;
        if (!b.voci[k]) {
            const c = att.temporanea ? null : P.targetCorrente(att);
            // una presa dati segue il target scelto per le altre della stessa attività
            const gia = Object.keys(b.voci).filter((x) => baseId(x) === att.id).map((x) => b.voci[x])[0];
            const m = misure(att).find((x) => x.id === msDi(k));
            b.voci[k] = { v: 0, p: 0, x: 0, sequenza: '', nota: '', decisione: '', targetId: gia ? gia.targetId : (c ? c.target.id : null),
                mantenimento: gia ? gia.mantenimento : !!(c && c.mantenimento), sessionType: tipoMisura(att, m).sessionType };
        }
        return b.voci[k];
    }

    // ---------- task analysis: un passo alla volta ----------
    // Nella voce della seduta: esiti = { passoId: 'VPX…' }, passo = indice del
    // passo da segnare, giri = giri completati, ordine = passo di ogni risposta
    // (parallelo a sequenza), per poter annullare l'ultima.
    function targetVoce(att, v) {
        if (v && v.targetId) return (att.target || []).find((x) => x.id === v.targetId) || null;
        const c = att.temporanea ? null : P.targetCorrente(att);
        return c ? c.target : null;
    }
    const passiVoce = (att, v) => P.passiDi(targetVoce(att, v));
    function statoTA(v, passi) {
        const i = Math.min((v && v.passo) || 0, Math.max(0, passi.length - 1));
        return { i, passo: passi[i], giri: (v && v.giri) || 0 };
    }
    // Ultime risposte della seduta, in ordine, per l'annulla sempre a portata
    function ultimeDi(b) { return b.ultime || (b.ultime = []); }
    function descriviUltima(p) {
        const b = bozza(p.id), u = ultimeDi(b);
        for (let k = u.length - 1; k >= 0; k--) {
            // un comportamento: l'ultimo episodio segnato, o la durata in corso
            if (String(u[k]).indexOf('comp:') === 0) {
                const c = C.trova(p, u[k].slice(5)), r = c && b.comp && b.comp[c.id];
                if (!c || !r || !(r.episodi.length || r.inCorso)) continue;
                return { att: null, r: 'C', testo: c.nome + (r.inCorso ? ' · in corso' : ' · episodio ' + r.episodi.length) };
            }
            const att = attivitaDi(p, u[k]), v = b.voci[u[k]];
            if (!att || !v || !v.sequenza) continue;
            const r = v.sequenza.slice(-1);
            const passi = passiVoce(att, v);
            const ps = passi.length && v.ordine ? passi.find((x) => x.id === v.ordine[v.ordine.length - 1]) : null;
            const m = misure(att).find((x) => x.id === msDi(u[k]));
            return { att, r, testo: att.nome + (m ? ' · ' + m.nome : '') + (ps ? ' · ' + ps.testo : '') };
        }
        return null;
    }
    function tastoAnnulla(p) {
        const d = descriviUltima(p);
        const SEGNO = { V: '✓', P: 'P', X: '✗', C: '+1' };
        return h`<button id="tice-annulla" class="tice-annulla ${d ? '' : 'nascosto'}" data-a="annulla-ultima" ${d ? '' : grezzo('hidden')}
            aria-label="${d ? 'Annulla l\'ultima: ' + SEGNO[d.r] + ' ' + d.testo : 'Annulla'}" title="${d ? 'Annulla: ' + d.testo : ''}">
            ${icona('rotate-left')}<span class="cosa"><b class="${d ? d.r : ''}">${d ? SEGNO[d.r] : ''}</b> ${d ? d.testo : ''}</span></button>`;
    }

    // La lista dei passi a tutto schermo; "Quaderno" la mette da parte e
    // lascia una linguetta per tornarci.
    function pannelloTA(p) {
        if (!T.ta || T.ta.pid !== p.id) return h`<div id="tice-ta"></div>`;
        const att = attivitaDi(p, T.ta.attId);
        const v = att && bozza(p.id).voci[att.id];
        const passi = att ? passiVoce(att, v) : [];
        if (!att || !passi.length) { T.ta = null; return h`<div id="tice-ta"></div>`; }
        const t = targetVoce(att, v), st = statoTA(v, passi);
        const tipo = (v && v.sessionType) || att.sessionType;
        if (T.ta.nascosta) {
            return h`<div id="tice-ta"><button class="ta-linguetta" data-a="mostra-ta">${icona('list-ol')}
                <span><b>${t.testo}</b><br><small>passo ${st.i + 1} di ${passi.length} · ${st.passo.testo}</small></span>${icona('chevron-up')}</button></div>`;
        }
        const tot = v ? v.v + v.p + v.x : 0;
        const anima = T.ta.anima;
        T.ta.anima = false;   // solo all'apertura, non a ogni punteggio
        return h`<div id="tice-ta" class="ta-strato ${anima ? 'anima' : ''}" role="dialog" aria-label="Task analysis ${t.testo}">
            <div class="ta-testa">
                <button class="ib" data-a="chiudi-ta" aria-label="Chiudi la lista">${icona('xmark')}</button>
                <div class="ta-titolo"><b>${t.testo}</b><small>${att.nome} · giro ${st.giri + 1}${tot ? ` · ${v.v}/${tot} (${Math.round(100 * v.v / tot)}%)` : ''}</small></div>
                <button class="bt piccolo" data-a="nascondi-ta" title="Torna al quaderno della seduta, la lista resta a portata">${icona('book-open')} Quaderno</button>
            </div>
            <ol class="ta-passi">
                ${passi.map((ps, k) => {
                    const e = (v && v.esiti && v.esiti[ps.id]) || '';
                    return h`<li class="${k === st.i ? 'corrente' : ''}" ${k === st.i ? grezzo('data-corrente') : ''}>
                        <button class="ta-passo" data-a="vai-passo" data-id="${att.id}" data-k="${k}">
                            <span class="n">${k + 1}</span><span class="tt">${ps.testo}</span>
                            <span class="esiti">${e.split('').map((r) => h`<i class="${r}"></i>`)}</span>
                        </button></li>`;
                })}
            </ol>
            <div class="ta-piede">
                <div class="ta-ora"><small>Passo ${st.i + 1} di ${passi.length}</small><b>${st.passo.testo}</b></div>
                ${tasti(att, tipo)}
                <button class="bt piccolo fantasma" data-a="salta-passo" data-id="${att.id}">Salta il passo ${icona('forward')}</button>
            </div>
        </div>`;
    }
    function aggiornaSovra(p) {
        const ta = document.getElementById('tice-ta');
        if (ta) {
            const scroll = (ta.querySelector('.ta-passi') || {}).scrollTop;
            ta.outerHTML = String(pannelloTA(p));
            const nuovo = document.querySelector('#tice-ta .ta-passi');
            if (nuovo) {
                if (scroll != null) nuovo.scrollTop = scroll;
                const c = nuovo.querySelector('[data-corrente]');
                if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        const a = document.getElementById('tice-annulla');
        if (a) a.outerHTML = String(tastoAnnulla(p));
    }

    // ---------- fogli, conferme, avvisi ----------
    function foglio(contenuto, opzioni = {}) {
        return new Promise((risolvi) => {
            const sfondo = document.createElement('div');
            sfondo.className = 'tice-foglio-sfondo';
            sfondo.innerHTML = `<div class="tice-foglio" role="dialog" aria-modal="true">${val(contenuto)}</div>`;
            document.body.appendChild(sfondo);
            const f = sfondo.firstChild;
            try { history.pushState(Object.assign({}, history.state, { tf: (history.state && history.state.tf || 0) + 1 }), ''); } catch (e) { /* niente */ }
            const chiudi = (v, daIndietro) => {
                if (!sfondo.isConnected) return;
                sfondo.remove(); document.removeEventListener('keydown', tasto); risolvi(v);
                if (!daIndietro && history.state && history.state.tf) { T.saltaPop = (T.saltaPop || 0) + 1; history.back(); }
            };
            sfondo._chiudiIndietro = () => lascia();
            // Toccare fuori o Esc con un modulo modificato: prima si chiede (un tocco
            // distratto non deve buttare via un'attività scritta a metà)
            let iniziale = null, chiedendo = false;
            const statoForm = () => { const fm = f.querySelector('form'); return fm ? JSON.stringify([...new FormData(fm)]) + '|' + fm.querySelectorAll('input, textarea, select').length : ''; };
            const lascia = async () => {
                if (chiedendo || sfondo.querySelector('.tice-foglio-sfondo')) return;
                if (iniziale != null && statoForm() !== iniziale) {
                    chiedendo = true;
                    const ok = await conferma('Scartare le modifiche?', 'Quello che hai scritto in questo foglio non è ancora salvato.', { ok: 'Scarta', pericolo: true });
                    chiedendo = false;
                    if (!ok) return;
                }
                chiudi(null);
            };
            const tasto = (e) => { if (e.key === 'Escape' && document.querySelectorAll('.tice-foglio-sfondo').length && document.querySelectorAll('.tice-foglio-sfondo')[document.querySelectorAll('.tice-foglio-sfondo').length - 1] === sfondo) lascia(); };
            document.addEventListener('keydown', tasto);
            sfondo.addEventListener('click', (e) => {
                if (e.target === sfondo) return lascia();
                const b = e.target.closest('[data-foglio]');
                if (!b) return;
                e.preventDefault();
                const v = b.getAttribute('data-foglio');
                chiudi(v === 'chiudi' ? null : v);
            });
            const form = f.querySelector('form');
            if (form) form.addEventListener('submit', (e) => {
                e.preventDefault();
                const r = opzioni.invia ? opzioni.invia(form, e.submitter) : Object.fromEntries(new FormData(form));
                if (r !== undefined) chiudi(r);
            });
            if (opzioni.dopo) opzioni.dopo(f);
            iniziale = statoForm();
            const primo = f.querySelector('[autofocus]');
            if (primo) setTimeout(() => primo.focus(), 60);
        });
    }
    function conferma(titolo, testo, { ok = 'Conferma', pericolo = false } = {}) {
        return foglio(h`<h2>${titolo}</h2>${testo ? h`<p class="sotto">${testo}</p>` : ''}
            <div class="bottoni"><button class="bt" data-foglio="chiudi">Annulla</button>
            <button class="bt ${pericolo ? 'pericolo' : 'primario'}" data-foglio="si">${ok}</button></div>`).then((v) => v === 'si');
    }
    let timerAvviso = null;
    function avviso(testo, tipo) {
        document.querySelectorAll('.tice-avviso').forEach((x) => x.remove());
        const d = document.createElement('div');
        d.className = 'tice-avviso' + (tipo === 'errore' ? ' errore' : '');
        d.setAttribute('role', tipo === 'errore' ? 'alert' : 'status');
        d.setAttribute('aria-live', tipo === 'errore' ? 'assertive' : 'polite');
        d.textContent = testo;
        document.body.appendChild(d);
        clearTimeout(timerAvviso);
        timerAvviso = setTimeout(() => d.remove(), 3200);
    }

    // =====================================================================
    // Viste
    // =====================================================================
    function barra({ indietro, titolo, sotto, destra }) {
        return h`<header class="tice-barra">
            ${indietro ? h`<button class="ib" data-a="${indietro}" aria-label="Indietro">${icona('arrow-left')}</button>`
                : h`<button class="marchio" data-a="vai-bambini" aria-label="Centro TICE"><img src="img/tice/logo-bianco.svg" alt="TICE"></button>`}
            <div class="titolo"><span class="titolo-testo">${titolo}</span>${sotto ? (sotto.azione ? h`<button type="button" class="sotto-titolo tocca" data-a="${sotto.azione}"><span class="tocca-testo">${sotto.testo}</span>${icona('chevron-down')}</button>` : h`<span class="sotto-titolo">${sotto.testo}</span>`) : ''}</div>
            ${EST.chip ? EST.chip() : ''}
            ${destra || ''}
            ${(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !(window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) ? h`<button class="ib" data-a="schermo-intero" aria-label="Schermo intero" title="Schermo intero">${icona(document.fullscreenElement || document.webkitFullscreenElement ? 'compress' : 'expand')}</button>` : ''}
        </header>`;
    }


    // ---------- elenco bambini ----------
    function ultimaSeduta(p) {
        let u = null;
        (p.history || []).forEach((s) => { if (!u || s.date > u) u = s.date; });
        return u;
    }
    // età dalla data di nascita: "4 anni e 3 mesi" (sotto i 2 anni, in mesi)
    function eta(p) {
        if (!p.nascita) return '';
        const n = new Date(p.nascita + 'T12:00:00'), o = new Date();
        const mesi = (o.getFullYear() - n.getFullYear()) * 12 + o.getMonth() - n.getMonth() - (o.getDate() < n.getDate() ? 1 : 0);
        if (mesi < 0) return '';
        if (mesi < 24) return mesi + (mesi === 1 ? ' mese' : ' mesi');
        const a = Math.floor(mesi / 12), m = mesi % 12;
        return a + ' anni' + (m ? ' e ' + m + (m === 1 ? ' mese' : ' mesi') : '');
    }
    function vistaBambini() {
        const q = T.cerca.trim().toLowerCase();
        const elenco = pazientiAula()
            .filter((p) => !q || String(p.name || '').toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q))
            .map((p) => ({ p, b: leggiBozza(p.id), u: ultimaSeduta(p) }))
            .sort((a, b) => (!!b.b - !!a.b) || String(b.u || '').localeCompare(String(a.u || '')) || String(a.p.name).localeCompare(String(b.p.name), 'it'));
        const righe = elenco.map(({ p, b, u }) => {
            const attive = P.attiveOggi(p).length;
            const risposte = b ? Object.values(b.voci).reduce((n, v) => n + v.v + v.p + v.x, 0) : 0;
            return h`<div class="riga-con"><button class="riga" data-a="apri-bambino" data-pid="${p.id}">
                <span class="avatar ${eGruppo(p) ? 'gruppo' : ''}">${eGruppo(p) ? icona('users') : p.photo ? h`<img src="${p.photo}" alt="">` : iniziali(p.name)}</span>
                <span class="corpo"><span class="t1">${p.name}</span>
                    <span class="t2">${EST.pillola ? EST.pillola(p) : ''}${b && risposte ? h`<span class="pill arancio">seduta in corso · ${risposte} risposte</span> ` : ''}${attive ? `${attive} attività in corso` : 'nessun programma'}${u ? ' · ultima ' + formatoData(P.giorno(u)) : ''}${eGruppo(p) ? ' · gruppo di ' + membriDi(p).length : ''}${p.category ? ' · ' + p.category : ''}${eta(p) ? ' · ' + eta(p) : ''}${EST.sottoRiga ? EST.sottoRiga(p) : ''}</span></span>
                ${icona('chevron-right')}
            </button>${EST.accantoRiga && !eGruppo(p) ? EST.accantoRiga(p) : ''}</div>`;
        });
        return h`${barra({ indietro: VISTE.turni ? 'vai-bambini' : null, titolo: 'Tutti i bambini', destra: h`
                <button class="ib" data-a="vai-turni" aria-label="Turni" title="Turni della settimana">${icona('calendar-week')}</button>
                <button class="ib" data-a="vai-grafici" aria-label="Grafici dei bambini" title="Grafici">${icona('chart-line')}</button>
                <button class="ib" data-a="giochi" aria-label="Giochi e attività dell'app" title="Giochi e attività">${icona('gamepad')}</button>
                <button class="ib" data-a="menu" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main">
                ${testata('Centro TICE · ' + pazientiAula().length + (pazientiAula().length === 1 ? ' bambino' : ' bambini'), 'Tutti i bambini')}
                ${EST.banner ? EST.banner() : ''}
                ${(() => { const vecchie = elenco.filter((x) => x.b && x.b.data < oggi()); return vecchie.length ? h`<div class="banda">${icona('hourglass-half')}<div><b>${vecchie.length === 1 ? 'Una seduta non salvata' : vecchie.length + ' sedute non salvate'} di giorni passati</b>: ${vecchie.map((x) => `${x.p.name} (${formatoData(x.b.data)})`).join(', ')}. Restano solo su questo dispositivo finché non le salvi o le scarti (⋮ nella seduta).</div></div>` : ''; })()}
                ${pazienti().length > 6 ? h`<input class="cerca" type="search" placeholder="Cerca un bambino" value="${T.cerca}" data-cambio="cerca" aria-label="Cerca">` : ''}
                ${righe.length ? h`<div class="scheda">${righe}</div>`
                    : h`<div class="vuoto">${q ? 'Nessun bambino con questo nome.' : 'Ancora nessun bambino.'}</div>`}
                ${limitato() ? '' : h`<div class="bottoni" style="margin-top:14px">
                    <button class="bt" data-a="nuovo-bambino">${icona('user-plus')} Nuovo bambino</button>
                    <button class="bt" data-a="nuovo-gruppo">${icona('users')} Nuovo gruppo</button>
                    <button class="bt" data-a="vai-import">${icona('file-import')} Importa quaderni</button>
                </div>`}
            </main>`;
    }

    // ---------- gruppi ----------
    // Un gruppo è una cartella a sé (nome, membri, programma, storico) che si
    // sincronizza come un bambino. Ogni sua attività ha una riga per bambino:
    // sono le sue "sottoattività" (id = id del bambino), tenute allineate ai membri.
    const eGruppo = (p) => !!(p && p.gruppo);
    const membriDi = (g) => (g.membri || []).map((id) => paz(id)).filter(Boolean);
    function allineaMembri(g) {
        const membri = membriDi(g);
        P.programma(g).attivita.forEach((a) => {
            const prima = a.misure || [];
            a.misure = membri.map((b) => Object.assign({}, prima.find((m) => m.id === b.id) || {}, { id: b.id, nome: b.name, bambino: true }));
        });
    }
    // Presenti di oggi: tutti i membri, tranne quelli segnati assenti nella bozza
    const presente = (b, pid) => !(b.assenti || []).includes(pid);
    async function moduloGruppo(g) {
        const tutti = pazienti().filter((x) => !eGruppo(x)).sort((u, v) => String(u.name).localeCompare(String(v.name), 'it'));
        const gia = (g && g.membri) || [];
        return foglio(h`<form><h2>${g ? 'Modifica il gruppo' : 'Nuovo gruppo'}</h2>
            <label class="campo"><span>Nome del gruppo</span><input name="nome" required maxlength="80" value="${(g && g.name) || ''}" placeholder="es. Abilità sociali martedì" autocomplete="off" ${g ? '' : grezzo('autofocus')}></label>
            <div class="campo"><span>Bambini del gruppo</span>
                <div class="opzioni" style="max-height:40vh;overflow-y:auto">${tutti.map((x) => h`<label class="opzione"><input type="checkbox" name="m" value="${x.id}" ${gia.includes(x.id) ? grezzo('checked') : ''}><span class="corpo">${x.name}</span></label>`)}</div>
                <span class="sotto piccolo">In seduta, per ogni attività, una riga per bambino. I dati restano nella cartella del gruppo, separati per bambino.</span></div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${g ? 'Salva' : 'Crea'}</button></div></form>`,
        { invia: (form) => { const fd = new FormData(form); return { nome: String(fd.get('nome') || '').trim(), membri: fd.getAll('m') }; } });
    }

    // ---------- presa dati ----------
    // Learn unit contate: quante prove aspettano e cosa entra nei dati salvando ora
    function statoLU(att, v, t, ms) {
        if (!P.conAttesa(att, t)) return null;
        const n = +att.prove, prec = P.inAttesaDi(att, t, ms);
        const seq = v ? ((v.sequenza || '').length === v.v + v.p + v.x ? v.sequenza : 'V'.repeat(v.v) + 'P'.repeat(v.p) + 'X'.repeat(v.x)) : '';
        const d = P.dividiLU(prec && prec.seq, seq, n);
        return { n, prec, oggi: seq.length, blocchi: d.blocchi, resto: d.resto.length };
    }
    function previsione(p, att, v) {
        if (att.temporanea || att.mantenimento || !v || !haDati(v)) return null;
        const senza = !(att.target || []).length;
        const t = v.targetId ? att.target.find((x) => x.id === v.targetId) : null;
        if (!t && !senza) return null;
        const b = bozza(p.id);
        const serie = senza ? P.sedute(p, att) : P.sedute(p, att, t);
        if (P.criterioRaggiunto(serie, att.criterio)) return null;
        const lu = statoLU(att, v, t);
        const oggiS = lu ? lu.blocchi.map((bl) => ({ date: b.data + 'T12:00:00', percentage: Math.round(100 * P.contaRisposte(bl).v / bl.length) }))
            : [{ date: b.data + 'T12:00:00', percentage: Math.round(100 * v.v / (v.v + v.p + v.x)) }];
        return oggiS.length && P.criterioRaggiunto(serie.concat(oggiS), att.criterio) === b.data ? 'Con questi dati oggi raggiunge il criterio.' : null;
    }
    // In time delay la risposta non corretta è quella promptata, in indipendente è l'errore:
    // si punteggia solo corretta / promptata oppure corretta / errata
    const nonCorretta = (tipo) => (tipo === 'timedelay' ? 'P' : 'X');
    // Echo to tact: si segna se lo dice da solo (✓), se lo ripete in ecoico (e+) o se no (✗)
    const ecoico = (att) => att && att.risposte === 'ecoico';
    function tasti(att, tipo, k) {
        k = k || att.id;
        if (ecoico(att)) return h`<div class="tasti">
            <button class="tasto v" data-a="segna" data-id="${k}" data-r="V">✓<small>Autonoma</small></button>
            <button class="tasto p" data-a="segna" data-id="${k}" data-r="P">e+<small>Ecoica</small></button>
            <button class="tasto x" data-a="segna" data-id="${k}" data-r="X">✗<small>Errata</small></button>
        </div>`;
        return h`<div class="tasti due">
            <button class="tasto v" data-a="segna" data-id="${k}" data-r="V">✓<small>Corretta</small></button>
            ${nonCorretta(tipo) === 'P'
                ? h`<button class="tasto p" data-a="segna" data-id="${k}" data-r="P">P<small>${att.nomeP || 'Promptata'}</small></button>`
                : h`<button class="tasto x" data-a="segna" data-id="${k}" data-r="X">✗<small>Errata</small></button>`}
        </div>`;
    }
    // Cambiando strategia le risposte non corrette passano dall'una all'altra colonna
    function convertiVoce(v, tipo, att) {
        if (ecoico(att)) return;
        const da = nonCorretta(tipo) === 'P' ? 'X' : 'P', a = nonCorretta(tipo);
        const k = da.toLowerCase(), j = a.toLowerCase();
        if (!v[k]) return;
        v[j] += v[k]; v[k] = 0;
        v.sequenza = (v.sequenza || '').split(da).join(a);
        if (v.esiti) Object.keys(v.esiti).forEach((id) => { v.esiti[id] = v.esiti[id].split(da).join(a); });
    }

    function schedaAttivita(p, att) {
        const b = bozza(p.id);
        const ms = misure(att).filter((m) => !eGruppo(p) || presente(b, m.id));
        const vm = ms.map((m) => b.voci[att.id + '~' + m.id] || null);
        // con più prese dati, il target e le opzioni comuni si leggono dalla prima voce aperta
        const v = b.voci[att.id] || vm.find(Boolean);
        const c = att.temporanea ? null : P.targetCorrente(att);
        const t = v && v.targetId ? att.target.find((x) => x.id === v.targetId) : (c && c.target);
        const mant = att.mantenimento || (v ? v.mantenimento : (c && c.mantenimento));
        const aperta = T.aperte[att.id];
        const tot = !ms.length && v ? v.v + v.p + v.x : 0;
        const pct = tot ? Math.round(100 * v.v / tot) : null;
        const soglia = (att.criterio && att.criterio.soglia) || 90;
        const tipo = (v && v.sessionType) || att.sessionType;
        const senzaTarget = !att.temporanea && !(att.target || []).length;
        const valuta = !att.temporanea && !att.mantenimento && (senzaTarget || (t && t.stato === 'attivo'));
        const aCriterio = valuta && P.criterioDi(p, att, senzaTarget ? null : t);
        // ogni presa dati arriva a criterio per conto suo; l'attività quando ci arrivano tutte
        const critM = ms.map((m) => (valuta && !m.mantenimento ? P.criterioRaggiunto(P.sedute(p, att, senzaTarget ? undefined : t, m.id), att.criterio) : null));
        const nCrit = critM.filter(Boolean).length, nAcq = ms.filter((m) => !m.mantenimento).length;
        const giocabile = t && t.setId && setArchivio().some((x) => x.id === t.setId);
        const giaOggi = !att.temporanea && t ? P.sedute(p, att, t).filter((x) => P.giorno(x.date) === b.data) : [];
        const oggiV = giaOggi.reduce((n, x) => n + (x.correct || 0), 0), oggiT = giaOggi.reduce((n, x) => n + (x.total || 0), 0);
        const prev = ms.length ? null : previsione(p, att, v);
        const hint = suggerimentiDi(att, t).length;
        const passi = P.passiDi(t);
        const st = passi.length ? statoTA(v, passi) : null;
        const tdS = tipo === 'timedelay' ? tdOggi(att, v, t || null) : null;
        const lu = ms.length ? null : statoLU(att, v, t || null);
        return h`<div class="att ${haDati(v) || vm.some(haDati) ? 'con-dati' : ''} ${hint ? 'con-hint' : ''} ${T.tastiera && baseId(T.tastiera) === att.id ? 'da-tastiera' : ''}" data-att="${att.id}" style="--col:${P.coloreDi(p, att)}">
            ${hint ? h`<button class="ib hint-tasto ${T.suggerimenti[att.id] ? 'on' : ''}" data-a="suggerimenti" data-id="${att.id}" aria-expanded="${T.suggerimenti[att.id] ? 'true' : 'false'}" aria-label="Suggerimenti" title="Suggerimenti per chi somministra">${icona('lightbulb')}</button>` : ''}
            <button class="att-testa" data-a="apri-att" data-id="${att.id}" aria-expanded="${aperta ? 'true' : 'false'}">
                <span class="corpo">
                    <span class="nome"><span class="nome-testo">${att.nome}</span>
                        ${ecoico(att) ? h` <span class="pill">Echo to tact</span>` : tipo === 'timedelay' ? h` <span class="pill">T/D${tdS != null ? ' ' + sec(tdS) : ''}</span>` : ''}
                        ${att.field ? h` <span class="pill field" title="Field: ${att.field} stimoli fra cui scegliere">F${att.field}</span>` : ''}
                        ${att.temporanea ? h` <span class="pill grigia">solo oggi</span>` : ''}
                        ${att.stato && att.stato !== 'attivo' ? h` <span class="pill grigia">${att.stato}</span>` : ''}
                        ${mant ? h` <span class="pill arancio" title="${att.mantenimento ? 'Il dato si prende ma non entra nelle statistiche' : 'Il target ha già raggiunto il criterio: si registra come mantenimento finché non si apre il prossimo'}">mantenimento</span>` : ''}
                        ${aCriterio ? h` <span class="pill verde">${icona('flag-checkered')} criterio</span>` : nCrit ? h` <span class="pill verde chiara" title="${ms.filter((m, i) => critM[i]).map((m) => m.nome).join(', ')} a criterio">${icona('flag-checkered')} ${nCrit} di ${nAcq}</span>` : ''}
                    </span>
                    ${t ? h`<span class="target target-ora">${t.setId ? h`${icona(giocabile ? 'layer-group' : 'triangle-exclamation')} ` : ''}<span class="nome-testo">${t.testo}</span>${t.setId ? h` · ${etichettaModo(P.modoTarget(att, t))}` : ''}</span>` : (senzaTarget ? ''
                        : !att.temporanea ? h`<span class="target"><i>Nessun target in corso: aggiungilo dal programma.</i></span>` : '')}
                    ${modVar(att)}
                    ${att.promptVisivo ? h`<span class="target riga-prompt">P: ${casellePrompt(att.promptVisivo)}</span>` : ''}
                    ${st ? h`<span class="target ta-riga">${icona('list-ol')} passo <b>${st.i + 1}/${passi.length}</b> · ${st.passo.testo}${st.giri ? h` <span class="pill grigia">giro ${st.giri + 1}</span>` : ''}</span>` : ''}
                    ${lu && (lu.prec || lu.oggi) ? h`<span class="target lu-attesa">${icona('hourglass-half')} ${testoLU(lu)}</span>` : ''}
                    ${oggiT ? h`<span class="target">${icona('circle-check')} già oggi: ${oggiV}/${oggiT} (${Math.round(100 * oggiV / oggiT)}%)${(() => { const chi = [...new Set(giaOggi.map((x) => x.operatore).filter(Boolean))]; return chi.length ? h` <span class="chi">· ${chi.join(', ')}</span>` : ''; })()}</span>` : ''}
                </span>
                <span class="conto">${ms.length ? h`<span class="piccolo sotto conto-ms">${ms.map((m, i) => { const x = vm[i], n = x ? x.v + x.p + x.x : 0; return h`<span>${m.nome}: <b class="${n ? classePct(Math.round(100 * x.v / n), soglia) : ''}">${n ? Math.round(100 * x.v / n) + '%' : '—'}</b></span>`; })}</span>` : tot ? h`<b class="${classePct(pct, soglia)}">${pct}%</b><br><span class="piccolo sotto">${v.v}/${tot}${att.prove ? ' di ' + att.prove : ''}</span>`
                    : h`<span class="piccolo sotto prove-n" title="${att.prove ? 'LU da ' + att.prove + ' prove' : 'Dato in percentuale a ogni seduta'}">${att.prove ? h`${icona('layer-group')} ${att.prove}` : icona('percent')}</span>`}</span>
            </button>
            ${hint && T.suggerimenti[att.id] ? h`<div class="att-suggerimenti aperti">
                ${h`<div class="sugg-testo">
                    ${att.suggerimenti ? h`<p>${conCaselle(att.suggerimenti)}</p>` : ''}
                    ${t && t.suggerimento ? h`<p>${att.suggerimenti ? h`<b>${t.testo}:</b> ` : ''}${conCaselle(t.suggerimento)}</p>` : ''}
                    ${ms.filter((m) => m.suggerimenti).map((m) => h`<p><b>${m.nome}:</b> ${conCaselle(m.suggerimenti)}</p>`)}
                </div>`}
            </div>` : ''}
            ${aperta ? h`<div class="att-corpo">
                ${giocabile ? h`<button class="bt primario largo" style="margin-bottom:10px" data-a="gioca" data-id="${att.id}">${icona('play')} Somministra con l'app · ${etichettaModo(P.modoTarget(att, t))}</button>` : ''}
                ${t && t.setId && !giocabile ? h`<p class="sotto piccolo">Il set «${t.testo}» non è su questo dispositivo: scaricalo dai materiali o segna qui sotto.</p>` : ''}
                ${att.cronometro ? cronometro(att, v) : ''}
                ${st ? h`<div class="ta-ora in-scheda">
                    <small>Passo ${st.i + 1} di ${passi.length}${st.giri ? ` · giro ${st.giri + 1}` : ''}</small><b>${st.passo.testo}</b>
                    <span class="ta-punti">${passi.map((ps, k) => h`<i class="${k === st.i ? 'qui' : ''} ${((v && v.esiti && v.esiti[ps.id]) || '').slice(-1)}"></i>`)}</span>
                </div>` : ''}
                ${ms.length ? ms.map((m, i) => presaDati(p, att, t, tipo, m, vm[i], critM[i], soglia)) : h`${tasti(att, tipo)}
                ${righeCondizioni(condizioniDi(att, t), tipo, ecoico(att))}
                <div class="sotto-tasti">
                    <div class="sequenza ${ecoico(att) ? 'eco' : ''}" aria-label="Sequenza delle risposte">${(v ? v.sequenza : '').split('').map((r) => h`<i class="${r}"></i>`)}</div>
                    ${st ? h`<button class="ib" data-a="salta-passo" data-id="${att.id}" aria-label="Salta il passo" title="Salta il passo">${icona('forward')}</button>
                    <button class="ib" data-a="apri-ta" data-id="${att.id}" aria-label="Lista dei passi" title="Lista dei passi">${icona('list-ol')}</button>` : ''}
                    ${tipo === 'timedelay' ? h`<button class="bt piccolo fantasma td-voce" data-a="td-voce" data-id="${att.id}" title="Cambia il time delay o passa a indipendente">${icona('stopwatch')} ${tdS != null ? sec(tdS) : 'T/D ?'}</button>`
                        : !ecoico(att) ? h`<button class="bt piccolo fantasma td-voce" data-a="td-voce" data-id="${att.id}" title="Indipendente: tocca per passare a time delay">${icona('stopwatch')} Indip.</button>` : ''}
                    <button class="ib" data-a="annulla" data-id="${att.id}" aria-label="Annulla l'ultima" title="Annulla l'ultima">${icona('rotate-left')}</button>
                    <button class="ib" data-a="nota-voce" data-id="${att.id}" aria-label="Nota e opzioni" title="Nota e opzioni">${icona('pen')}</button>
                </div>`}
                ${prev ? h`<p class="avviso-criterio">${icona('flag-checkered')} ${prev}</p>` : ''}
                ${aCriterio ? (senzaTarget ? h`<p class="avviso-criterio">${icona('flag-checkered')} Criterio raggiunto il ${formatoData(aCriterio)}: dal programma puoi terminare l'attività o aggiungere un target.</p>`
                    : h`<p class="avviso-criterio">${icona('flag-checkered')} Criterio raggiunto il ${formatoData(aCriterio)}. <button class="bt piccolo" data-a="chiudi-target" data-id="${att.id}" data-t="${t.id}">Passa al prossimo target</button></p>`) : ''}
                ${!ms.length && v && (v.nota || v.decisione) ? h`<p class="nota-voce">${icona('note-sticky')} ${v.decisione ? h`<b>${v.decisione}</b> ` : ''}${conCaselle(v.nota)}</p>` : ''}
            </div>` : ''}
        </div>`;
    }
    // «Chi ha svolto»: si scrive liberamente o si toccano le persone (anche più di una)
    function sceltePersone(nomi, campo) {
        nomi = [...new Set(nomi.filter(Boolean))];
        return nomi.length ? h`<div class="scelte-chi" data-chi-per="${campo}">${nomi.map((n) => h`<button type="button" class="bt piccolo" data-chi="${n}">${n}</button>`)}</div>` : '';
    }
    function agganciaChi(el) {
        el.querySelectorAll('[data-chi-per]').forEach((box) => {
            const inp = el.querySelector(`[name="${box.dataset.chiPer}"]`);
            const lista = () => inp.value.split('+').map((x) => x.trim()).filter(Boolean);
            const segna = () => box.querySelectorAll('[data-chi]').forEach((b) => b.classList.toggle('on', lista().includes(b.dataset.chi)));
            box.addEventListener('click', (e) => {
                const b = e.target.closest('[data-chi]'); if (!b) return;
                const l = lista(), n = b.dataset.chi;
                inp.value = (l.includes(n) ? l.filter((x) => x !== n) : l.concat(n)).join(' + ');
                segna();
            });
            inp.addEventListener('input', segna); segna();
        });
    }
    // Le prove che non arrivano a una LU intera non si perdono: restano da parte e la completano la volta dopo
    function testoLU(lu) {
        const prima = lu.prec ? `${lu.prec.seq.length} ${lu.prec.seq.length === 1 ? 'prova tenuta' : 'prove tenute'} da parte dal ${formatoData(lu.prec.dal)} · ` : '';
        if (lu.blocchi.length) return prima + `salvando, ${lu.blocchi.length === 1 ? 'la LU' : lu.blocchi.length + ' LU'} da ${lu.n} ${lu.blocchi.length === 1 ? 'entra' : 'entrano'} nei dati`
            + (lu.resto ? `; ${lu.resto} ${lu.resto === 1 ? 'prova resta' : 'prove restano'} da parte per la prossima seduta` : '');
        const m = lu.n - lu.resto;
        return prima + `ancora ${m} ${m === 1 ? 'prova' : 'prove'} per la LU da ${lu.n}: se non ci arrivi, si completa nella prossima seduta`;
    }
    // sotto il nome: modalità e variante, discrete (se il nome non le dice già)
    function modVar(att) {
        const m = att.modalita ? M.trovaModalita(att.modalita, dizionario()) : null;
        const v = String(att.variante || '').trim();
        const n = M.normalizza(att.nome || '');
        const parti = [m && M.normalizza(m.nome) !== n ? m.nome : '', v && M.normalizza(v) !== n && (!m || M.normalizza(v) !== M.normalizza(m.nome)) ? v : ''].filter(Boolean);
        // la modalità nel colore dell'attività (--col della scheda); la variante solo se c'è
        const modo = parti[0] && m && parti[0] === m.nome ? parti[0] : '', vv = modo ? parti[1] : parti[0];
        return parti.length ? h`<span class="mod-var">${modo ? h`<span class="modalita">${modo}</span>` : ''}${vv ? h`<span class="variante">${modo ? h`<span class="sep">·</span> ` : ''}${vv}</span>` : ''}</span>` : '';
    }
    // Una delle prese dati dell'attività (es. Categorizzazione → «Categorizza», «Tact mix»)
    function presaDati(p, att, t, tipo, m, v, crit, soglia) {
        const k = att.id + '~' + m.id;
        const attM = attPerVoce(att, k), tm = tipoMisura(att, m);
        const tipoM = (v && v.sessionType) || tm.sessionType;
        const tot = v ? v.v + v.p + v.x : 0;
        const lu = statoLU(attM, v, t || null, m.id);
        return h`<div class="presa ${crit ? 'a-criterio' : ''} ${m.bambino ? 'compatta' : ''}">
            <div class="presa-testa"><b>${m.nome}</b>
                ${m.tipo ? h`<span class="pill">${tm.eco ? 'Echo to tact' : tipoM === 'timedelay' ? 'T/D' : 'Indip.'}</span>` : ''}
                ${m.mantenimento ? h`<span class="pill grigia" title="Il dato si prende ma resta fuori da statistiche e criterio">mantenimento</span>` : ''}
                ${m.field ? h`<span class="pill field" title="Field: ${m.field} stimoli">F${m.field}</span>` : ''}
                ${crit ? h`<span class="pill verde">${icona('flag-checkered')} criterio il ${formatoData(crit)}</span>` : ''}
                <span class="presa-conto">${tot ? h`<b class="${classePct(Math.round(100 * v.v / tot), soglia)}">${Math.round(100 * v.v / tot)}%</b> <span class="sotto">${v.v}/${tot}${attM.prove ? ' di ' + attM.prove : ''}</span>` : h`<span class="sotto prove-n" title="${attM.prove ? 'LU da ' + attM.prove + ' prove' : 'Dato in percentuale'}">${attM.prove ? h`${icona('layer-group')} ${attM.prove}` : icona('percent')}</span>`}</span></div>
            ${lu && (lu.prec || lu.oggi) ? h`<p class="sotto piccolo lu-attesa">${icona('hourglass-half')} ${testoLU(lu)}</p>` : ''}
            ${tasti(attM, tipoM, k)}
            ${righeCondizioni(Object.assign({}, condizioniDi(att, t), m.condizioni || {}), tipoM, tm.eco)}
            <div class="sotto-tasti">
                <div class="sequenza ${tm.eco ? 'eco' : ''}" aria-label="Sequenza delle risposte">${(v ? v.sequenza : '').split('').map((r) => h`<i class="${r}"></i>`)}</div>
                <button class="ib" data-a="annulla" data-id="${k}" aria-label="Annulla l'ultima di ${m.nome}" title="Annulla l'ultima">${icona('rotate-left')}</button>
                <button class="ib" data-a="nota-voce" data-id="${k}" aria-label="Nota e opzioni di ${m.nome}" title="Nota e opzioni">${icona('pen')}</button>
            </div>
            ${v && (v.nota || v.decisione) ? h`<p class="nota-voce">${icona('note-sticky')} ${v.decisione ? h`<b>${v.decisione}</b> ` : ''}${conCaselle(v.nota)}</p>` : ''}
        </div>`;
    }
    // ---------- cronometro per le attività di fluency ----------
    const tempoDi = (v) => (v && v.tempo ? (v.tempo.ms || 0) + (v.tempo.da ? Date.now() - v.tempo.da : 0) : 0);
    const mmss = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const secMmss = (sec) => mmss(Math.max(0, Math.round(sec)) * 1000);
    function alMinuto(v) {
        const min = tempoDi(v) / 60000;
        return min >= 0.25 && v ? (v.v / min).toFixed(1).replace('.', ',') : '—';
    }
    function cronometro(att, v) {
        const va = !!(v && v.tempo && v.tempo.da);
        return h`<div class="cronometro" data-crono="${att.id}">
            <span class="t">${mmss(tempoDi(v))}</span>
            <button class="bt piccolo ${va ? '' : 'primario'}" data-a="crono" data-id="${att.id}">${icona(va ? 'pause' : 'play')} ${va ? 'Pausa' : (tempoDi(v) ? 'Riprendi' : 'Avvia')}</button>
            <span class="sotto piccolo"><b data-al-minuto>${alMinuto(v)}</b> corrette al minuto</span>
        </div>`;
    }
    setInterval(() => {
        const r = document.querySelectorAll('#tice [data-crono]');
        if (!r.length) return;
        const p = paz(T.pid);
        if (!p) return;
        r.forEach((el) => {
            const v = bozza(p.id).voci[el.dataset.crono];
            if (!v || !v.tempo || !v.tempo.da) return;
            el.querySelector('.t').textContent = mmss(tempoDi(v));
            el.querySelector('[data-al-minuto]').textContent = alMinuto(v);
        });
    }, 1000);

    // Per il calendario: la seduta di un bambino in quel giorno è in corso (bozza) o già salvata?
    function statoSeduta(pid, g) {
        const p = paz(pid);
        if (!p) return null;
        const b = T.bozza && T.bozza.pid === pid ? T.bozza : leggiBozza(pid);
        const prove = b && b.data === g ? Object.values(b.voci).filter(haDati).reduce((n, v) => n + v.v + v.p + v.x, 0) : 0;
        const ultima = (p.history || []).map((x) => String(x.date || '')).filter((d) => d && P.giorno(d) === g).sort().pop();
        const ora = ultima && !/T12:00:00(\.000)?Z?$/.test(ultima) ? new Date(ultima).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
        return { prove, salvata: !!ultima, ora };
    }
    function riassunto(p) {
        const b = bozza(p.id);
        let corrette = 0, prove = 0, n = 0;
        // le attività in mantenimento non entrano nel conto delle LU della giornata
        Object.keys(b.voci).forEach((k) => { const v = b.voci[k], a = attivitaDi(p, k), mm = a ? misure(a).find((x) => x.id === msDi(k)) : null; if (haDati(v) && !(a && a.mantenimento) && !(mm && mm.mantenimento)) { n++; corrette += v.v; prove += v.v + v.p + v.x; } });
        return { corrette, prove, n };
    }
    // tutte le risposte della bozza, anche quelle in mantenimento
    const provaNonSalvate = (p) => { const b = leggiBozza(p.id) || (T.bozza && T.bozza.pid === p.id ? T.bozza : null); return b ? Object.values(b.voci).reduce((n, v) => n + (haDati(v) ? v.v + v.p + v.x : 0), 0) + episodiBozza(b) : 0; };
    function testoPiede(p) {
        const r = riassunto(p), ep = episodiBozza(bozza(p.id));
        const epT = ep ? `<b>${ep}</b> ${ep === 1 ? 'episodio' : 'episodi'}` : '';
        if (!r.n) return epT || 'Nessuna risposta ancora';
        return `<b>${r.prove}</b> prove · <b>${r.corrette}</b> corrette · ${r.n} attività${epT ? ' · ' + epT : ''}`;
    }
    function vistaSeduta() {
        const p = paz(T.pid);
        if (!p) { T.vista = 'bambini'; return vistaBambini(); }
        if (eGruppo(p)) allineaMembri(p);
        const b = bozza(p.id);
        allineaVoci(p);
        const lista = attivitaSeduta(p);
        const unica = lista.length === 1 && lista[0];
        const unicaGioco = unica && !unica.temporanea && schermoGrande() && ((P.targetCorrente(unica) || {}).target || {}).setId;
        if (unica && !unicaGioco && T.aperte[unica.id] === undefined) T.aperte[unica.id] = true;
        const perArea = perCategoria(lista);
        const nonOggi = b.data !== oggi();
        return h`${barra({ indietro: 'vai-ritorno', titolo: p.name,
                sotto: { testo: (nonOggi ? 'Seduta del ' : 'Oggi, ') + formatoData(b.data, true) + (chiDellaSeduta(p, b) ? ' · ' + chiDellaSeduta(p, b) : ''), azione: 'data' },
                destra: h`<button class="ib" data-a="apri-cartella" aria-label="Cartella clinica" title="Cartella clinica">${icona('chart-line')}</button>
                    <button class="ib" data-a="vai-programma" aria-label="Programma" title="Programma">${icona('list-check')}</button>
                    <button class="ib" data-a="menu-bambino" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main">
                ${testata((eGruppo(p) ? 'Gruppo · ' : 'Seduta · ') + (nonOggi ? 'del ' : 'oggi, ') + new Date(b.data + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) + (chiDellaSeduta(p, b) ? ' · ' + chiDellaSeduta(p, b) : ''), p.name, { azione: 'data' })}
                ${nonOggi ? h`<div class="banda">${icona('calendar-day')}<div>Stai registrando una seduta del <b>${formatoData(b.data, true)}</b>, non di oggi.</div></div>` : ''}
                ${eGruppo(p) ? h`<div class="presenti"><span class="sotto piccolo">Presenti oggi</span>${membriDi(p).map((x) => h`<button class="pill-presenza ${presente(b, x.id) ? 'si' : ''}" data-a="presente" data-pid="${x.id}" aria-pressed="${presente(b, x.id) ? 'true' : 'false'}">${presente(b, x.id) ? icona('check') : icona('xmark')} ${x.name}</button>`)}</div>` : ''}
                ${EST.noteSeduta ? EST.noteSeduta(p) : ''}
                ${EST.striscia ? EST.striscia(p) : ''}
                ${!P.programma(p).attivita.length && !C.attivi(p).length ? h`<div class="scheda imbottita">
                    <b>Nessun programma per ${p.name}.</b>
                    <p class="sotto">Crea le attività su cui lavorate, con i loro target, oppure importa il suo quaderno Numbers. Intanto puoi aggiungere attività solo per oggi.</p>
                    ${limitato() ? '' : h`<div class="bottoni"><button class="bt primario" data-a="vai-programma">${icona('list-check')} Crea il programma</button>
                    <button class="bt" data-a="vai-import">${icona('file-import')} Importa quaderno</button></div>`}</div>` : ''}
                ${perArea.map((g) => h`${perArea.length > 1 ? h`<h3>${g.area}</h3>` : ''}${g.att.map((a) => schedaAttivita(p, a))}`)}
                <button class="bt largo fantasma" style="margin-top:12px" data-a="aggiungi-oggi">${icona('plus')} Aggiungi un'attività per questa seduta</button>
            </main>
            ${tastoAnnulla(p)}
            ${pannelloTA(p)}
            <div class="piede"><div class="piede-dentro">
                <div class="riassunto" id="tice-riassunto">${grezzo(testoPiede(p))}</div>
                <button class="bt primario" data-a="termina">${icona('check')} Salva seduta</button>
            </div></div>`;
    }

    function annullaUltima(p, id) {
        const b = bozza(p.id), v = b.voci[id];
        if (!v || !v.sequenza) return;
        const u = v.sequenza.slice(-1);
        v.sequenza = v.sequenza.slice(0, -1);
        v[u.toLowerCase()] = Math.max(0, v[u.toLowerCase()] - 1);
        // task analysis: si torna sul passo annullato, da risegnare
        if (v.ordine && v.ordine.length) {
            const ps = v.ordine.pop(), giri = (v.giriPrima || []).pop();
            if (v.esiti && v.esiti[ps]) v.esiti[ps] = v.esiti[ps].slice(0, -1);
            const att = attivitaDi(p, id), passi = att ? passiVoce(att, v) : [];
            const k = passi.findIndex((x) => x.id === ps);
            if (k >= 0) v.passo = k;
            if (giri != null) v.giri = giri;
        }
        const ul = ultimeDi(b), k = ul.lastIndexOf(id);
        if (k >= 0) ul.splice(k, 1);
        if (navigator.vibrate) navigator.vibrate([6, 40, 6]);
        salvaBozza();
        aggiornaScheda(p, id);
    }
    function aggiornaScheda(p, id) {
        id = baseId(id);
        const el = radice().querySelector(`[data-att="${CSS.escape(id)}"]`);
        const att = attivitaDi(p, id);
        if (el && att) el.outerHTML = String(schedaAttivita(p, att));
        const r = document.getElementById('tice-riassunto');
        if (r) r.innerHTML = testoPiede(p);
        aggiornaSovra(p);
    }

    // ---------- modalità e categorie (js/tice-modalita.js) ----------
    // Nel centro il dizionario è condiviso dal custode; sul dispositivo da solo resta qui.
    const M = window.TiceModalita;
    function dizionario() {
        const d = EST.dizionario && EST.dizionario();
        if (d) return d;
        try { return JSON.parse(localStorage.getItem('tice_modalita') || 'null') || {}; } catch (e) { return {}; }
    }
    async function salvaDizionario(aggiunte) {
        if (!aggiunte || (!Object.keys(aggiunte.sinonimi || {}).length && !(aggiunte.modalita || []).length && !(aggiunte.categorie || []).length)) return;
        if (EST.dizionario && EST.dizionario()) return EST.salvaDizionario(aggiunte);
        localStorage.setItem('tice_modalita', JSON.stringify(M.unisci(dizionario(), aggiunte)));
    }
    // Le attività raggruppate per categoria, nell'ordine delle categorie
    function perCategoria(lista) {
        const diz = dizionario();
        const ordine = M.elenco(diz).categorie.map((c) => c.id);
        const gruppi = [];
        lista.forEach((a) => {
            const c = a.temporanea ? { id: '~oggi', nome: 'Aggiunte per oggi' }
                : M.categoriaDi(a, diz) || (a.area ? { id: '~' + a.area, nome: a.area } : { id: '~altre', nome: 'Altre attività' });
            let g = gruppi.find((x) => x.id === c.id);
            if (!g) gruppi.push(g = { id: c.id, area: c.nome, att: [] });
            g.att.push(a);
        });
        const pos = (g) => { const i = ordine.indexOf(g.id); return i >= 0 ? i : g.id === '~oggi' ? 999 : 500; };
        return gruppi.sort((a, b) => pos(a) - pos(b));
    }
    function opzioniModalita(scelta) {
        const E = M.elenco(dizionario());
        return E.categorie.map((c) => {
            const ms = E.modalita.filter((m) => m.categoria === c.id);
            return ms.length ? h`<optgroup label="${c.nome}">${ms.map((m) => h`<option value="${m.id}" ${scelta === m.id ? grezzo('selected') : ''}>${m.nome}</option>`)}</optgroup>` : '';
        });
    }
    // Scelta della modalità: un foglio con ricerca e filtro per categoria al posto della tendina
    async function scegliModalita(attuale) {
        const E = M.elenco(dizionario());
        const voce = (m, c) => h`<button type="button" class="opzione mod-voce ${m.id === attuale ? 'scelta' : ''}" data-foglio="${'m:' + m.id}" data-cat="${c.id}" data-testo="${(m.nome + ' ' + c.nome).toLowerCase()}">
            <span class="corpo">${m.nome}<small>${c.nome}</small></span>${m.id === attuale ? icona('check') : ''}</button>`;
        const cats = E.categorie.filter((c) => E.modalita.some((m) => m.categoria === c.id));
        const r = await foglio(h`<div class="sceglie-mod"><h2>Modalità</h2>
            <input class="cerca" type="search" placeholder="Cerca una modalità" aria-label="Cerca una modalità" data-mod-cerca autocomplete="off">
            <div class="mod-filtri" role="group" aria-label="Categoria"><button type="button" class="bt piccolo on" data-mod-cat="">Tutte</button>${cats.map((c) => h`<button type="button" class="bt piccolo" data-mod-cat="${c.id}">${c.nome}</button>`)}</div>
            <div class="opzioni mod-speciali">
                <button type="button" class="opzione ${!attuale ? 'scelta' : ''}" data-foglio="m:"><span class="corpo">Dal nome, in automatico<small>L'app la riconosce dal nome dell'attività</small></span></button>
            </div>
            <div class="mod-elenco">${cats.map((c) => h`<p class="eti mod-gruppo" data-gruppo="${c.id}">${c.nome}</p><div class="opzioni" data-gruppo-voci="${c.id}">${E.modalita.filter((m) => m.categoria === c.id).map((m) => voce(m, c))}</div>`)}</div>
            <p class="sotto mod-nessuna" hidden>Nessuna modalità con questo nome.</p>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button type="button" class="bt" data-foglio="m:+" data-mod-nuova-bt>${icona('plus')} Nuova modalità</button></div></div>`, {
            dopo: (f) => {
                let cat = '';
                const q = f.querySelector('[data-mod-cerca]');
                // con una categoria scelta (e magari un nome scritto) «nuova» la crea già lì
                const nb = f.querySelector('[data-mod-nuova-bt]');
                const aggiornaNuova = () => {
                    const nome = q.value.trim(), c = cats.find((x) => x.id === cat);
                    nb.dataset.foglio = 'm:+' + (c ? '|' + c.id + '|' + nome : nome ? '||' + nome : '');
                    nb.innerHTML = String(icona('plus')) + ' ' + (c || nome ? `Aggiungi ${nome ? '«' + esc(nome) + '»' : 'una modalità'}${c ? ' a ' + esc(c.nome) : ''}` : 'Nuova modalità');
                };
                const filtra = () => {
                    aggiornaNuova();
                    const t = q.value.trim().toLowerCase();
                    let n = 0;
                    f.querySelectorAll('.mod-voce').forEach((v) => { v.hidden = (cat && v.dataset.cat !== cat) || (t && !v.dataset.testo.includes(t)); if (!v.hidden) n++; });
                    f.querySelectorAll('[data-gruppo]').forEach((g) => { const vis = [...f.querySelectorAll(`[data-gruppo-voci="${g.dataset.gruppo}"] .mod-voce`)].some((v) => !v.hidden); g.hidden = !vis; g.nextElementSibling.hidden = !vis; });
                    f.querySelector('.mod-speciali').hidden = !!(t || cat);
                    f.querySelector('.mod-nessuna').hidden = n > 0;
                };
                q.addEventListener('input', filtra);
                f.querySelectorAll('[data-mod-cat]').forEach((b) => b.addEventListener('click', () => {
                    cat = b.dataset.modCat; f.querySelectorAll('[data-mod-cat]').forEach((x) => x.classList.toggle('on', x === b)); filtra();
                }));
                const sc = f.querySelector('.mod-voce.scelta'); if (sc) sc.scrollIntoView({ block: 'center' });
                if (matchMedia('(pointer: fine)').matches) q.focus();
            }
        });
        return r && r.indexOf('m:') === 0 ? r.slice(2) : null;   // «+|categoria|nome» per una nuova
    }

    // ---------- il programma: etichette (la schermata è in js/tice-home-programma.js) ----------
    const ETICHETTE_STATO = { attivo: 'in corso', sospeso: 'sospesa', terminato: 'terminata' };

    // ---------- viste e punti di aggancio per le estensioni (tice-centro.js) ----------
    const VISTE = { bambini: vistaBambini, seduta: vistaSeduta };
    const EST = {};
    // Gestori del cambio dei campi (data-cambio), aggiunti dai moduli con estendi({ cambi })
    const CAMBI = Object.create(null);
    // Le funzioni del modulo dell'attività e dei target (js/tice-home-modulo-attivita.js), chiamate al momento dell'uso
    const moduloAttivita = (...a) => EST.moduloAttivita(...a);
    const creaAttivitaDaModulo = (...a) => EST.creaAttivitaDaModulo(...a);
    const modalitaDaModulo = (...a) => EST.modalitaDaModulo(...a);
    // Fine seduta e salvataggio (js/tice-home-salvataggio.js)
    const proponiProssimo = (...a) => EST.proponiProssimo(...a);
    // Chi può cambiare il programma: sul dispositivo tutti; per i bambini del
    // centro lo decide il ruolo (le tirocinanti registrano, non modificano).
    const puoProgrammi = (p) => !EST.puoProgrammi || EST.puoProgrammi(p);
    // Versione semplice per le tirocinanti: presa dati, giochi e storico
    const limitato = () => !!(EST.limitato && EST.limitato());

    // ---------- disegno ----------
    function disegna() {
        const r = radice();
        if (!r) return;
        const alto = r.scrollTop;
        // le tabelle e le righe che scorrono di lato (orario del giorno, settimana tipo…) restano dove le si era portate
        const scorrevoli = () => [...r.querySelectorAll('.tt-griglia-box, .tt-settimana, .grafici-bambini, .scc-carta, [data-scorri]')];
        const chiave = (el, i, tutti) => el.className.split(' ')[0] + ':' + tutti.filter((x) => x.className.split(' ')[0] === el.className.split(' ')[0]).indexOf(el);
        const prima = T.vista === T.vistaDisegnata ? scorrevoli().map((el, i, tutti) => [chiave(el, i, tutti), el.scrollLeft, el.scrollTop]).filter((x) => x[1] || x[2]) : [];
        const f = VISTE[T.vista] || vistaBambini;
        r.innerHTML = String(f());
        T.vistaDisegnata = T.vista;
        if (prima.length) {
            const dopo = scorrevoli();
            prima.forEach(([k, sx, sy]) => { const el = dopo.find((x, i, tutti) => chiave(x, i, tutti) === k); if (el) { el.scrollLeft = sx; el.scrollTop = sy; } });
        }
        if (T.vista === 'grafici') { T.pidGrafici = T.pid; if (EST.montaGrafici) EST.montaGrafici(r); }
        if (EST.dopo) EST.dopo(T.vista, r);
        if (EST.dopoVista) EST.dopoVista(T.vista, r);
        if (T.mantieniScroll) r.scrollTop = alto;
        T.mantieniScroll = false;
    }
    function vai(vista, pid, daCronologia) {
        const prima = T.vista + '|' + T.pid;
        T.vista = vista;
        if (pid !== undefined) T.pid = pid;
        // ogni schermata è una voce della cronologia: il gesto «indietro» del telefono torna alla precedente
        if (!daCronologia && prima !== T.vista + '|' + T.pid) {
            const st = { tv: T.vista, tp: T.pid };
            // un foglio appena chiuso sta ancora togliendo la sua voce: si aspetta che abbia finito
            if (T.saltaPop) T.dopoPop = st; else { try { history.pushState(st, ''); } catch (e) { /* niente */ } }
        }
        radice().scrollTop = 0;
        disegna();
    }

    // =====================================================================
    // Azioni
    // =====================================================================
    const azioni = {
        // "casa" sono i turni del giorno; l'elenco completo dei bambini resta a un tocco
        'vai-bambini': () => vai(VISTE.turni ? 'turni' : 'bambini'),
        'vai-elenco': () => vai('bambini'),
        'schermo-intero': async () => {
            const d = document, el = d.documentElement;
            try {
                if (d.fullscreenElement || d.webkitFullscreenElement) await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen());
                else await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
            } catch (e) { avviso('Su questo dispositivo lo schermo intero non è consentito.', 'errore'); }
            T.mantieniScroll = true; disegna();
        },
        'vai-turni': () => vai('turni'),
        'vai-seduta': () => vai('seduta'),
        'vai-programma': () => vai('programma'),
        'apri-cartella': () => { if (T.pid) apriCartella(T.pid); },
        'vai-import': () => { if (!limitato()) vai('import'); },
        'apri-bambino': (b) => { T.aperte = {}; T.ritorno = T.vista === 'turni' ? 'turni' : 'bambini'; vai('seduta', b.dataset.pid); },
        // indietro dalla presa dati: dove si era (i turni del giorno o l'elenco dei bambini)
        'vai-ritorno': () => vai(T.ritorno === 'bambini' || !VISTE.turni ? 'bambini' : 'turni'),
        giochi: () => chiudi(),
        menu: async () => {
            const r = await foglio(h`<h2>Centro TICE</h2><div class="opzioni">
                <button class="opzione" data-foglio="giochi">${icona('gamepad')}<span class="corpo">Giochi e attività<small>Tutte le attività dell'app, con i set</small></span></button>
                <button class="opzione" data-foglio="grafici">${icona('chart-line')}<span class="corpo">Grafici<small>Tutti i bambini, uno dopo l'altro, con lo stesso grafico</small></span></button>
                <button class="opzione" data-foglio="cartelle">${icona('folder-open')}<span class="corpo">Cartelle cliniche<small>Grafici, giornate, diario, report</small></span></button>
                ${limitato() ? '' : h`<button class="opzione" data-foglio="import">${icona('file-import')}<span class="corpo">Importa quaderni Numbers</span></button>
                <button class="opzione" data-foglio="archivio">${icona('folder-open')}<span class="corpo">Archivio set</span></button>
                <button class="opzione" data-foglio="opzioni">${icona('gear')}<span class="corpo">Impostazioni e tema</span></button>`}
                ${limitato() ? '' : h`<button class="opzione" data-foglio="modalita">${icona('tags')}<span class="corpo">Categorie e modalità<small>Aggiungi categorie e tipi di attività, senza doppioni</small></span></button>`}
                <button class="opzione" data-foglio="schermo">${icona('expand')}<span class="corpo">Schermo<small>Dimensione dell'interfaccia e schermo intero</small></span></button>
                <button class="opzione" data-foglio="aspetto">${icona('pen-nib')}<span class="corpo">Aspetto · ${stile() === 'quaderno' ? 'quaderno' : 'classico'}<small>${stile() === 'quaderno' ? 'Torna all\'aspetto classico, senza righe e annotazioni' : 'Passa al quaderno: testate, righe a matita, annotazioni'}</small></span></button>
                ${EST.opzioniMenu ? EST.opzioniMenu() : ''}
                ${window.TicePwa && TicePwa.puoInstallare() ? h`<button class="opzione" data-foglio="installa">${icona('download')}<span class="corpo">Installa l'app<small>Si apre come un'app e funziona anche senza rete</small></span></button>` : ''}
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r && r.indexOf('est:') === 0 && EST.sceltaMenu) return EST.sceltaMenu(r.slice(4));
            if (r === 'installa') { TicePwa.installa(); return; }
            if (r === 'schermo') { await opzioniSchermo(); return; }
            if (r === 'aspetto') {
                try { localStorage.setItem('tice_stile', stile() === 'quaderno' ? 'classico' : 'quaderno'); } catch (e) { /* niente */ }
                applicaStile(); disegna();
                avviso(stile() === 'quaderno' ? 'Aspetto: quaderno' : 'Aspetto: classico');
                return;
            }
            if (r === 'modalita' && EST.gestisciModalita) { await EST.gestisciModalita(); disegna(); return; }
            if (r === 'giochi') chiudi();
            else if (r === 'cartelle') apriDaQui(openPatients);
            else if (r === 'grafici' && EST.apriGrafici) EST.apriGrafici();
            else if (r === 'import') vai('import');
            else if (r === 'archivio') apriDaQui(openLibrary);
            else if (r === 'opzioni') apriDaQui(openSettings);
        },
        'menu-bambino': async () => {
            const p = paz(T.pid);
            const r = await foglio(h`<h2>${p.name}</h2><div class="opzioni">
                <button class="opzione" data-foglio="programma">${icona('list-check')}<span class="corpo">Programma<small>Attività e target</small></span></button>
                ${VISTE.diario ? h`<button class="opzione" data-foglio="diario">${icona('book-open')}<span class="corpo">Diario<small>Note, da tenere a mente</small></span></button>` : ''}
                <button class="opzione" data-foglio="cartella">${icona('chart-line')}<span class="corpo">Cartella clinica<small>Grafici, giornate, report</small></span></button>
                <button class="opzione" data-foglio="giochi">${icona('gamepad')}<span class="corpo">Giochi con ${p.name}<small>Le sedute dei giochi vanno nella sua cartella</small></span></button>
                <button class="opzione" data-foglio="stampa">${icona('print')}<span class="corpo">Stampa le griglie<small>Per prendere i dati su carta e ricopiarli dopo</small></span></button>
                <button class="opzione" data-foglio="data">${icona('calendar-day')}<span class="corpo">Cambia la data della seduta<small>Per ricopiare un foglio di un altro giorno</small></span></button>
                ${(() => { const n = provaNonSalvate(p); return n ? h`<button class="opzione pericolo-testo" data-foglio="annulla">${icona('trash-can')}<span class="corpo">Scarta la seduta non salvata<small>${n} ${n === 1 ? 'risposta registrata' : 'risposte registrate'} e non ancora ${n === 1 ? 'salvata' : 'salvate'}: si cancellano, il resto resta com'è</small></span></button>` : ''; })()}
                ${limitato() ? '' : eGruppo(p) ? h`<button class="opzione" data-foglio="dati">${icona('users')}<span class="corpo">Modifica il gruppo<small>Nome e bambini</small></span></button>`
                    : h`<button class="opzione" data-foglio="dati">${icona('pen')}<span class="corpo">Modifica i dati del bambino<small>Nome, data di nascita, categoria</small></span></button>`}
                ${EST.opzioniBambino ? EST.opzioniBambino(p) : ''}
                ${!limitato() && !(EST.condiviso && EST.condiviso(p.id)) ? h`<button class="opzione" data-foglio="elimina">${icona('trash')}<span class="corpo">Elimina il bambino<small>Con il suo programma e le sue sedute, da questo dispositivo</small></span></button>` : ''}
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r && r.indexOf('est:') === 0 && EST.sceltaBambino) return EST.sceltaBambino(r.slice(4), p);
            if (r === 'programma') vai('programma');
            else if (r === 'cartella') apriCartella(p.id);
            else if (r === 'diario') azioni['vai-diario']();
            else if (r === 'giochi') { if (typeof setGlobalPatient === 'function') setGlobalPatient(p.id); chiudi(); }
            else if (r === 'data') azioni.data();
            else if (r === 'stampa') azioni['stampa-griglie']();
            else if (r === 'annulla') azioni['annulla-seduta']();
            else if (r === 'dati') azioni['modifica-bambino']();
            else if (r === 'elimina') azioni['elimina-bambino']();
        },
        'nuovo-gruppo': async () => {
            if (limitato()) return;
            const r = await moduloGruppo(null);
            if (!r || !r.nome) return;
            if (r.membri.length < 2) { avviso('Scegli almeno due bambini.', 'errore'); return; }
            const g = { id: 'g' + Date.now().toString(), name: r.nome, gruppo: true, membri: r.membri, history: [], programma: { attivita: [] } };
            await salvaPaziente(g);
            if (EST.nuovoBambino) await EST.nuovoBambino(g);
            if (typeof state !== 'undefined' && Array.isArray(state.patients) && !state.patients.some((x) => x.id === g.id)) state.patients.push(g);
            T.ritorno = 'bambini';
            vai('programma', g.id);
        },
        'modifica-gruppo': async () => {
            const g = paz(T.pid);
            if (!eGruppo(g) || limitato()) return;
            const r = await moduloGruppo(g);
            if (!r || !r.nome) return;
            if (r.membri.length < 1) { avviso('Il gruppo deve avere almeno un bambino.', 'errore'); return; }
            g.name = r.nome; g.membri = r.membri;
            allineaMembri(g);
            await salvaPaziente(g);
            avviso('Gruppo salvato');
            disegna();
        },
        'presente': (b) => {
            const p = paz(T.pid), bz = bozza(p.id);
            bz.assenti = bz.assenti || [];
            const id = b.dataset.pid;
            bz.assenti = bz.assenti.includes(id) ? bz.assenti.filter((x) => x !== id) : bz.assenti.concat([id]);
            salvaBozza(); T.mantieniScroll = true; disegna();
        },
        'modifica-bambino': async () => {
            const p = paz(T.pid);
            if (eGruppo(p)) return azioni['modifica-gruppo']();
            if (!p || limitato()) return;
            const r = await foglio(h`<form><h2>Dati del bambino</h2>
                <label class="campo"><span>Nome (o iniziali)</span><input name="nome" required maxlength="80" value="${p.name || ''}" autocomplete="off"></label>
                <label class="campo"><span>Data di nascita (facoltativa)</span><input name="nascita" type="date" value="${p.nascita || ''}" max="${oggi()}"></label>
                <label class="campo"><span>Categoria (facoltativa)</span><input name="cat" maxlength="60" value="${p.category || ''}" placeholder="es. Aula 1" list="tice-categorie"></label>
                <datalist id="tice-categorie">${[...new Set(pazienti().map((x) => x.category).filter(Boolean))].map((c) => h`<option value="${c}">`)}</datalist>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
            if (!r || !r.nome.trim()) return;
            p.name = r.nome.trim();
            if (r.nascita) p.nascita = r.nascita; else delete p.nascita;
            if (r.cat.trim()) p.category = r.cat.trim(); else delete p.category;
            await salvaPaziente(p);
            if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            avviso('Dati salvati');
            disegna();
        },
        'elimina-bambino': async () => {
            const p = paz(T.pid);
            if (!p || limitato()) return;
            const n = (p.history || []).length;
            if (!await conferma(`Eliminare ${p.name}?`, `${n ? `Le sue ${n} sedute e il programma vengono cancellati` : 'Il bambino viene cancellato'} da questo dispositivo. Non si può annullare.`, { ok: 'Elimina', pericolo: true })) return;
            await DB.deletePatient(p.id);
            if (typeof state !== 'undefined' && Array.isArray(state.patients)) state.patients = state.patients.filter((x) => x.id !== p.id);
            eliminaBozza(p.id);
            if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            avviso(`${p.name} eliminato`);
            vai('bambini');
        },
        'nuovo-bambino': async () => {
            if (limitato()) return;
            const r = await foglio(h`<form><h2>Nuovo bambino</h2>
                <label class="campo"><span>Nome (o iniziali)</span><input name="nome" required maxlength="80" autofocus autocomplete="off"></label>
                <label class="campo"><span>Data di nascita (facoltativa)</span><input name="nascita" type="date" max="${oggi()}"></label>
                <label class="campo"><span>Categoria (facoltativa)</span><input name="cat" maxlength="60" placeholder="es. Aula 1" list="tice-categorie"></label>
                <datalist id="tice-categorie">${[...new Set(pazienti().map((x) => x.category).filter(Boolean))].map((c) => h`<option value="${c}">`)}</datalist>
                ${EST.sceltaRiservato ? EST.sceltaRiservato() : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Crea</button></div></form>`);
            if (!r || !r.nome.trim()) return;
            const p = { id: Date.now().toString(), name: r.nome.trim(), history: [], programma: { attivita: [] } };
            if (r.cat.trim()) p.category = r.cat.trim();
            if (r.nascita) p.nascita = r.nascita;
            await salvaPaziente(p);
            if (EST.nuovoBambino) await EST.nuovoBambino(p, { riservato: r.visibilita === 'mio' });
            vai('programma', p.id);
        },
        'scc-att': async (b) => { const p = paz(T.pid); await graficoSCC(p, P.attivita(p, b.dataset.id), null); },
        'scc-target': async (b) => { const p = paz(T.pid); const att = P.attivita(p, b.dataset.id); await graficoSCC(p, att, att.target.find((x) => x.id === b.dataset.t)); },
        suggerimenti: (b) => {
            T.suggerimenti[b.dataset.id] = !T.suggerimenti[b.dataset.id];
            T.mantieniScroll = true;
            disegna();
        },
        'apri-att': (b) => {
            const id = b.dataset.id;
            // Su tablet e computer un'attività collegata a un set si apre direttamente nel gioco
            const p0 = paz(T.pid), a0 = attivitaDi(p0, id);
            const c0 = a0 && !a0.temporanea && P.targetCorrente(a0);
            const v0 = bozza(p0.id).voci[id];
            if (c0 && c0.target.setId && !haDati(v0) && schermoGrande() && setArchivio().some((x) => x.id === c0.target.setId)) {
                lancia(p0, a0, c0.target);
                return;
            }
            T.aperte[id] = !T.aperte[id];
            aggiornaScheda(paz(T.pid), id);
        },
        segna: (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            if (!att) return;
            const v = voce(p, att, b.dataset.id);
            const r = b.dataset.r;
            v[r.toLowerCase()] += 1;
            v.sequenza += r;
            ultimeDi(bozza(p.id)).push(b.dataset.id);
            // task analysis: si segna il passo corrente e si passa al successivo
            const passi = passiVoce(att, v);
            if (passi.length) {
                const st = statoTA(v, passi);
                v.esiti = v.esiti || {};
                v.esiti[st.passo.id] = (v.esiti[st.passo.id] || '') + r;
                (v.ordine || (v.ordine = [])).push(st.passo.id);
                (v.giriPrima || (v.giriPrima = [])).push(st.giri);
                if (st.i + 1 >= passi.length) { v.passo = 0; v.giri = st.giri + 1; } else v.passo = st.i + 1;
            }
            // fluency: il cronometro parte da solo alla prima risposta
            if (att.cronometro && !v.tempo) v.tempo = { ms: 0, da: Date.now() };
            if (navigator.vibrate) navigator.vibrate(r === 'V' ? 8 : 18);
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        crono: (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            if (!att) return;
            const v = voce(p, att);
            const t = v.tempo || (v.tempo = { ms: 0, da: null });
            if (t.da) { t.ms += Date.now() - t.da; t.da = null; } else t.da = Date.now();
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        gioca: (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = bozza(p.id).voci[att.id];
            const t = v && v.targetId ? att.target.find((x) => x.id === v.targetId) : (P.targetCorrente(att) || {}).target;
            if (t) lancia(p, att, t);
        },
        annulla: (b) => annullaUltima(paz(T.pid), b.dataset.id),
        'annulla-ultima': () => {
            const p = paz(T.pid);
            const u = ultimeDi(bozza(p.id));
            // la più recente ancora annullabile (un'attività tolta non conta)
            while (u.length) {
                const id = u[u.length - 1], v = bozza(p.id).voci[id];
                if (String(id).indexOf('comp:') === 0) { if (EST.annullaComportamento && EST.annullaComportamento(p, id.slice(5))) return; u.pop(); continue; }
                if (v && v.sequenza) { annullaUltima(p, id); return; }
                u.pop();
            }
        },
        'salta-passo': (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att), passi = passiVoce(att, v);
            if (!passi.length) return;
            const st = statoTA(v, passi);
            if (st.i + 1 >= passi.length) { v.passo = 0; v.giri = st.giri + 1; } else v.passo = st.i + 1;
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        'vai-passo': (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att);
            v.passo = +b.dataset.k || 0;
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        'apri-ta': (b) => { T.ta = { pid: T.pid, attId: b.dataset.id, nascosta: false, anima: true }; aggiornaSovra(paz(T.pid)); },
        'chiudi-ta': () => { T.ta = null; aggiornaSovra(paz(T.pid)); },
        'nascondi-ta': () => { if (T.ta) T.ta.nascosta = true; aggiornaSovra(paz(T.pid)); },
        'mostra-ta': () => { if (T.ta) { T.ta.nascosta = false; T.ta.anima = true; } aggiornaSovra(paz(T.pid)); },
        'td-voce': async (b) => {
            // strategia di oggi (time delay o indipendente) e secondi di attesa, per questa seduta o da oggi in poi
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att);
            const t = v.targetId ? (att.target || []).find((x) => x.id === v.targetId) : null;
            const tipoOra = ((v && v.sessionType) || att.sessionType) === 'timedelay' ? 'timedelay' : 'independent';
            const ora = tdOggi(att, v, t);
            const prog = att.temporanea ? null : P.tdDi(att);
            const aggiorna = !att.temporanea && puoProgrammi(p);
            const tipoProg = att.sessionType === 'timedelay' ? 'timedelay' : 'independent';
            const r = await foglio(h`<form><h2>Strategia · ${att.nome}</h2>
                <div class="campo"><span>Oggi si lavora in</span><div class="scelta">
                    <label><input type="radio" name="tipo" value="timedelay" ${tipoOra === 'timedelay' ? grezzo('checked') : ''}><span>Time delay</span></label>
                    <label><input type="radio" name="tipo" value="independent" ${tipoOra === 'independent' ? grezzo('checked') : ''}><span>Indipendente</span></label>
                </div><span class="sotto piccolo avviso-doppione" data-conversione></span></div>
                <div data-solo-td ${tipoOra === 'timedelay' ? '' : grezzo('hidden')}>
                    <label class="campo"><span>Secondi di attesa prima dell'aiuto</span><input name="sec" type="number" min="0" max="60" inputmode="numeric" value="${ora != null ? ora : ''}" ${tipoOra === 'timedelay' ? grezzo('autofocus') : ''}></label>
                    <div class="scelta-rapida">${[0, 1, 2, 3, 4, 5].map((n) => h`<button type="button" class="bt piccolo ${n === ora ? 'primario' : ''}" data-td-rapido="${n}">${sec(n)}</button>`)}</div>
                </div>
                ${aggiorna ? h`<label class="spunta-riga"><input type="checkbox" name="programma" checked> <span><b>Da oggi in poi</b><br><span class="sotto piccolo">Aggiorna il programma (ora ${tipoProg === 'timedelay' ? 'time delay' + (prog != null ? ' ' + sec(prog) : '') : 'indipendente'}): il cambio dei secondi resta segnato con la data. Senza spunta vale solo per questa seduta.</span></span></label>`
                    : h`<p class="sotto piccolo">Vale per questa seduta: il programma lo aggiorna la referente.</p>`}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
                dopo: (el) => {
                    el.querySelectorAll('[data-td-rapido]').forEach((x) => x.addEventListener('click', () => {
                        el.querySelector('[name=sec]').value = x.dataset.tdRapido;
                        el.querySelectorAll('[data-td-rapido]').forEach((y) => y.classList.toggle('primario', y === x));
                    }));
                    const td = el.querySelector('[data-solo-td]'), conv = el.querySelector('[data-conversione]');
                    el.querySelectorAll('[name=tipo]').forEach((x) => x.addEventListener('change', () => {
                        td.hidden = x.value !== 'timedelay';
                        if (!td.hidden) el.querySelector('[name=sec]').focus();
                        const n = x.value === 'timedelay' ? v.x : v.p;
                        conv.textContent = x.value !== tipoOra && n ? `Le ${n === 1 ? 'risposta già segnata' : n + ' risposte già segnate'} ${x.value === 'timedelay' ? '✗' : 'P'} ${n === 1 ? 'diventa' : 'diventano'} ${x.value === 'timedelay' ? 'P' : '✗'}.` : '';
                    }));
                }
            });
            if (!r) return;
            const nuovoTipo = r.tipo === 'timedelay' ? 'timedelay' : 'independent';
            const n = nuovoTipo === 'timedelay' ? P.secondiTD(r.sec) : null;
            if (nuovoTipo === 'timedelay' && n == null) { avviso('Scrivi i secondi di time delay'); return; }
            if (nuovoTipo !== tipoOra) { v.sessionType = nuovoTipo; convertiVoce(v, nuovoTipo, att); }
            if (n != null) v.tdSeconds = n; else delete v.tdSeconds;
            salvaBozza();
            if (r.programma && aggiorna) {
                const cambi = [];
                if (nuovoTipo !== tipoProg) { att.sessionType = nuovoTipo; cambi.push(nuovoTipo === 'timedelay' ? 'time delay' : 'indipendente'); }
                if (n != null && P.impostaTD(att, n, { chi: chiOpera(), il: bozza(p.id).data })) cambi.push('time delay a ' + sec(n));
                if (cambi.length) {
                    att.modificato = new Date().toISOString();
                    await salvaPaziente(p);
                    avviso(`${att.nome}: ${[...new Set(cambi)].join(', ')} da oggi`);
                }
            }
            aggiornaScheda(p, att.id);
        },
        'nota-voce': async (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att, b.dataset.id);
            const attV = attPerVoce(att, b.dataset.id);
            const targets = (att.target || []).filter((t) => t.stato === 'attivo' || t.stato === 'criterio' || t.stato === 'repertorio' || t.id === v.targetId);
            const tV = v.targetId ? (att.target || []).find((x) => x.id === v.targetId) : null;
            const msV = msDi(b.dataset.id), mV = misure(att).find((x) => x.id === msV);
            const attesaV = P.conAttesa(attV, tV) ? P.inAttesaDi(att, tV, msV) : null;
            const eco = ecoico(attV), tipoV = v.sessionType === 'timedelay' ? 'timedelay' : 'independent';
            const calV = EST.chiDi ? await EST.chiDi(p.id, bozza(p.id).data).catch(() => ({ nomi: [], persone: [] })) : { nomi: [], persone: [] };
            const r = await foglio(h`<form class="modulo-att"><h2>${att.nome}${mV ? h` <span class="sotto">· ${mV.nome}</span>` : ''}</h2>
                <label class="campo"><span>Nota</span><textarea name="nota" maxlength="2000" rows="3">${v.nota || ''}</textarea></label>
                <label class="campo"><span>Decisione (facoltativa)</span><input name="decisione" maxlength="200" value="${v.decisione || ''}" placeholder="es. Passa a 1&quot; T/D" list="tice-decisioni"></label>
                <datalist id="tice-decisioni"><option value='Passa a 0" T/D'><option value='Passa a 1" T/D'><option value='Passa a 2" T/D'><option value="Probe"><option value="Stop"></datalist>
                <label class="campo campo-chi"><span>Svolta da <small class="sotto">· solo se diversa da chi ha svolto la seduta</small></span><input name="operatore" maxlength="120" value="${v.operatore || ''}" placeholder="${chiDellaSeduta(p, bozza(p.id)) || 'Nome'}" autocomplete="off"></label>
                ${sceltePersone(calV.nomi.concat(calV.persone), 'operatore')}
                <details class="sez apribile"><summary><span class="sez-titolo">Correggi i dati</span> <span class="sotto piccolo">${[targets.length > 1 ? 'target' : '', eco ? '' : 'tipo', 'conteggi', attesaV ? 'prove in attesa' : ''].filter(Boolean).join(', ')}</span></summary>
                    ${targets.length > 1 ? h`<label class="campo"><span>Target registrato</span><select name="targetId">
                        ${targets.map((t) => h`<option value="${t.id}" ${t.id === v.targetId ? grezzo('selected') : ''}>${t.testo} (${P.STATI_TARGET[t.stato]})</option>`)}</select></label>` : ''}
                    ${eco ? '' : h`<div class="campo"><span>Tipo di seduta</span><div class="scelta">
                        <label><input type="radio" name="tipo" value="independent" ${tipoV === 'independent' ? grezzo('checked') : ''}><span>Indipendente</span></label>
                        <label><input type="radio" name="tipo" value="timedelay" ${tipoV === 'timedelay' ? grezzo('checked') : ''}><span>Time delay</span></label>
                    </div><span class="sotto piccolo avviso-doppione" data-conversione></span></div>`}
                    <div class="riga-campi conteggi">
                        <label class="campo"><span>✓ ${eco ? 'Autonome' : 'Corrette'}</span><input name="v" type="number" min="0" max="999" inputmode="numeric" value="${v.v}"></label>
                        ${eco ? h`<label class="campo"><span>e+ Ecoiche</span><input name="eco" type="number" min="0" max="999" inputmode="numeric" value="${v.p}"></label>
`
                            : ''}
                        <label class="campo"><span>Totale</span><input name="tot" type="number" min="0" max="999" inputmode="numeric" value="${v.v + v.p + v.x}"></label>
                    </div>
                    ${attesaV ? h`<label class="spunta-riga"><input type="checkbox" name="scarta"> <span><b>Scarta le ${attesaV.seq.length} prove in attesa</b><br><span class="sotto piccolo">Registrate dal ${formatoData(attesaV.dal)} senza arrivare a una LU da ${attV.prove}: non entreranno nei dati.</span></span></label>` : ''}
                </details>
                ${att.temporanea ? h`<button type="button" class="bt pericolo" data-foglio="togli" style="width:100%">Togli dalla seduta</button>` : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
                dopo: (el) => {
                    agganciaChi(el);
                    // cambiando tipo: l'etichetta dei conteggi e cosa succede alle risposte già segnate
                    const conv = el.querySelector('[data-conversione]'), et = el.querySelector('[data-etichetta-no]');
                    el.querySelectorAll('[name=tipo]').forEach((x) => x.addEventListener('change', () => {
                        const n = x.value === 'timedelay' ? v.x : v.p;
                        conv.textContent = x.value !== tipoV && n ? `Cambiando tipo, ${n} ${n === 1 ? 'risposta' : 'risposte'} ${x.value === 'timedelay' ? '✗' : 'P'} ${n === 1 ? 'diventa' : 'diventano'} ${x.value === 'timedelay' ? 'P' : '✗'}.` : '';
                    }));
                }
            });
            if (r === 'togli') {
                const bz = bozza(p.id);
                bz.temp = bz.temp.filter((x) => x.id !== att.id);
                delete bz.voci[att.id];
                salvaBozza(); T.mantieniScroll = true; disegna();
                return;
            }
            if (!r) return;
            if (r.targetId && r.targetId !== v.targetId) {
                const tt = att.target.find((x) => x.id === r.targetId);
                // il target è dell'attività: vale per tutte le sue prese dati
                const bz = bozza(p.id);
                Object.keys(bz.voci).filter((x) => baseId(x) === att.id).map((x) => bz.voci[x]).concat([v]).forEach((x) => {
                    x.targetId = r.targetId; x.mantenimento = !!(tt && tt.stato !== 'attivo');
                });
            }
            if (!eco) v.sessionType = r.tipo === 'timedelay' ? 'timedelay' : 'independent';
            convertiVoce(v, v.sessionType, attV);
            const no = ecoico(attV) ? 'x' : nonCorretta(v.sessionType).toLowerCase();
            const nv = Math.max(0, Math.min(999, parseInt(r.v, 10) || 0));
            // si scrivono corrette e totale: le non corrette sono la differenza, del tipo giusto
            const ne = ecoico(attV) ? Math.max(0, Math.min(999, parseInt(r.eco, 10) || 0)) : v.p;
            const ntot = Math.max(nv + (ecoico(attV) ? ne : 0), Math.min(999, parseInt(r.tot, 10) || 0));
            const nn = ntot - nv - (ecoico(attV) ? ne : 0);
            if (nv !== v.v || nn !== v[no] || ne !== v.p) {
                v.p = ne;
                // la sequenza non corrisponde più ai conteggi: la si ricostruisce in blocco
                v.v = nv; v[no] = nn;
                v.sequenza = 'V'.repeat(v.v) + 'P'.repeat(v.p) + 'X'.repeat(v.x);
            }
            v.decisione = r.decisione.trim();
            v.nota = r.nota.trim();
            if (String(r.operatore || '').trim()) v.operatore = String(r.operatore).trim(); else delete v.operatore;
            if (r.scarta && attesaV && att.inAttesa) {
                delete att.inAttesa[P.chiaveAttesa(tV, msV)];
                if (!Object.keys(att.inAttesa).length) delete att.inAttesa;
                await salvaPaziente(p);
            }
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        data: async () => {
            const p = paz(T.pid);
            const b = bozza(p.id);
            const r = await foglio(h`<form><h2>Data della seduta</h2>
                <p class="sotto">Per registrare dal foglio una seduta di un altro giorno.</p>
                <label class="campo"><span>Data</span><input type="date" name="data" required value="${b.data}" max="${oggi()}"></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Conferma</button></div></form>`);
            if (!r || !r.data) return;
            b.data = r.data;
            salvaBozza();
            disegna();
        },
        // scarta la bozza: solo ciò che non è ancora salvato (le sedute già salvate e il programma non si toccano)
        'annulla-seduta': async () => {
            const p = paz(T.pid);
            const n = provaNonSalvate(p), b = bozza(p.id);
            const att = Object.keys(b.voci).filter((k) => haDati(b.voci[k])).length;
            if (!n && !b.temp.length && !b.extra.length) { avviso('Non c\'è niente da scartare'); return; }
            if (!await conferma('Scartare la seduta non salvata?', `${n ? `Si cancellano ${n} ${n === 1 ? 'risposta' : 'risposte'} in ${att} ${att === 1 ? 'attività' : 'attività'}` : 'Si tolgono le attività aggiunte per oggi'}${b.data !== oggi() ? ' (seduta del ' + formatoData(b.data) + ')' : ''}. Le sedute già salvate e il programma restano come sono. Non si può annullare.`, { ok: 'Scarta la seduta', pericolo: true })) return;
            eliminaBozza(p.id);
            T.aperte = {};
            disegna();
            avviso('Seduta scartata');
        },
        'aggiungi-oggi': async () => {
            const p = paz(T.pid);
            const b = bozza(p.id);
            const inSeduta = new Set(attivitaSeduta(p).map((a) => a.id));
            const dalProgramma = P.programma(p).attivita.filter((a) => !inSeduta.has(a.id));
            const nomiTemp = new Set(b.temp.map((t) => t.nome));
            const liste = (state.savedSets || []).filter((s) => (s.modes || []).includes('quaderno') && !(s.modes || []).includes('quaderno_task'));
            const daListe = [];
            liste.forEach((s) => (s.items || []).forEach((it) => {
                const n = String(it.name || it.label || '').trim();
                if (n && !nomiTemp.has(n) && !daListe.some((x) => x.nome === n)) daListe.push({ nome: n, lista: s.name, sessionType: it.sessionType });
            }));
            const opz = (a) => h`<button type="button" class="opzione" data-foglio="${'p:' + a.id}"><span class="corpo">${a.nome}<small>${ETICHETTE_STATO[a.stato] || a.stato}${a.area ? ' · ' + a.area : ''}</small></span>${icona('plus')}</button>`;
            const sospese = dalProgramma.filter((a) => a.stato !== 'terminato');
            const terminate = dalProgramma.filter((a) => a.stato === 'terminato');
            const r = await foglio(h`<form><h2>Aggiungi per questa seduta</h2>
                <div class="campo"><span>Modalità <small class="sotto">· come per le attività del programma</small></span>
                    <input type="hidden" name="modalita" value=""><button type="button" class="campo-in scegli-mod" data-mod-oggi><span>Scegli o aggiungi una modalità</span>${icona('magnifying-glass')}</button></div>
                <label class="campo"><span>Nome per oggi <small class="sotto">· facoltativo se hai scelto la modalità</small></span><input name="nome" maxlength="120" placeholder="Nome dell'attività" list="tice-liste" autocomplete="off"></label>
                <datalist id="tice-liste">${daListe.map((x) => h`<option value="${x.nome}">${x.lista}</option>`)}</datalist>
                <div class="scelta" style="margin-bottom:10px">
                    <label><input type="radio" name="tipo" value="independent" checked><span>Indipendente</span></label>
                    <label><input type="radio" name="tipo" value="timedelay"><span>Time delay</span></label></div>
                ${puoProgrammi(p) ? h`<label style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="programma"> Aggiungila anche al programma</label>` : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Aggiungi</button></div>
                ${sospese.length ? h`<h3>Sospese nel programma</h3><div class="opzioni">${sospese.map(opz)}</div>` : ''}
                ${terminate.length ? h`<details style="margin-top:12px"><summary class="sotto">Riprendi un'attività terminata (${terminate.length})</summary><div class="opzioni" style="margin-top:6px">${terminate.map(opz)}</div></details>` : ''}
                </form>`, { dopo: (f) => {
                    // la modalità si sceglie dallo stesso foglio del programma (con ricerca e «nuova»); il nome si compila da sé
                    const bt = f.querySelector('[data-mod-oggi]'), hid = f.querySelector('[name=modalita]'), nome = f.querySelector('[name=nome]');
                    let autoNome = '';
                    bt.addEventListener('click', async () => {
                        const v = await scegliModalita(hid.value && hid.value.indexOf('+') !== 0 ? hid.value : '');
                        if (v == null) return;
                        const [scelta, cat, nuovo] = v.split('|');
                        let nm = '';
                        if (scelta === '+') {
                            nm = String(nuovo || nome.value || '').trim();
                            let catN = cat || '';
                            if (!nm || !catN) {
                                // nome e categoria della nuova modalità, in un foglio dell'app
                                const rm = await foglio(h`<form><h2>Nuova modalità</h2>
                                    <label class="campo"><span>Nome</span><input name="nm" required maxlength="60" value="${nm}" autofocus placeholder="es. Lettura sillabe" autocomplete="off"></label>
                                    <div class="campo"><span>Categoria</span>${sceltaCategoria('mod_cat', catN || 'altro')}
                                    ${campoNuovaCategoria('mod_cat')}
                                    <span class="sotto piccolo avviso-doppione" data-doppione-nota></span></div>
                                    <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Aggiungi</button></div></form>`, { dopo: agganciaNuove });
                                if (!rm || !String(rm.nm || '').trim()) return;
                                nm = String(rm.nm).trim();
                                try { catN = await categoriaDalModulo(rm, 'mod_cat'); } catch (e) { catN = 'altro'; }
                            }
                            const giaC = stessaModalita(nm);
                            if (giaC) { avviso(`«${giaC.nome}» esiste già: uso quella`); }
                            hid.value = '+|' + (catN || 'altro') + '|' + nm;
                            bt.innerHTML = `<span>Nuova: ${esc(nm)}</span>${icona('magnifying-glass')}`;
                        } else if (scelta) {
                            const m = M.trovaModalita(scelta, dizionario());
                            hid.value = scelta; nm = m ? m.nome : '';
                            bt.innerHTML = `<span>${esc(nm)}${m ? ` <small>${esc(nomeCategoria(m.categoria))}</small>` : ''}</span>${icona('magnifying-glass')}`;
                        } else { hid.value = ''; bt.innerHTML = `<span>Scegli o aggiungi una modalità</span>${icona('magnifying-glass')}`; }
                        if (nm && (!nome.value.trim() || nome.value === autoNome)) { nome.value = nm; autoNome = nm; }
                    });
                } });
            if (!r) return;
            if (typeof r === 'string' && r.startsWith('p:')) {
                b.extra.push(r.slice(2));
                T.aperte[r.slice(2)] = true;
            } else {
                let modalita = String(r.modalita || '');
                if (modalita.indexOf('+|') === 0) {
                    const [, cat, nm] = modalita.split('|');
                    try { modalita = await creaModalita(nm, cat || 'altro') || ''; } catch (e) { avviso('Modalità non creata: ' + (e.message || e), 'errore'); modalita = ''; }
                }
                const mod = modalita ? M.trovaModalita(modalita, dizionario()) : null;
                const nome = String(r.nome || '').trim() || (mod ? mod.nome : '');
                if (!nome) { avviso('Scegli una modalità o scrivi il nome', 'errore'); return; }
                const tipo = r.tipo === 'timedelay' ? 'timedelay' : 'independent';
                if (r.programma) {
                    const att = P.nuovaAttivita(p, { nome, sessionType: tipo });
                    if (modalita) att.modalita = modalita; else modalitaDaModulo(att, {});
                    await salvaPaziente(p);
                    T.aperte[att.id] = true;
                } else {
                    const id = P.nuovoId('tmp');
                    b.temp.push(Object.assign({ id, nome, sessionType: tipo }, modalita ? { modalita } : {}));
                    T.aperte[id] = true;
                }
            }
            salvaBozza();
            T.mantieniScroll = true;
            disegna();
        },
        'chiudi-target': async (b) => {
            const p = paz(T.pid);
            const att = P.attivita(p, b.dataset.id);
            const t = att && att.target.find((x) => x.id === b.dataset.t);
            if (!t) return;
            await proponiProssimo(p, att, t, P.criterioDi(p, att, t));
            // le risposte di oggi già segnate sul target appena chiuso: restano lì o passano al nuovo?
            const c = P.targetCorrente(att), bz = bozza(p.id);
            const giaOggi = Object.keys(bz.voci).filter((k) => baseId(k) === att.id && bz.voci[k].targetId === t.id && haDati(bz.voci[k]));
            if (c && !c.mantenimento && c.target.id !== t.id && giaOggi.length) {
                const n = giaOggi.reduce((x, k) => x + bz.voci[k].v + bz.voci[k].p + bz.voci[k].x, 0);
                const r = await foglio(h`<div><h2>Le risposte di oggi</h2>
                    <p>Oggi hai già segnato ${n} ${n === 1 ? 'risposta' : 'risposte'} su <b>${t.testo}</b>. Dove vanno?</p>
                    <div class="opzioni"><button type="button" class="opzione" data-foglio="nuovo">${icona('arrow-right')}<span class="corpo">Su «${c.target.testo}»<small>Il nuovo target: si continua da qui</small></span></button>
                    <button type="button" class="opzione" data-foglio="resta">${icona('flag-checkered')}<span class="corpo">Restano su «${t.testo}»<small>Come mantenimento, per tutta questa seduta: il nuovo target parte dalla prossima</small></span></button></div></div>`);
                if (r === 'nuovo') giaOggi.forEach((k) => { bz.voci[k].targetId = c.target.id; bz.voci[k].mantenimento = false; });
                else if (r === 'resta') {
                    giaOggi.forEach((k) => { bz.voci[k].mantenimento = true; });
                }
                salvaBozza();
            }
            T.mantieniScroll = true;
            disegna();
        }
    };

    // ---------- set dell'archivio ----------
    const eLista = (s) => (s.modes || []).some((m) => m === 'quaderno' || m === 'quaderno_task');
    function setArchivio() {
        return ((typeof state !== 'undefined' && state.savedSets) || []).filter((s) => !eLista(s))
            .sort((a, b) => String(a.cat || a.category || '').localeCompare(String(b.cat || b.category || ''), 'it') || String(a.name).localeCompare(String(b.name), 'it'));
    }
    const etichettaModo = (m) => (typeof getModeLabel === 'function' ? getModeLabel(m) : m);

    // Il nome delle sedute segue quello dell'attività e del target
    function rinominaSedute(p, att) {
        const perTarget = {};
        (att.target || []).forEach((t) => { perTarget[t.id] = t; });
        (p.history || []).forEach((s) => {
            if (s.attivitaId !== att.id) return;
            const t = s.targetId ? perTarget[s.targetId] : null;
            if (t && t.setId) return; // le sedute di un set portano il nome del set
            s.setName = P.nomeSet(att, t);
            s.setCat = (M.categoriaDi(att, dizionario()) || {}).nome || att.area || s.setCat;
        });
    }



    // ---------- Standard Celeration Chart di un target o di un'attività ----------
    function celerazioneTarget(p, att, t) {
        if (!window.TiceSCCGrafico || !window.TiceSCCDati) return '';
        const sedute = P.sedute(p, att, t);
        if (sedute.length < TiceSCC.MIN_PUNTI) return '';
        const d = TiceSCCGrafico.distintivo(sedute, TiceSCCDati.fasiPer(p, { chiave: 't:' + t.id, att }), TiceSCCDati.nomiTarget(p));
        return d ? h` <button class="scc-distintivo ${d.verso}" data-a="scc-target" data-id="${att.id}" data-t="${t.id}" title="${d.titolo}">${d.testo}</button>` : '';
    }
    async function graficoSCC(p, att, t) {
        if (!window.TiceSCCGrafico) return;
        const chiave = t ? 't:' + t.id : 'a:' + att.id;
        const sedute = P.sedute(p, att, t || undefined);
        const g = { chiave, att, target: t };
        await foglio(h`<h2>${t ? t.testo : att.nome}</h2>
            <p class="sotto piccolo">${t ? att.nome + ' · ' : 'Tutta l\'attività · '}${sedute.length} ${sedute.length === 1 ? 'seduta' : 'sedute'}</p>
            <div class="scc" data-scc></div>
            <div class="bottoni" style="margin-top:12px"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`, {
            dopo: (f) => TiceSCCGrafico.pannello(f.querySelector('[data-scc]'), {
                titolo: t ? t.testo : att.nome, sedute, fasi: TiceSCCDati.fasiPer(p, g), nomi: TiceSCCDati.nomiTarget(p),
                obiettivo: TiceSCCDati.obiettivo(att, sedute), puoModificare: puoProgrammi(p),
                nomeFile: p.name + ' - ' + (t ? t.testo : att.nome),
                alAggiungiFase: (fs) => TiceSCCDati.aggiungiFase(p, chiave, fs), alTogliFase: (id) => TiceSCCDati.togliFase(p, id)
            })
        });
        T.mantieniScroll = true;
        disegna();
    }

    // ---------- categorie e modalità nuove, senza doppioni ----------
    // Un nome uguale a meno di maiuscole, accenti e spazi è la stessa cosa
    const stessaModalita = (nome) => { const n = M.normalizza(nome); return n ? M.elenco(dizionario()).modalita.find((m) => M.normalizza(m.nome) === n) : null; };
    const stessaCategoria = (nome) => { const n = M.normalizza(nome); return n ? M.elenco(dizionario()).categorie.find((c) => M.normalizza(c.nome) === n) : null; };
    const nomeCategoria = (id) => (M.elenco(dizionario()).categorie.find((c) => c.id === id) || {}).nome || '';
    async function creaCategoria(nome) {
        nome = String(nome || '').trim().slice(0, 60);
        if (!nome) return null;
        const c = stessaCategoria(nome);
        if (c) return c.id;
        const id = M.nuovoId(nome);
        await salvaDizionario({ categorie: [{ id, nome }], modalita: [], sinonimi: {} });
        return id;
    }
    async function creaModalita(nome, categoria) {
        nome = String(nome || '').trim().slice(0, 60);
        if (!nome) return null;
        const m = stessaModalita(nome);
        if (m) return m.id;
        const id = M.nuovoId(nome);
        await salvaDizionario({ modalita: [{ id, nome, categoria: categoria || 'altro' }], sinonimi: {} });
        return id;
    }
    // Il campo "categoria" dei moduli: le esistenti o una nuova scritta sul posto
    function sceltaCategoria(nome, scelta) {
        const E = M.elenco(dizionario());
        return h`<select class="campo-in" name="${nome}" data-cat-scelta aria-label="Categoria">${E.categorie.map((c) => h`<option value="${c.id}" ${scelta === c.id ? grezzo('selected') : ''}>${c.nome}</option>`)}<option value="+">+ Nuova categoria…</option></select>`;
    }
    const campoNuovaCategoria = (nome) => h`<input class="campo-in" name="${nome + '_nuova'}" maxlength="60" placeholder="Nome della nuova categoria" hidden data-cat-nuova data-doppione="categoria" autocomplete="off">`;
    // Avvisi dal vivo sui doppioni e campi che compaiono con le scelte "+ nuova"
    function agganciaNuove(el) {
        el.querySelectorAll('[data-cat-scelta]').forEach((sel) => {
            const nuova = sel.closest('.campo').querySelector('[data-cat-nuova]');
            const mostra = () => { nuova.hidden = sel.value !== '+'; if (!nuova.hidden) nuova.focus(); };
            sel.addEventListener('change', mostra);
        });
        el.querySelectorAll('[data-doppione]').forEach((inp) => {
            const nota = inp.closest('.campo').querySelector('[data-doppione-nota]');
            if (!nota) return;
            const prova = () => {
                const x = inp.dataset.doppione === 'categoria' ? stessaCategoria(inp.value) : stessaModalita(inp.value);
                // un avviso per campo: due campi nello stesso riquadro non si cancellano a vicenda
                if (!x) { if (nota.dataset.di === inp.name) { nota.textContent = ''; delete nota.dataset.di; } return; }
                nota.dataset.di = inp.name;
                nota.textContent = inp.dataset.doppione === 'categoria' ? `Esiste già la categoria «${x.nome}»: verrà usata quella.` : `Esiste già «${x.nome}» in ${nomeCategoria(x.categoria)}: verrà usata quella.`;
            };
            inp.addEventListener('input', prova);
            prova();
        });
    }
    async function categoriaDalModulo(r, campo) {
        return r[campo] === '+' ? creaCategoria(r[campo + '_nuova']) : r[campo];
    }
    // le caselle: «prima | poi | dopo» → tre quadrati con la parola sotto
    // Le caselle in mezzo a un testo qualsiasi: «… prompt X | X | X (campanella)» →
    // «… prompt» □ □ □ «(campanella)». Ogni casella prende la parola accanto alla |.
    function conCaselle(testo) {
        const t = String(testo || '');
        if (t.indexOf('|') < 0) return t;
        if (t.indexOf('\n') >= 0) return t.split('\n').map((r, i) => h`${i ? h`<br>` : ''}${conCaselle(r)}`);
        const parti = t.split('|');
        const prima = parti[0].replace(/\s+$/, ''), ultima = parti[parti.length - 1].replace(/^\s+/, '');
        const mP = /^(.*?)(\[[^\]]*\]|\S+)$/.exec(prima) || ['', '', prima], mU = /^(\[[^\]]*\]|\S+)(.*)$/.exec(ultima) || ['', ultima, ''];
        const voci = [mP[2]].concat(parti.slice(1, -1).map((x) => x.trim()), [mU[1]]);
        return h`${mP[1]}<span class="caselle-prompt">${voci.map(casella)}</span>${mU[2]}`;
    }
    // [X] fra parentesi quadre va dentro la casella; senza parentesi va sotto
    const casella = (x) => (/^\[.*\]$/.test(x || '') ? h`<span class="casella"><i class="dentro">${x.slice(1, -1)}</i></span>`
        : h`<span class="casella"><i></i>${x ? h`<small>${x}</small>` : ''}</span>`);
    const casellePrompt = (pv) => {
        const parti = String(pv || '').split(/[|,·]/).map((x) => x.trim()).filter(Boolean);
        return h`<span class="caselle-prompt" title="Prompt visivo">${parti.length > 1 ? parti.map(casella) : h`<span class="casella-testo">${pv}</span>`}</span>`;
    };
    // Cosa vale come ✓, P/e+ e ✗: per attività e sottoattività (vuoto = nessuna indicazione)
    function impostaCondizioni(o, v, pp, x) {
        const c = {}; [['V', v], ['P', pp], ['X', x]].forEach(([k, t]) => { t = String(t || '').trim().slice(0, 200); if (t) c[k] = t; });
        if (Object.keys(c).length) o.condizioni = c; else delete o.condizioni;
    }
    // in seduta, sotto i tasti: solo le risposte che quell'attività usa
    // quelle dell'attività, sovrascritte una per una da quelle del target in corso
    const condizioniDi = (att, t) => (att.condizioni || (t && t.condizioni) ? Object.assign({}, att.condizioni || {}, (t && t.condizioni) || {}) : null);
    function righeCondizioni(c, tipo, eco) {
        if (!c) return '';
        const usate = eco ? ['V', 'P', 'X'] : ['V', nonCorretta(tipo)];
        const segno = { V: '✓', P: eco ? 'e+' : 'P', X: '✗' };
        const r = usate.filter((k) => c[k]);
        return r.length ? h`<p class="condizioni">${r.map((k) => h`<span class="cond ${k.toLowerCase()}"><b>${segno[k]}</b> ${conCaselle(c[k])}</span>`)}</p>` : '';
    }

    // Stampa: il foglio va in un contenitore che in stampa è l'unica cosa visibile
    async function stampa(contenuto) {
        if (!contenuto) { avviso('Niente da stampare con queste scelte.'); return; }
        let box = document.getElementById('tice-stampa');
        if (!box) { box = document.createElement('div'); box.id = 'tice-stampa'; document.body.appendChild(box); }
        box.innerHTML = contenuto;
        document.documentElement.classList.add('tice-stampa-in-corso');
        const fine = () => { document.documentElement.classList.remove('tice-stampa-in-corso'); box.innerHTML = ''; window.removeEventListener('afterprint', fine); };
        window.addEventListener('afterprint', fine);
        try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* si stampa lo stesso */ }
        await Promise.all([...box.querySelectorAll('img')].map((i) => i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; })));
        if (typeof window.print !== 'function') { fine(); avviso('Su questo dispositivo la stampa non è disponibile: apri l\'app dal browser.', 'errore'); return; }
        window.print();
    }

    const chiOpera = () => { try { return localStorage.getItem('tice_operatore') || ''; } catch (e) { return ''; } };
    const sec = (n) => n + '″';
    // Il time delay di oggi: quello cambiato in seduta, altrimenti quello del programma
    const tdOggi = (att, v, t) => {
        const d = v ? P.secondiTD(v.tdSeconds) : null;
        return d != null ? d : P.tdDi(att, t === undefined ? undefined : (t || null));
    };

    // Chi ha svolto la seduta: dai turni del calendario, se c'è qualcuno in turno con il bambino
    const chiCache = {};
    function chiDalCalendario(pid, data) {
        const k = pid + '|' + data;
        if (!EST.chiDi) return { nomi: [], persone: [] };
        if (!chiCache[k] || Date.now() - chiCache[k].il > 120000) {
            const prima = chiCache[k] || { nomi: [], persone: [] };
            chiCache[k] = Object.assign({}, prima, { il: Date.now() });
            EST.chiDi(pid, data).then((r) => { const cambiato = (r.nomi || []).join() !== (prima.nomi || []).join(); chiCache[k] = Object.assign(r, { il: Date.now() }); if (cambiato && T.vista === 'seduta' && T.pid === pid) TiceHome.ridisegna(); })
                .catch(() => { /* resta quello di prima */ });
        }
        return chiCache[k];
    }
    const chiDellaSeduta = (p, b) => (b.operatore ? b.operatore : chiDalCalendario(p.id, b.data).nomi.join(' + '));



    // ---------- somministrare con l'app un target collegato a un set ----------
    const schermoGrande = () => window.matchMedia('(min-width: 768px)').matches;
    function lancia(p, att, t) {
        const modo = P.modoTarget(att, t);
        const set = setArchivio().find((x) => x.id === t.setId);
        if (!set || !modo) { avviso('Set o gioco non disponibili su questo dispositivo.', 'errore'); return; }
        const v = bozza(p.id).voci[att.id];
        const tipo = (v && v.sessionType) || att.sessionType || 'independent';
        T.lancio = { pid: p.id, attId: att.id, targetId: t.id, setId: t.setId, mode: modo, n: (p.history || []).length, nome: att.nome, testo: t.testo };
        salvaLancio();
        chiudi();
        try {
            if (typeof setGlobalPatient === 'function') setGlobalPatient(p.id);
            if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            selectModeFromDropdown(modo);
            const campo = document.getElementById('session-type-select');
            if (campo) { campo.value = tipo === 'timedelay' ? 'timedelay' : 'independent'; onSessionTypeChange(); }
            const secCtrl = document.getElementById('td-seconds-ctrl');
            const td = tdOggi(att, v, t);
            if (secCtrl && td != null) secCtrl.value = td;
            selectSetFromDropdown(t.setId);
        } catch (e) {
            console.error(e);
            avviso('Non sono riuscito ad aprire il gioco: ' + e.message, 'errore');
        }
        aggiornaLinguetta();
    }
    function salvaLancio() {
        try { if (T.lancio) sessionStorage.setItem('tice_lancio', JSON.stringify(T.lancio)); else sessionStorage.removeItem('tice_lancio'); } catch (e) { /* niente */ }
    }
    function aggiornaLinguetta() {
        let l = document.getElementById('tice-linguetta');
        if (!l) {
            l = document.createElement('button');
            l.id = 'tice-linguetta';
            l.className = 'tice-linguetta';
            l.type = 'button';
            l.addEventListener('click', () => apri());
            // trascinandola verso il basso si apre la presa dati, come una tendina
            let y0 = null;
            l.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
            l.addEventListener('touchmove', (e) => { if (y0 != null && e.touches[0].clientY - y0 > 30) { y0 = null; apri(); } }, { passive: true });
            document.body.appendChild(l);
        }
        const L = T.lancio;
        l.innerHTML = String(h`${icona('chevron-down')} <b>Presa dati</b>${L ? h` <span>· ${L.nome} · ${L.testo}</span>` : ''}`);
        l.hidden = !radice().hidden;
        // i suggerimenti dell'attività in gioco, senza uscire dal gioco
        let lb = document.getElementById('tice-hint-gioco');
        const pL = L && paz(L.pid), aL = pL && P.attivita(pL, L.attId), tL = aL && (aL.target || []).find((x) => x.id === L.targetId);
        const testi = aL ? suggerimentiDi(aL, tL) : [];
        if (!lb) {
            lb = document.createElement('div');
            lb.id = 'tice-hint-gioco';
            lb.className = 'tice-hint-gioco';
            lb.innerHTML = '<button type="button" class="tasto-hint" aria-expanded="false" title="Suggerimenti per chi somministra"></button><div class="fumetto" hidden></div>';
            lb.firstChild.addEventListener('click', () => {
                const f = lb.querySelector('.fumetto');
                f.hidden = !f.hidden;
                lb.firstChild.setAttribute('aria-expanded', String(!f.hidden));
            });
            document.body.appendChild(lb);
        }
        lb.firstChild.innerHTML = String(icona('lightbulb'));
        lb.querySelector('.fumetto').innerHTML = String(h`<b>${L ? L.nome : ''}</b>${testi.map((x) => h`<p>${x}</p>`)}`);
        lb.hidden = !testi.length || !radice().hidden;
        if (lb.hidden) lb.querySelector('.fumetto').hidden = true;
    }
    // Le sedute salvate dal gioco lanciato da qui vengono collegate all'attività
    // e al target del programma; poi si torna alla presa dati.
    function agganciaSalvataggi() {
        if (typeof DB === 'undefined' || DB._tice) return;
        const originale = DB.savePatient.bind(DB);
        DB._tice = true;
        DB.savePatient = async (p) => {
            const L = T.lancio;
            let nuove = [];
            if (L && p && p.id === L.pid && !T.salvandoQui) {
                nuove = (p.history || []).slice(L.n).filter((s) => !s.attivitaId && (s.setId === L.setId || s.mode === L.mode));
                nuove.forEach((s) => { s.attivitaId = L.attId; s.targetId = L.targetId; s.fonte = 'app-gioco'; });
            }
            const r = await originale(p);
            if (nuove.length) {
                T.lancio = null;
                salvaLancio();
                const tot = nuove.reduce((n, s) => n + (s.total || 0), 0), ok = nuove.reduce((n, s) => n + (s.correct || 0), 0);
                setTimeout(async () => {
                    await apri();
                    vai('seduta', L.pid);
                    avviso(`${L.nome}: ${ok}/${tot} salvato dal gioco`);
                    const pp = paz(L.pid), att = pp && P.attivita(pp, L.attId), t = att && att.target.find((x) => x.id === L.targetId);
                    if (t && t.stato === 'attivo') {
                        const data = P.criterioDi(pp, att, t);
                        if (data === P.oggi()) { await proponiProssimo(pp, att, t, data); disegna(); }
                    }
                }, 350);
            }
            return r;
        };
    }

    // Cartelle, archivio e impostazioni aperti da qui: alla chiusura si torna qui
    let tornaQui = false;
    function apriDaQui(apertura) { chiudi(); tornaQui = true; return apertura(); }
    ['closePatients', 'closeLibrary', 'closeSettings'].forEach((nome) => {
        const originale = window[nome];
        if (typeof originale !== 'function') return;
        window[nome] = function () {
            const r = originale.apply(this, arguments);
            if (tornaQui) { tornaQui = false; apri(); }
            return r;
        };
    });
    function apriCartella(pid) {
        apriDaQui(() => openPatients().then(() => { if (typeof selectPatientModal === 'function') selectPatientModal(pid); }));
    }

    // ---------- eventi ----------

    function suClick(e) {
        // l'ultima attività toccata riceve i tasti della tastiera
        if (T.vista === 'seduta' && e.target.closest) {
            const seg = e.target.closest('[data-a="segna"]'), box = e.target.closest('.att[data-att]');
            const nuova = seg ? seg.dataset.id : box ? box.dataset.att : (e.target.closest('#tice-ta') && T.ta ? T.ta.attId : null);
            if (nuova && nuova !== T.tastiera) { T.tastiera = nuova; if (EST.segnaScelta) EST.segnaScelta(); }
        }
        const b = e.target.closest('[data-a]');
        if (!b || !radice().contains(b)) return;
        const f = azioni[b.dataset.a];
        if (!f) return;
        e.preventDefault();
        Promise.resolve(f(b, e)).catch((err) => { console.error(err); avviso(err.message || String(err), 'errore'); });
    }
    function suCambio(e) {
        const el = e.target;
        const c = el.dataset && el.dataset.cambio;
        if (!c) return;
        if (c === 'grafici-bambino') {
            if (e.type !== 'change') return;
            T.pid = el.value; T.mantieniScroll = true; disegna();
        } else if (c === 'cerca') {
            T.cerca = el.value;
            const pos = el.selectionStart;
            disegna();
            const n = radice().querySelector('[data-cambio=cerca]');
            if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* niente */ } }
        } else if (CAMBI[c]) {
            CAMBI[c](el, e);
        }
    }

    // ---------- apertura e chiusura ----------
    async function apri() {
        await caricaPazienti();
        const r = radice();
        r.hidden = false;
        document.body.classList.add('tice-aperto');
        disegna();
        aggiornaLinguetta();
    }
    function chiudi() {
        salvaBozza();
        radice().hidden = true;
        document.body.classList.remove('tice-aperto');
        if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
        aggiornaLinguetta();
    }
    // ---------- schermo: dimensione dell'interfaccia e schermo intero (per dispositivo) ----------
    const SCALE = [['0.9', 'Piccola'], ['1', 'Normale'], ['1.15', 'Grande'], ['1.3', 'Molto grande']];
    const leggiPref = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const scriviPref = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* solo per questa volta */ } };
    function applicaScala() {
        const z = parseFloat(leggiPref('tice_scala') || '1');
        document.documentElement.style.zoom = z && z !== 1 ? String(z) : '';
    }
    const puoSchermoIntero = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    const aSchermoIntero = () => !!document.fullscreenElement;
    function schermoIntero(si) {
        try {
            if (si && !aSchermoIntero()) return document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
            if (!si && aSchermoIntero()) return document.exitFullscreen().catch(() => {});
        } catch (e) { /* non disponibile */ }
        return Promise.resolve();
    }
    // Nell'app installata su telefono e tablet lo schermo intero è la scelta di partenza:
    // alcuni browser (Firefox per Android) lasciano le barre di sistema anche con il manifest
    const installata = () => ['fullscreen', 'standalone', 'minimal-ui'].some((m) => window.matchMedia && matchMedia('(display-mode: ' + m + ')').matches);
    const touch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    // su telefono (schermo piccolo e touch) di partenza sì, nel browser o nell'app installata; su computer no
    const telefono = () => touch() && Math.min(screen.width, screen.height) < 820;
    // automatico solo sul telefono (lì si può spegnere); sul computer mai, anche se un tempo era stato acceso:
    // resta il tasto ⛶ nella barra in alto
    const vuoleSchermoIntero = () => telefono() && leggiPref('tice_schermo_intero') !== '0';
    // Il browser concede lo schermo intero solo dopo un tocco: si chiede al primo
    // tocco, e di nuovo quando l'app torna in primo piano (Android lo toglie uscendo)
    function schermoInteroAlTocco() {
        if (!puoSchermoIntero()) return;
        const arma = () => {
            if (!vuoleSchermoIntero() || aSchermoIntero()) return;
            document.addEventListener('pointerup', () => { if (vuoleSchermoIntero() && !aSchermoIntero()) schermoIntero(true); }, { capture: true, once: true });
        };
        arma();
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') arma(); });
        ['fullscreenchange', 'webkitfullscreenchange'].forEach((t) => document.addEventListener(t, () => { if (!radice().hidden) { T.mantieniScroll = true; disegna(); } }));
        document.addEventListener('fullscreenchange', () => { if (!aSchermoIntero()) setTimeout(arma, 300); });
    }
    async function opzioniSchermo() {
        const z = leggiPref('tice_scala') || '1', fs = vuoleSchermoIntero();
        const r = await foglio(h`<form><h2>Schermo</h2>
            <div class="campo"><span>Dimensione dell'interfaccia</span><div class="scelta">
                ${SCALE.map(([v, n]) => h`<label><input type="radio" name="scala" value="${v}" ${v === z ? grezzo('checked') : ''}><span>${n}</span></label>`)}
            </div><span class="sotto piccolo">Vale solo per questo dispositivo: più grande sui telefoni, più piccola sui monitor grandi.</span></div>
            ${puoSchermoIntero() && telefono() ? h`<label class="spunta-riga"><input type="checkbox" name="intero" ${fs ? grezzo('checked') : ''}> <span><b>Schermo intero</b><br><span class="sotto piccolo">Senza barre del browser e di sistema. Si attiva al primo tocco dopo l'apertura; per uscire, scorri dal bordo dello schermo (o Esc sul computer).</span></span></label>`
                : puoSchermoIntero() ? h`<p class="sotto piccolo">Sul computer lo schermo intero non parte da solo: usa il tasto ${icona('expand')} nella barra in alto (Esc per uscire).</p>`
                : h`<p class="sotto piccolo">Su questo dispositivo lo schermo intero non è disponibile: aggiungi l'app alla schermata Home per aprirla senza barre del browser.</p>`}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        { dopo: (el) => el.querySelectorAll('[name=scala]').forEach((x) => x.addEventListener('change', () => { document.documentElement.style.zoom = x.value === '1' ? '' : x.value; })) });
        if (!r) { applicaScala(); return; }
        scriviPref('tice_scala', r.scala && r.scala !== '1' ? r.scala : null);
        applicaScala();
        if (puoSchermoIntero() && telefono()) {
            scriviPref('tice_schermo_intero', r.intero ? '1' : '0');
            await schermoIntero(!!r.intero);
        }
    }
    applicaScala();
    schermoInteroAlTocco();

    // Il tasto/gesto «indietro» di Android (e lo swipe dell'app installata) non deve chiudere
    // l'app: si tiene sempre una voce in più nella cronologia e, quando viene consumata,
    // si fa quello che farebbe la freccia ← (o si chiude il foglio aperto) e la si rimette.
    // Solo dalla schermata iniziale l'indietro esce davvero.
    // Indietro (gesto o tasto del telefono): chiude il foglio in cima, se no torna alla schermata
    // precedente. Le voci si aggiungono quando si tocca qualcosa, così i browser non le saltano.
    function agganciaIndietro() {
        try { history.replaceState({ tv: T.vista, tp: T.pid }, ''); } catch (e) { /* niente */ }
        window.addEventListener('popstate', (e) => {
            if (T.saltaPop) {   // foglio chiuso dall'app: la voce era sua
                T.saltaPop--;
                if (!T.saltaPop && T.dopoPop) { try { history.pushState(T.dopoPop, ''); } catch (er) { /* niente */ } T.dopoPop = null; }
                return;
            }
            const fogli = document.querySelectorAll('.tice-foglio-sfondo');
            if (fogli.length) {
                const f = fogli[fogli.length - 1];
                // «Scartare le modifiche?» può fermarlo: allora la voce del foglio torna
                try { history.pushState(Object.assign({}, e.state, { tf: ((e.state && e.state.tf) || 0) + 1 }), ''); } catch (er) { /* niente */ }
                if (f._chiudiIndietro) f._chiudiIndietro();
                return;
            }
            const st = e.state || {};
            if (radice().hidden) { apri(); return; }   // dai giochi si torna al Centro TICE
            if (st.tv && VISTE[st.tv]) vai(st.tv, st.tp, true);
        });
    }
    async function avvia() {
        const r = radice();
        if (!r) return;
        // dito sullo schermo: i ridisegni chiesti dalla sincronizzazione aspettano la fine del gesto (e dello scorrimento)
        let fineTocco = null;
        document.addEventListener('touchstart', () => { T.tocco = true; clearTimeout(fineTocco); }, { passive: true, capture: true });
        const rilascia = () => {
            clearTimeout(fineTocco);
            fineTocco = setTimeout(() => {
                T.tocco = false;
                if (T.ridisegnaDopo) { T.ridisegnaDopo = false; window.TiceHome.ridisegna(); }
            }, 700);   // lo scorrimento per inerzia continua un attimo dopo il dito
        };
        document.addEventListener('touchend', rilascia, { passive: true, capture: true });
        document.addEventListener('touchcancel', rilascia, { passive: true, capture: true });
        r.addEventListener('click', suClick);
        r.addEventListener('input', suCambio);
        r.addEventListener('change', suCambio);
        r.addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.chiusi) T.chiusiAperti[d.dataset.chiusi] = d.open; }, true);
        window.addEventListener('pagehide', salvaBozza);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvaBozza(); });
        agganciaSalvataggi();
        agganciaIndietro();
        try { T.lancio = JSON.parse(sessionStorage.getItem('tice_lancio') || 'null'); } catch (e) { T.lancio = null; }
        await apri();
    }

    window.TiceHome = {
        apri, chiudi, vai: (v, pid) => { apri().then(() => vai(v, pid)); },
        estendi(e) {
            Object.assign(VISTE, e.viste || {});
            Object.assign(azioni, e.azioni || {});
            Object.assign(CAMBI, e.cambi || {});
            Object.assign(EST, e.aggancio || {});
        },
        attuale: () => ({ vista: T.vista, pid: T.pid }),
        ridisegna: () => {
            if (radice().hidden) return;
            // mentre si tocca o si scorre lo schermo si aspetta: un ridisegno a metà gesto lo interrompe
            if (T.tocco) { T.ridisegnaDopo = true; return; }
            T.mantieniScroll = true; disegna();
        },
        strumenti: { agganci: EST, haDati, misure, convertiVoce, oggi, msDi, eliminaBozza, timbro, riassunto, episodiBozza, statoLU, classePct, sceltePersone, agganciaChi, celerazioneTarget, stampa, lancia, graficoSCC, proponiProssimo: (...a) => proponiProssimo(...a), perCategoria, opzioniModalita, scegliModalita, rinominaSedute, setArchivio, etichettaModo, impostaCondizioni, allineaMembri, sec, nuovoBambino: (...a) => (EST.nuovoBambino ? EST.nuovoBambino(...a) : undefined), salvaDizionario, sceltaCategoria, campoNuovaCategoria, agganciaNuove, stessaModalita, stessaCategoria, nomeCategoria, categoriaDalModulo, creaModalita, creaCategoria, viste: VISTE, iniziali, pazientiAula, azioni, attivitaDi, voce, ecoico, attPerVoce, passiVoce, statoTA, aggiornaScheda, annullaUltima, baseId, dizionario: () => dizionario(), ETICHETTE_STATO, moduloAttivita: (p, att, base) => moduloAttivita(p, att, base), creaAttivitaDaModulo: (p, r) => creaAttivitaDaModulo(p, r), bozza, salvaBozza, ultimeDi, eGruppo, testoPiede, tastoAnnulla, secMmss, radice, disegna, h, grezzo, icona, foglio, conferma, avviso, barra, vai: (v, pid) => vai(v, pid), paz, pazienti, pazientiAula, salvaPaziente, esc, chiOpera: () => chiOpera(), puoProgrammi: (p) => puoProgrammi(p), formatoData, T, stampa, statoSeduta, testata, limitato: () => limitato(), banner: () => (EST.banner ? EST.banner() : '') }
    };
    if (document.readyState === 'complete') avvia();
    else window.addEventListener('load', avvia);
})();
