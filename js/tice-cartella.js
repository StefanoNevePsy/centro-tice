/**
 * Centro TICE — la cartella del bambino: i suoi dati, giorno per giorno.
 * Sostituisce l'apertura della vecchia cartella clinica (js/patients.js), che resta
 * raggiungibile dal collegamento «Report, Excel e strumenti avanzati».
 *
 *   Giornate       chi ha svolto la seduta, prove e percentuale, una riga per attività
 *   Attività       una scheda per attività del programma, con l'andamento; toccandola le sue sedute
 *   Comportamenti  il grafico di ciascun comportamento problema (non sono sedute)
 *
 * Solo lettura: i dati restano quelli di sempre (patient.history, programma, diario).
 */
(function () {
    'use strict';
    const P = window.TiceProgramma, C = window.TiceComportamenti, N = window.TiceNote;
    if (!P || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, barra, vai, paz, formatoData, T } = X;

    const BLOCCO = 15;      // giorni mostrati per volta
    const SEDUTE_ATT = 20;  // sedute mostrate per volta dentro un'attività
    const SOGLIA = 90;

    // ---------- stato della schermata ----------
    // la scheda e il periodo restano cambiando bambino; il resto riparte
    function stato(pid) {
        let s = T.cartella;
        if (!s) s = T.cartella = { tab: 'giornate', periodo: 'tutto', pid: null, chi: '', giorni: BLOCCO, aperte: {}, n: {} };
        if (s.pid !== pid) { s.pid = pid; s.chi = ''; s.giorni = BLOCCO; s.aperte = {}; s.n = {}; }
        return s;
    }

    // ---------- piccoli aiuti sui dati ----------
    const sedutePaz = (p) => (p.history || []).filter((x) => x && x.mode !== 'comportamento');
    const giornoDi = (s) => P.giorno(s.date);
    const nomi = (s) => String((s && s.operatore) || '').split('+').map((x) => x.trim()).filter(Boolean);
    const chiave = (n) => n.toLowerCase();
    const unici = (l) => { const v = {}, o = []; l.forEach((n) => { if (!v[chiave(n)]) { v[chiave(n)] = 1; o.push(n); } }); return o; };
    const stessi = (a, b) => a.map(chiave).sort().join('|') === b.map(chiave).sort().join('|');
    const attDi = (p, s) => (s.attivitaId && P.attivita(p, s.attivitaId)) || null;
    // la soglia: quella dell'attività; per le sedute non collegate a un'attività, quelle del bambino (stesso ordine di getCriterionThreshold), altrimenti 90
    function sogliaDi(p, s) {
        const a = attDi(p, s);
        if (a) return (a.criterio && +a.criterio.soglia) || SOGLIA;
        const ov = p.criterionOverrides || {}, ok = (v) => v !== undefined && v !== null && !isNaN(+v);
        if (s.setName && s.mode && ok(ov[s.setName + '::' + s.mode])) return +ov[s.setName + '::' + s.mode];
        if (s.mode && ok(ov['mode:' + s.mode])) return +ov['mode:' + s.mode];
        if (s.setName && ok(ov['set:' + s.setName])) return +ov['set:' + s.setName];
        return +p.criterionThreshold || SOGLIA;
    }
    const pctDi = (s) => (s.percentage != null ? Math.round(s.percentage) : (s.total ? Math.round(100 * (s.correct || 0) / s.total) : null));
    const oraDi = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };
    const dataOra = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    const classe = (pct, soglia) => (pct >= soglia ? 'pct-ok' : pct >= soglia - 20 ? 'pct-medio' : 'pct-basso');
    const maiuscola = (t) => String(t).replace(/^./, (c) => c.toUpperCase());
    const pulita = (t) => String(t || '').replace(/\*\*/g, '');
    const plurale = (n, uno, molti) => n + ' ' + (n === 1 ? uno : molti);
    const oggiG = () => P.oggi();
    const diffGiorni = (g) => Math.round((new Date(oggiG() + 'T12:00:00') - new Date(g + 'T12:00:00')) / 86400000);
    const quando = (g) => { const d = diffGiorni(g); return d <= 0 ? 'oggi' : d === 1 ? 'ieri' : d < 60 ? d + ' giorni fa' : Math.round(d / 30) + ' mesi fa'; };
    function dataLunga(g) {
        const t = maiuscola(formatoData(g, true));
        return g.slice(0, 4) === oggiG().slice(0, 4) ? t : t + ' ' + g.slice(0, 4);
    }
    function eta(p) {
        if (!p.nascita) return '';
        const n = new Date(p.nascita + 'T12:00:00'), o = new Date();
        const mesi = (o.getFullYear() - n.getFullYear()) * 12 + o.getMonth() - n.getMonth() - (o.getDate() < n.getDate() ? 1 : 0);
        if (!(mesi >= 0)) return '';
        if (mesi < 24) return plurale(mesi, 'mese', 'mesi');
        const a = Math.floor(mesi / 12), m = mesi % 12;
        return a + ' anni' + (m ? ' e ' + plurale(m, 'mese', 'mesi') : '');
    }
    const conta = (s) => (s.scala === 'percentuale' ? 0 : (s.total || 0));
    function totaleGiorno(p, g, l, filtrato) {
        const dentro = l.filter((s) => typeof inStatistiche !== 'function' || inStatistiche(s));
        if (!filtrato && typeof luDelGiorno === 'function') { const r = luDelGiorno(p, g, l); return { tot: r.tot, ok: r.ok }; }
        let tot = 0, ok = 0;
        dentro.forEach((s) => { tot += conta(s); ok += s.scala === 'percentuale' ? 0 : (s.correct || 0); });
        return { tot, ok };
    }
    // le sedute raggruppate per giorno, dal più recente; dentro il giorno, per attività e poi per ora
    function perGiorno(p, l) {
        const m = {};
        l.forEach((s) => { (m[giornoDi(s)] = m[giornoDi(s)] || []).push(s); });
        const ordine = P.programma(p).attivita.map((a) => a.id);
        return Object.keys(m).sort().reverse().map((g) => {
            const k = (s) => (s.attivitaId ? ordine.indexOf(s.attivitaId) : 999);
            const primo = {};
            m[g].forEach((s) => { const c = s.attivitaId || s.setName; if (primo[c] == null) primo[c] = new Date(s.date).getTime(); });
            m[g].sort((a, b) => (primo[a.attivitaId || a.setName] - primo[b.attivitaId || b.setName]) || (k(a) - k(b)) || (new Date(a.date) - new Date(b.date)));
            return { g, sedute: m[g] };
        });
    }

    // ---------- una riga di seduta ----------
    function barretta(s) {
        const tot = s.total || 0;
        if (!(tot > 0)) return '';
        const v = s.rawV != null ? s.rawV : (s.correct || 0), pr = s.rawP != null ? s.rawP : (s.prompts || 0);
        const x = s.rawX != null ? s.rawX : Math.max(0, tot - v - pr);
        const w = (n) => Math.round(1000 * n / tot) / 10;
        return h`<span class="cr-barra" role="img" aria-label="${v} corrette, ${pr} con aiuto, ${x} errori"><i class="V" style="width:${w(v)}%"></i><i class="P" style="width:${w(pr)}%"></i><i class="X" style="width:${w(x)}%"></i></span>`;
    }
    function rigaSeduta(p, s, o) {
        o = o || {};
        const att = attDi(p, s), col = att ? P.coloreDi(p, att) : null;
        const pct = pctDi(s);
        const so = sogliaDi(p, s);
        const mio = nomi(s), giorno = o.nomiGiorno || [];
        const chi = o.conChi ? mio : (mio.length && !stessi(mio, giorno) ? mio : []);
        const td = s.sessionType === 'timedelay';
        const nota = pulita(s.note);
        const ix = (p.history || []).indexOf(s);
        return h`<div class="cr-sed ${s.fuoriStatistiche ? 'fuori' : ''}" role="button" tabindex="0" data-a="cartella-seduta" data-i="${ix}" aria-label="Dettagli della seduta ${s.setName || ''} del ${formatoData(giornoDi(s))}" ${col ? grezzo(`style="--col:${X.esc(col)}"`) : ''}>
            <div class="cr-sed-1">
                <span class="cr-nome">${o.conData ? h`<span class="cr-data">${formatoData(giornoDi(s))}</span> ` : ''}${s.setName || 'Seduta'}</span>
                <span class="cr-esito">${s.total > 0 ? h`<span class="cr-conto">${s.correct || 0}/${s.total}</span>` : ''}${pct != null ? h`<b class="${classe(pct, so)}">${pct}%</b>` : ''}</span>
            </div>
            <div class="cr-sed-2">
                ${td ? h`<span class="pill arancio">T/D${s.timeDelaySeconds != null ? ' ' + s.timeDelaySeconds + ' s' : ''}</span>` : ''}
                ${s.mantenimento ? h`<span class="pill grigia">mantenimento</span>` : ''}
                ${s.misuraNome ? h`<span class="pill grigia">${s.misuraNome}</span>` : ''}
                ${s.mode === 'quaderno_task' ? h`<span class="pill grigia">task analysis</span>` : ''}
                ${barretta(s)}
                ${chi.length ? h`<span class="cr-chi-riga">${icona('user')} ${chi.join(' + ')}</span>` : ''}
            </div>
            ${nota ? h`<p class="cr-nota">${nota}</p>` : ''}
        </div>`;
    }

    // ---------- testata e numeri chiave ----------
    function numeri(p, sed) {
        const giorni = new Set(sed.map(giornoDi)), ultimo = [...giorni].sort().pop();
        const att = P.programma(p).attivita;
        const inCorso = att.filter((a) => a.stato === 'attivo').length;
        const acriterio = att.reduce((n, a) => n + (a.target || []).filter((t) => t.stato === 'criterio').length, 0);
        const cella = (v, et, sotto) => h`<div class="cr-num"><b>${v}</b><span>${et}</span>${sotto ? h`<small>${sotto}</small>` : ''}</div>`;
        return h`<div class="cr-numeri">
            ${cella(giorni.size, giorni.size === 1 ? 'giorno di seduta' : 'giorni di seduta')}
            ${cella(ultimo ? formatoData(ultimo) : '—', 'ultima seduta', ultimo ? quando(ultimo) : '')}
            ${cella(inCorso, inCorso === 1 ? 'attività in corso' : 'attività in corso')}
            ${cella(acriterio, acriterio === 1 ? 'target a criterio' : 'target a criterio')}
        </div>`;
    }

    // ---------- GIORNATE ----------
    const PERIODI = [['mese', 'Ultimo mese', 30], ['3mesi', '3 mesi', 90], ['tutto', 'Tutto', 0]];
    // le sedute del periodo scelto (lp) e, in più, il filtro «Chi»: i giorni da mostrare
    function filtrate(p, sed, s) {
        const per = PERIODI.find((x) => x[0] === s.periodo) || PERIODI[2];
        const dal = per[2] ? (() => { const d = new Date(); d.setDate(d.getDate() - per[2]); return P.giorno(d.toISOString()); })() : '';
        const lp = sed.filter((x) => !dal || giornoDi(x) >= dal);
        const l = s.chi ? lp.filter((x) => nomi(x).some((n) => chiave(n) === chiave(s.chi))) : lp;
        return { lp, l, giorni: perGiorno(p, l), per };
    }
    // per ogni persona: giornate e sedute nel periodo, ultima data
    function riepilogo(lp) {
        const m = {};
        lp.forEach((x) => nomi(x).forEach((n) => {
            const r = m[chiave(n)] = m[chiave(n)] || { nome: n, giorni: new Set(), sedute: 0, ultima: '' };
            r.giorni.add(giornoDi(x)); r.sedute++;
            if (giornoDi(x) > r.ultima) r.ultima = giornoDi(x);
        }));
        return Object.values(m).sort((a, b) => b.giorni.size - a.giorni.size || a.nome.localeCompare(b.nome, 'it'));
    }
    function boxRiepilogo(lp, s) {
        const r = riepilogo(lp);
        if (!r.length) return '';
        const aperto = s.riep !== false;
        return h`<section class="cr-riep scheda">
            <button type="button" class="cr-riep-testa" data-a="cartella-riep" aria-expanded="${aperto ? 'true' : 'false'}" aria-label="Riepilogo per persona, ${aperto ? 'comprimi' : 'espandi'}"><b>Per persona</b><span class="sotto piccolo">${plurale(r.length, 'persona', 'persone')}</span>${icona(aperto ? 'chevron-up' : 'chevron-down')}</button>
            ${aperto ? h`<div class="cr-riep-elenco">${r.map((x) => h`<button type="button" class="cr-riep-riga ${s.chi && chiave(s.chi) === chiave(x.nome) ? 'on' : ''}" data-a="cartella-chi-riep" data-chi="${x.nome}" aria-pressed="${s.chi && chiave(s.chi) === chiave(x.nome) ? 'true' : 'false'}" aria-label="${x.nome}: ${plurale(x.giorni.size, 'giornata', 'giornate')}, ${plurale(x.sedute, 'seduta', 'sedute')}; filtra per questa persona">
                <span class="cr-riep-nome">${icona('user')} ${x.nome}</span>
                <span class="cr-riep-dati"><b>${x.giorni.size}</b> ${x.giorni.size === 1 ? 'giornata' : 'giornate'} · <b>${x.sedute}</b> ${x.sedute === 1 ? 'seduta' : 'sedute'}</span>
                <span class="cr-riep-ult">ultima ${formatoData(x.ultima)}</span></button>`)}</div>` : ''}
        </section>`;
    }
    async function stampaGiornate(p) {
        const s = stato(p.id), sed = sedutePaz(p), { giorni, per } = filtrate(p, sed, s);
        if (!giorni.length) { X.avviso('Niente da stampare con questi filtri.'); return; }
        const esc = X.esc;
        const blocchi = giorni.map((gi) => {
            const dn = unici(gi.sedute.reduce((a, x) => a.concat(nomi(x)), []));
            const righe = gi.sedute.map((x) => {
                const pc = pctDi(x), ch = nomi(x);
                return `<tr><td style="padding:1.2mm 2mm 1.2mm 0;border-bottom:0.2mm solid #ccc">${esc(x.setName || 'Seduta')}${x.sessionType === 'timedelay' ? ' (T/D' + (x.timeDelaySeconds != null ? ' ' + esc(x.timeDelaySeconds) + ' s' : '') + ')' : ''}</td><td style="white-space:nowrap;padding:1.2mm 2mm;border-bottom:0.2mm solid #ccc">${x.total > 0 ? (x.correct || 0) + '/' + x.total : ''}</td><td style="white-space:nowrap;padding:1.2mm 2mm;border-bottom:0.2mm solid #ccc">${pc != null ? pc + '%' : ''}</td><td style="padding:1.2mm 2mm;border-bottom:0.2mm solid #ccc">${esc(ch.join(' + '))}</td><td style="padding:1.2mm 0;border-bottom:0.2mm solid #ccc">${esc(pulita(x.note))}</td></tr>`;
            }).join('');
            return `<div style="break-inside:avoid;margin:0 0 5mm"><div style="font-weight:700;font-size:11pt">${esc(dataLunga(gi.g))}</div><div style="font-size:9.5pt;margin:0.5mm 0 1.5mm">Svolta da: ${dn.length ? esc(dn.join(' + ')) : 'non indicato'}</div>
                <table style="width:100%;border-collapse:collapse;font-size:9.5pt"><thead><tr style="text-align:left"><th style="padding:0 2mm 1mm 0">Attività</th><th style="padding:0 2mm 1mm">Corrette/totale</th><th style="padding:0 2mm 1mm">%</th><th style="padding:0 2mm 1mm">Chi</th><th style="padding:0 0 1mm">Nota</th></tr></thead><tbody>${righe}</tbody></table></div>`;
        }).join('');
        await X.stampa(`<div class="st-foglio"><div class="st-bambino">${esc(p.name)}</div><p>Giornate · ${esc(per[1])}${s.chi ? ' · ' + esc(s.chi) : ''} · ${plurale(giorni.length, 'giorno', 'giorni')}</p>${blocchi}</div>`);
    }
    function foglioSeduta(p, s) {
        const att = attDi(p, s), t = att && s.targetId ? (att.target || []).find((x) => x.id === s.targetId) : null;
        const tot = s.total || 0, v = s.rawV != null ? s.rawV : (s.correct || 0), pr = s.rawP != null ? s.rawP : (s.prompts || 0), x = s.rawX != null ? s.rawX : Math.max(0, tot - v - pr);
        const pc = pctDi(s), td = s.sessionType === 'timedelay', mio = nomi(s), nota = pulita(s.note);
        const dur = s.durataSecondi != null ? s.durataSecondi : s.durationSeconds != null ? s.durationSeconds : s.durata != null ? s.durata : s.duration;
        const durT = dur != null && !isNaN(+dur) ? (+dur >= 60 ? Math.floor(+dur / 60) + ' min ' + (Math.round(+dur) % 60) + ' s' : Math.round(+dur) + ' s') : '';
        const riga = (et, val) => (val ? h`<tr><th scope="row" style="text-align:left;font-weight:600;color:var(--text-secondary);padding-right:12px;vertical-align:top;white-space:nowrap">${et}</th><td style="overflow-wrap:anywhere">${val}</td></tr>` : '');
        const corr = Array.isArray(s.correzioni) ? s.correzioni : [];
        return X.foglio(h`<div class="cr-dettaglio"><h2>${s.setName || 'Seduta'}</h2>
            <table class="tabella cr-det-tab"><tbody>
                ${riga('Data e ora', dataOra(s.date))}
                ${riga('Svolta da', mio.length ? mio.join(' + ') : 'non indicato')}
                ${riga('Attività', att ? att.nome : 'non collegata al programma')}
                ${riga('Target', t ? t.testo : '')}
                ${riga('Tipo', (td ? 'Time delay' + (s.timeDelaySeconds != null ? ' · ' + s.timeDelaySeconds + ' s' : '') : s.scala === 'percentuale' ? 'Percentuale' : 'Indipendente') + (s.mantenimento ? ' · mantenimento' : '') + (s.mode === 'quaderno_task' ? ' · task analysis' : ''))}
                ${riga('Esito', tot > 0 ? h`${v} ${v === 1 ? 'corretta' : 'corrette'} (V) · ${pr} con aiuto (P) · ${x} ${x === 1 ? 'errore' : 'errori'} (X) — su ${tot}${pc != null ? ' · ' + pc + '%' : ''}` : (pc != null ? pc + '%' : ''))}
                ${riga('Misura', s.misuraNome || '')}
                ${riga('Durata', durT)}
                ${s.fuoriStatistiche ? riga('Statistiche', 'Non conteggiata nelle statistiche') : ''}
            </tbody></table>
            ${s.sequenza ? h`<p class="sotto piccolo" style="margin:10px 0 4px">Sequenza delle risposte</p><div class="sequenza" role="img" aria-label="Sequenza: ${s.sequenza}">${String(s.sequenza).split('').map((r) => h`<i class="${r}"></i>`)}</div>` : ''}
            ${nota ? h`<p class="sotto piccolo" style="margin:10px 0 2px">Nota</p><p class="cr-nota" style="font-size:0.95rem;color:var(--text-primary)">${nota}</p>` : ''}
            ${corr.length ? h`<p class="sotto piccolo" style="margin:10px 0 2px">Correzioni</p><ul class="cr-correzioni">${corr.map((c) => h`<li>${dataOra(c.il) || '—'}${c.chi ? ' · ' + c.chi : ''}: prima era «${c.da}»</li>`)}</ul>` : ''}
            <div class="bottoni"><button type="button" class="bt primario" data-foglio="chiudi">Chiudi</button></div></div>`);
    }
    function vistaGiornate(p, sed, s) {
        const tuttiNomi = {};
        sed.forEach((x) => nomi(x).forEach((n) => { if (!tuttiNomi[chiave(n)]) tuttiNomi[chiave(n)] = n; }));
        const persone = Object.keys(tuttiNomi).sort().map((k) => tuttiNomi[k]);
        if (s.chi && !persone.some((n) => chiave(n) === chiave(s.chi))) s.chi = '';
        const { lp, giorni } = filtrate(p, sed, s);
        const visibili = giorni.slice(0, s.giorni);
        const filtrato = !!s.chi;
        const chip = (az, dati, on, testo) => h`<button type="button" class="cr-chip ${on ? 'on' : ''}" data-a="${az}" ${grezzo(dati)} aria-pressed="${on ? 'true' : 'false'}">${testo}</button>`;
        const note = (g) => (N ? N.elenco(p).filter((n) => n.data === g) : []);

        return h`${persone.length > 1 || sed.length ? h`<div class="cr-filtri">
                ${persone.length > 0 ? h`<div class="cr-filtro"><span class="cr-et">Chi</span><div class="cr-chips" data-scorri role="group" aria-label="Filtra per persona">
                    ${chip('cartella-chi', 'data-chi=""', !s.chi, 'Tutte')}${persone.map((n) => chip('cartella-chi', `data-chi="${X.esc(n)}"`, !!s.chi && chiave(s.chi) === chiave(n), h`${icona('user')} ${n}`))}</div></div>` : ''}
                <div class="cr-filtro"><span class="cr-et">Periodo</span><div class="cr-chips" role="group" aria-label="Filtra per periodo">
                    ${PERIODI.map((x) => chip('cartella-periodo', `data-p="${x[0]}"`, s.periodo === x[0], x[1]))}</div></div>
            </div>` : ''}
            ${sed.length ? boxRiepilogo(lp, s) : ''}
            ${!sed.length ? h`<div class="vuoto">Ancora nessuna seduta registrata.</div>`
            : !giorni.length ? h`<div class="vuoto">Nessuna seduta con questi filtri.</div>`
            : h`<div class="cr-quanti"><span class="sotto piccolo">${plurale(giorni.length, 'giorno', 'giorni')}${filtrato ? ' con ' + s.chi : ''}</span>
                    <button type="button" class="bt piccolo" data-a="cartella-stampa" aria-label="Stampa o salva in PDF le giornate con i filtri correnti">${icona('print')} Stampa / PDF</button></div>
                <div class="cr-giorni">${visibili.map((gi) => {
                    const dn = unici(gi.sedute.reduce((a, x) => a.concat(nomi(x)), []));
                    const t = totaleGiorno(p, gi.g, gi.sedute, filtrato), pct = t.tot ? Math.round(100 * t.ok / t.tot) : null;
                    const nt = note(gi.g);
                    return h`<section class="cr-giorno scheda">
                        <header class="cr-giorno-testa">
                            <div class="cr-giorno-titolo"><b>${dataLunga(gi.g)}</b><span class="sotto piccolo">${quando(gi.g)}</span></div>
                            ${t.tot ? h`<div class="cr-giorno-tot"><b>${pct}%</b><span class="sotto piccolo">${plurale(t.tot, 'prova', 'prove')}</span></div>` : ''}
                        </header>
                        <div class="cr-svolta ${dn.length ? '' : 'manca'}">${icona(dn.length > 1 ? 'user-group' : 'user')}<span>${dn.length ? h`Svolta da <b>${dn.join(' + ')}</b>` : 'Svolta da: non indicato'}</span></div>
                        <div class="cr-sedute">${gi.sedute.map((x) => rigaSeduta(p, x, { nomiGiorno: dn }))}</div>
                        ${nt.length ? h`<div class="cr-diario">${nt.map((n) => h`<p>${icona('note-sticky')} ${n.testo}${n.autore ? h` <span class="sotto">· ${n.autore}</span>` : ''}</p>`)}</div>` : ''}
                    </section>`;
                })}</div>
                ${giorni.length > visibili.length ? h`<button class="bt largo" data-a="cartella-altri">Mostra altri ${Math.min(BLOCCO, giorni.length - visibili.length)} <span class="sotto">(restano ${giorni.length - visibili.length})</span></button>` : ''}`}`;
    }

    // ---------- ATTIVITÀ ----------
    // una percentuale per giorno (le prove del giorno sommate), dalla più vecchia
    function andamentoGiorni(l) {
        const m = {}, ordine = [];
        l.forEach((s) => {
            const g = giornoDi(s);
            if (!m[g]) { m[g] = { g, ok: 0, tot: 0, pc: [] }; ordine.push(g); }
            if (s.total > 0 && s.scala !== 'percentuale') { m[g].ok += s.correct || 0; m[g].tot += s.total; } else if (s.percentage != null) m[g].pc.push(s.percentage);
        });
        return ordine.sort().map((g) => { const x = m[g]; return { g, pct: Math.round(x.tot ? 100 * x.ok / x.tot : (x.pc.length ? x.pc.reduce((a, b) => a + b, 0) / x.pc.length : 0)) }; });
    }
    function spark(punti, soglia, col) {
        if (!punti.length) return '';
        const W = 132, H = 36, sx = 6, w = W - 2 * sx, y = (v) => 4 + (100 - Math.max(0, Math.min(100, v))) / 100 * (H - 8);
        const x = (k) => sx + (punti.length === 1 ? w / 2 : k * w / (punti.length - 1));
        return h`<svg class="cr-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento delle ultime ${punti.length} giornate"><line class="cr-soglia" x1="0" x2="${W}" y1="${y(soglia)}" y2="${y(soglia)}"/>
            ${punti.length > 1 ? grezzo(`<polyline class="cr-linea" points="${punti.map((q, k) => x(k).toFixed(1) + ',' + y(q.pct).toFixed(1)).join(' ')}"/>`) : ''}
            ${punti.map((q, k) => grezzo(`<circle class="${classe(q.pct, soglia).replace('pct-', '')}" cx="${x(k).toFixed(1)}" cy="${y(q.pct).toFixed(1)}" r="3.4"><title>${formatoData(q.g)}: ${q.pct}%</title></circle>`))}</svg>`;
    }
    function ultimoCriterio(p, att) {
        const date = (att.target || []).filter((t) => t.stato === 'criterio' && t.fine).map((t) => t.fine);
        try {
            const c = P.targetCorrente(att);
            const d = P.criterioDi(p, att, c ? c.target : undefined);
            if (d) date.push(d);
        } catch (e) { /* senza */ }
        return date.sort().pop() || null;
    }
    function schedaGruppo(p, s, id, titolo, sotto, sed, o) {
        const aperta = !!s.aperte[id], l = sed.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        const giorni = andamentoGiorni(sed), ultime = giorni.slice(-12), ultima = giorni[giorni.length - 1];
        const so = o.soglia || SOGLIA;
        const n = s.n[id] || SEDUTE_ATT;
        return h`<article class="cr-att scheda ${aperta ? 'aperta' : ''}" ${o.col ? grezzo(`style="--col:${X.esc(o.col)}"`) : ''}>
            <button type="button" class="cr-att-testa" data-a="cartella-att" data-id="${id}" aria-expanded="${aperta ? 'true' : 'false'}">
                <span class="corpo">
                    <span class="cr-att-nome">${titolo}${o.pill ? h` <span class="pill grigia">${o.pill}</span>` : ''}</span>
                    ${sotto ? h`<span class="cr-att-sotto">${sotto}</span>` : ''}
                    <span class="cr-att-dati">${plurale(sed.length, 'seduta', 'sedute')}${ultima ? ' · ultima il ' + formatoData(ultima.g) : ''}</span>
                </span>
                <span class="cr-att-destra">${ultima ? h`<b class="${classe(ultima.pct, so)}">${ultima.pct}%</b>` : ''}${spark(ultime, so)}</span>
                <span class="cr-freccia">${icona(aperta ? 'chevron-up' : 'chevron-down')}</span>
            </button>
            ${o.criterio ? h`<p class="cr-criterio">${icona('flag-checkered')} Criterio raggiunto il ${formatoData(o.criterio)}</p>` : ''}
            ${aperta ? h`<div class="cr-sedute cr-dentro">${l.slice(0, n).map((x) => rigaSeduta(p, x, { conData: true, conChi: true }))}
                ${l.length > n ? h`<button class="bt piccolo largo" data-a="cartella-piu" data-id="${id}">Mostra altre (restano ${l.length - n})</button>` : ''}</div>` : ''}
        </article>`;
    }
    function vistaAttivita(p, sed, s) {
        const prog = P.programma(p).attivita;
        const ordine = { attivo: 0, sospeso: 1, terminato: 2 };
        const att = prog.slice().sort((a, b) => ((ordine[a.stato] != null ? ordine[a.stato] : 3) - (ordine[b.stato] != null ? ordine[b.stato] : 3)) || (prog.indexOf(a) - prog.indexOf(b)));
        const preso = new Set();
        const schede = att.map((a) => {
            const l = P.sedute(p, a).filter((x) => x.mode !== 'comportamento');
            l.forEach((x) => preso.add(x.id));
            const c = P.targetCorrente(a), t = c && c.target;
            const sotto = t && t.testo ? (c.mantenimento ? 'Mantenimento · ' : 'Target · ') + t.testo : '';
            return schedaGruppo(p, s, a.id, a.nome, sotto, l, {
                col: P.coloreDi(p, a), soglia: (a.criterio && +a.criterio.soglia) || SOGLIA, criterio: ultimoCriterio(p, a),
                pill: a.stato === 'sospeso' ? 'sospesa' : a.stato === 'terminato' ? 'terminata' : ''
            });
        });
        const liberi = sed.filter((x) => !preso.has(x.id)), gruppi = {};
        liberi.forEach((x) => { const k = x.setName || 'Senza nome'; (gruppi[k] = gruppi[k] || []).push(x); });
        const nomiG = Object.keys(gruppi).sort((a, b) => gruppi[b].length - gruppi[a].length || a.localeCompare(b, 'it'));
        return h`${!att.length && !nomiG.length ? h`<div class="vuoto">Ancora nessuna attività nel programma.</div>` : ''}
            <div class="cr-att-griglia">${schede}</div>
            ${nomiG.length ? h`<h3 class="cr-titolo-sez">Dati non collegati a un'attività del programma</h3>
                <p class="sotto piccolo">Giochi, quaderni importati e attività tolte dal programma, raggruppati per nome.</p>
                <div class="cr-att-griglia">${nomiG.map((k) => schedaGruppo(p, s, 'x:' + k, k, '', gruppi[k], {}))}</div>` : ''}`;
    }

    // ---------- COMPORTAMENTI ----------
    function vistaComportamenti(p) {
        const cc = C ? C.elenco(p) : [];
        if (!cc.length) return h`<div class="vuoto">Nessun comportamento problema nel programma.</div>`;
        return h`<p class="sotto piccolo">Episodi e durate registrati a fine seduta: qui sono a parte, non entrano fra le attività.</p>
            <div class="cr-comp-griglia">${cc.map((c) => {
                const pt = C.andamento(p, c), ok = C.aObiettivo && C.aObiettivo(pt, c);
                return h`<article class="scheda imbottita cr-comp">
                    <header><b>${c.nome}</b>${c.stato === 'sospeso' ? h` <span class="pill grigia">sospeso</span>` : ''}${ok ? h` <span class="pill verde">obiettivo raggiunto</span>` : ''}</header>
                    <p class="sotto piccolo">${C.unita(c)}${c.obiettivo ? ' · obiettivo: al massimo ' + C.numero(c.obiettivo.max) + ' per ' + plurale(c.obiettivo.giorni, 'giorno', 'giorni') : ''}</p>
                    ${grezzo(C.grafico(pt, c))}
                </article>`;
            })}</div>`;
    }

    // ---------- passare da un bambino all'altro ----------
    const bambini = () => (X.pazientiAula || X.pazienti)().filter((p) => !(X.eGruppo && X.eGruppo(p))).sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
    function passa(pid) {
        if (!pid || pid === T.pid) return;
        T.pid = pid;
        T.mantieniScroll = false;
        X.disegna();
        const r = X.radice(); if (r) r.scrollTop = 0;
    }
    function passaDi(d) {
        const tutti = bambini(), i = tutti.findIndex((p) => p.id === T.pid);
        if (i < 0 || tutti.length < 2) return;
        passa(tutti[(i + d + tutti.length) % tutti.length].id);
    }
    const inCartella = () => T.vista === 'cartella' && X.radice() && X.radice().isConnected && X.radice().querySelector('.cartella-main');
    // il gestore dei <select> del nucleo non conosce questo: lo si ascolta qui, filtrando sul nostro attributo
    document.addEventListener('change', (e) => {
        const el = e.target;
        if (el && el.dataset && el.dataset.crBambino && inCartella()) passa(el.value);
    });
    document.addEventListener('keydown', (e) => {
        if (!inCartella()) return;
        // Invio o spazio su una riga di seduta la apre
        const riga = e.target && e.target.closest && e.target.closest('[data-a="cartella-seduta"]');
        if (riga && (e.key === 'Enter' || e.key === ' ') && riga === e.target) { e.preventDefault(); riga.click(); return; }
        if (e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        if (document.querySelector('.tice-foglio') || (typeof window.staScrivendo === 'function' && window.staScrivendo(e))) return;
        e.preventDefault();
        passaDi(e.key === 'ArrowLeft' ? -1 : 1);
    });

    // ---------- la pagina ----------
    function vistaCartella() {
        const p = paz(T.pid);
        if (!p) { T.vista = 'bambini'; return X.banner(); }
        const s = stato(p.id), sed = sedutePaz(p);
        const nComp = C ? C.elenco(p).length + (p.history || []).filter((x) => x.mode === 'comportamento').length : 0;
        if (s.tab === 'comportamenti' && !nComp) s.tab = 'giornate';
        const nGiorni = new Set(sed.map(giornoDi)).size, nAtt = P.programma(p).attivita.length;
        const tab = (id, testo, n) => h`<button type="button" role="tab" id="cr-tab-${id}" aria-controls="cr-pannello" class="cr-tab ${s.tab === id ? 'on' : ''}" data-a="cartella-tab" data-tab="${id}" aria-selected="${s.tab === id ? 'true' : 'false'}">${testo}${n != null ? h` <small>${n}</small>` : ''}</button>`;
        const e = eta(p);
        const tutti = bambini(), qui = tutti.indexOf(p), nav = qui >= 0 && tutti.length > 1;
        return h`${barra({ indietro: 'cartella-indietro', titolo: 'Cartella', sotto: { testo: p.name } })}
            <main class="tice-main cartella-main">
                ${X.testata('Cartella' + (e ? ' · ' + e : '') + (p.category ? ' · ' + p.category : ''), p.name)}
                ${nav ? h`<div class="cr-scelta">
                    <button type="button" class="ib" data-a="cartella-passa" data-d="-1" aria-label="Bambino precedente" title="Precedente (←)">${icona('chevron-left')}</button>
                    <select class="campo-in" data-cr-bambino="1" aria-label="Bambino">${tutti.map((x) => h`<option value="${x.id}" ${x === p ? grezzo('selected') : ''}>${x.name}</option>`)}</select>
                    <span class="sotto piccolo cr-scelta-n">${qui + 1} di ${tutti.length}</span>
                    <button type="button" class="ib" data-a="cartella-passa" data-d="1" aria-label="Bambino successivo" title="Successivo (→)">${icona('chevron-right')}</button>
                </div>` : ''}
                <div class="cr-nome-pag"><b>${p.name}</b><span class="sotto">${[e, p.category].filter(Boolean).join(' · ')}</span></div>
                ${numeri(p, sed)}
                <div class="cr-tabbar">
                    <div class="cr-tabs" role="tablist" aria-label="Sezioni della cartella">${tab('giornate', 'Giornate', nGiorni)}${tab('attivita', 'Attività', nAtt)}${nComp ? tab('comportamenti', 'Comportamenti', C.elenco(p).length || null) : ''}</div>
                    <div class="cr-rapidi">
                        <button class="bt piccolo" data-a="vai-diario" aria-label="Apri il diario">${icona('book-open')} Diario</button>
                        <button class="bt piccolo" data-a="vai-grafici" aria-label="Apri i grafici">${icona('chart-line')} Grafici</button>
                        <button class="bt piccolo" data-a="vai-programma" aria-label="Apri il programma">${icona('list-check')} Programma</button>
                    </div>
                </div>
                <div class="cr-corpo" id="cr-pannello" role="tabpanel" aria-labelledby="cr-tab-${s.tab}">${s.tab === 'attivita' ? vistaAttivita(p, sed, s) : s.tab === 'comportamenti' ? vistaComportamenti(p) : vistaGiornate(p, sed, s)}</div>
                <p class="cr-avanzati"><button class="link" data-a="cartella-vecchia">${icona('file-excel')} Report, Excel e strumenti avanzati</button></p>
            </main>`;
    }

    // ---------- da dove si arriva, e il collegamento alla cartella di prima ----------
    function apriCartella(pid) {
        const a = TiceHome.attuale();
        if (a.vista !== 'cartella') T.ritornoCartella = { vista: a.vista, pid: a.pid };
        vai('cartella', pid);
    }
    let tornaACartella = false;
    ['closePatients'].forEach((nome) => {
        const originale = window[nome];
        if (typeof originale !== 'function') return;
        window[nome] = function () {
            const r = originale.apply(this, arguments);
            if (tornaACartella) { tornaACartella = false; TiceHome.apri(); }
            return r;
        };
    });
    function apriVecchia() {
        const pid = T.pid;
        if (typeof window.openPatients !== 'function') return;
        TiceHome.chiudi();
        tornaACartella = true;
        Promise.resolve(window.openPatients()).then(() => { if (typeof window.selectPatientModal === 'function') window.selectPatientModal(pid); });
    }
    const ridisegna = () => TiceHome.ridisegna();

    TiceHome.estendi({
        viste: { cartella: vistaCartella },
        azioni: {
            'apri-cartella': () => { if (T.pid) apriCartella(T.pid); },
            'cartella-indietro': () => { const r = T.ritornoCartella || { vista: 'seduta' }; vai(r.vista, T.pid); },
            'cartella-passa': (b) => passaDi(Number(b.dataset.d) || 1),
            'cartella-riep': () => { const s = stato(T.pid); s.riep = s.riep === false; ridisegna(); },
            'cartella-chi-riep': (b) => { const s = stato(T.pid), n = b.dataset.chi || ''; s.chi = s.chi && chiave(s.chi) === chiave(n) ? '' : n; s.giorni = BLOCCO; ridisegna(); },
            'cartella-stampa': () => stampaGiornate(paz(T.pid)),
            'cartella-seduta': (b) => { const p = paz(T.pid), s = p && (p.history || [])[+b.dataset.i]; if (s) return foglioSeduta(p, s); },
            'cartella-tab': (b) => { stato(T.pid).tab = b.dataset.tab; ridisegna(); },
            'cartella-chi': (b) => { const s = stato(T.pid); s.chi = b.dataset.chi || ''; s.giorni = BLOCCO; ridisegna(); },
            'cartella-periodo': (b) => { const s = stato(T.pid); s.periodo = b.dataset.p; s.giorni = BLOCCO; ridisegna(); },
            'cartella-altri': () => { const s = stato(T.pid); s.giorni += BLOCCO; ridisegna(); },
            'cartella-att': (b) => { const s = stato(T.pid); s.aperte[b.dataset.id] = !s.aperte[b.dataset.id]; ridisegna(); },
            'cartella-piu': (b) => { const s = stato(T.pid); s.n[b.dataset.id] = (s.n[b.dataset.id] || SEDUTE_ATT) + SEDUTE_ATT; ridisegna(); },
            'cartella-vecchia': apriVecchia,
        }
    });
    window.TiceCartella = { apri: apriCartella };
})();
