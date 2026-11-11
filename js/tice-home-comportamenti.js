/**
 * Centro TICE — comportamenti problema: la striscia in seduta (episodi e durate), il foglio degli episodi,
 * la sezione nel programma, il modulo di definizione e l'andamento nel tempo.
 * Spostato da js/tice-home.js: i dati stanno in js/tice-comportamenti.js, qui solo le schermate.
 */
(function () {
    'use strict';
    const C = window.TiceComportamenti;
    if (!C || !window.TiceHome) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, foglio, paz, salvaPaziente, T, bozza, salvaBozza, ultimeDi, eGruppo, testoPiede, tastoAnnulla, secMmss, radice, disegna, puoProgrammi } = X;

    // ---------- comportamenti problema in seduta ----------
    // Una striscia in cima alla presa dati: un tocco segna l'episodio (o avvia e ferma la durata),
    // senza lasciare l'attività su cui si sta lavorando. I dettagli dell'ultimo episodio restano a un tocco.
    function striscia(p) {
        if (eGruppo(p)) return '';
        const cc = C.attivi(p);
        if (!cc.length) return '';
        const b = bozza(p.id);
        const ult = T.compUltimo && T.compUltimo.pid === p.id ? T.compUltimo : null;
        const cu = ult ? C.trova(p, ult.cid) : null, r0 = cu ? C.raccolta(b, cu.id) : null;
        const eu = r0 ? r0.episodi.find((e) => e.id === ult.eid) : null;
        const chip = (k, v, testo, su) => h`<button type="button" class="comp-chip ${su ? 'on' : ''}" data-a="comp-dettaglio" data-id="${cu.id}" data-k="${k}" data-v="${v}" aria-pressed="${su ? 'true' : 'false'}">${testo}</button>`;
        return h`<section class="comp-striscia" aria-label="Comportamenti problema">
            ${cc.map((c) => {
                const r = (b.comp || {})[c.id], n = r ? r.episodi.length : 0, corre = !!(r && r.inCorso);
                const no = !!(r && r.nonOsservato);
                return h`<div class="comp ${corre ? 'in-corso' : ''} ${no ? 'non-oss' : ''}">
                    ${c.misura === 'durata'
                        ? h`<button class="comp-tasto" data-a="comp-durata" data-id="${c.id}" aria-label="${corre ? 'Ferma' : 'Avvia'} ${c.nome}">${icona(corre ? 'stop' : 'play')}<span class="comp-nome">${c.nome}</span>
                            <span class="comp-n" data-comp-crono="${c.id}">${secMmss(r ? C.secondiTotali(r) : 0)}${n ? h` <small>· ${n}</small>` : ''}</span></button>`
                        : h`<button class="comp-tasto" data-a="comp-piu" data-id="${c.id}" aria-label="Segna un episodio di ${c.nome}">${icona('plus')}<span class="comp-nome">${c.nome}</span><span class="comp-n">${no ? '—' : n}</span></button>`}
                    <button class="ib comp-altro" data-a="comp-apri" data-id="${c.id}" aria-label="Episodi e definizione di ${c.nome}" title="Episodi di oggi e definizione">${icona('ellipsis')}</button>
                </div>`;
            })}
            ${eu && (cu.intensita || (cu.antecedenti || []).length || (cu.conseguenze || []).length) ? h`<div class="comp-ultimo">
                <span class="sotto piccolo">${cu.nome} · episodio ${r0.episodi.indexOf(eu) + 1}${eu.s ? ' · ' + secMmss(eu.s) : ''}</span>
                ${cu.intensita ? h`<span class="comp-chips">${[1, 2, 3].map((i) => chip('i', i, C.INTENSITA[i], eu.i === i))}</span>` : ''}
                ${(cu.antecedenti || []).length ? h`<span class="comp-chips"><b>A</b>${cu.antecedenti.map((x) => chip('a', x, x, eu.a === x))}</span>` : ''}
                ${(cu.conseguenze || []).length ? h`<span class="comp-chips"><b>C</b>${cu.conseguenze.map((x) => chip('c', x, x, eu.c === x))}</span>` : ''}
                <button class="ib" data-a="comp-chiudi-ultimo" aria-label="Chiudi">${icona('xmark')}</button>
            </div>` : ''}
        </section>`;
    }
    // Annulla per un comportamento: ferma senza contarla la durata in corso, o toglie l'ultimo episodio
    function annullaComportamento(p, cid) {
        const b = bozza(p.id), r = b.comp && b.comp[cid];
        if (!r || !(r.episodi.length || r.inCorso)) return false;
        if (r.inCorso) r.inCorso = null; else r.episodi.pop();
        const u = ultimeDi(b), k = u.lastIndexOf('comp:' + cid);
        if (k >= 0) u.splice(k, 1);
        if (T.compUltimo && T.compUltimo.cid === cid && !r.episodi.some((e) => e.id === T.compUltimo.eid)) T.compUltimo = null;
        if (navigator.vibrate) navigator.vibrate([6, 40, 6]);
        salvaBozza(); aggiornaStriscia(p);
        return true;
    }
    function aggiornaStriscia(p) {
        const el = radice().querySelector('.comp-striscia');
        if (el) el.outerHTML = String(striscia(p)); else { T.mantieniScroll = true; disegna(); }
        const r = document.getElementById('tice-riassunto');
        if (r) r.innerHTML = testoPiede(p);
        const a = document.getElementById('tice-annulla');
        if (a) a.outerHTML = String(tastoAnnulla(p));
    }
    // i cronometri della durata avanzano mentre si guarda la seduta
    setInterval(() => {
        if (T.vista !== 'seduta' || !T.bozza || !T.bozza.comp) return;
        const r = radice();
        if (!r || r.hidden) return;
        r.querySelectorAll('[data-comp-crono]').forEach((el) => {
            const x = T.bozza.comp[el.dataset.compCrono];
            if (x && x.inCorso) el.firstChild.textContent = secMmss(C.secondiTotali(x));
        });
    }, 1000);
    async function foglioComportamento(p, c) {
        const b = bozza(p.id), r = C.raccolta(b, c.id);
        const ora = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const sel = (nome, valori, scelto, vuoto) => h`<select class="campo-in" name="${nome}"><option value="">${vuoto}</option>${valori.map((x) => h`<option value="${x}" ${x === scelto ? grezzo('selected') : ''}>${x}</option>`)}</select>`;
        const res = await foglio(h`<form class="modulo-att"><h2>${c.nome}</h2>
            ${c.definizione ? h`<p class="comp-def">${c.definizione}</p>` : ''}
            <p class="sotto piccolo">${c.misura === 'durata' ? 'Durata: avvia e ferma ogni episodio' : 'Frequenza: un tocco per ogni episodio'}${c.obiettivo ? ` · obiettivo: al massimo ${C.numero(c.obiettivo.max)} ${C.unita(c)}` : ''}</p>
            <h3>Episodi di oggi (${r.episodi.length})</h3>
            ${r.episodi.length ? h`<div class="comp-episodi">${r.episodi.map((e, i) => h`<div class="comp-ep">
                <b>${i + 1}</b><span>${ora(e.t)}${e.s ? ' · ' + secMmss(e.s) : ''}</span>
                ${c.intensita ? sel('i' + i, ['1', '2', '3'].map((x) => x), e.i ? String(e.i) : '', 'intensità') : ''}
                ${(c.antecedenti || []).length ? sel('a' + i, c.antecedenti, e.a || '', 'antecedente') : ''}
                ${(c.conseguenze || []).length ? sel('c' + i, c.conseguenze, e.c || '', 'conseguenza') : ''}
                <input class="campo-in" name="${'n' + i}" maxlength="300" value="${e.nota || ''}" placeholder="nota">
                <label class="spunta-riga"><input type="checkbox" name="${'x' + i}"> <span class="sotto piccolo">togli</span></label></div>`)}</div>`
                : h`<p class="sotto">Nessun episodio${r.nonOsservato ? '' : ': a fine seduta conta come zero, che è un dato'}.</p>`}
            <label class="spunta-riga"><input type="checkbox" name="nonOsservato" ${r.nonOsservato ? grezzo('checked') : ''}> <span><b>Non osservato oggi</b><br><span class="sotto piccolo">Non si salva nulla per questo comportamento (diverso da zero episodi).</span></span></label>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        { dopo: (f) => f.querySelectorAll('select[name^=i] option').forEach((o) => { if (o.value) o.textContent = C.INTENSITA[o.value]; }) });
        if (!res) return;
        r.episodi = r.episodi.map((e, i) => {
            if (res['x' + i]) return null;
            const x = Object.assign({}, e);
            if (c.intensita) { const v = +res['i' + i]; if (v) x.i = v; else delete x.i; }
            ['a', 'c'].forEach((k) => { if (res[k + i] !== undefined) { if (res[k + i]) x[k] = res[k + i]; else delete x[k]; } });
            const n = String(res['n' + i] || '').trim(); if (n) x.nota = n; else delete x.nota;
            return x;
        }).filter(Boolean);
        r.nonOsservato = !!res.nonOsservato;
        if (r.nonOsservato) { r.episodi = []; r.inCorso = null; }
        salvaBozza();
        aggiornaStriscia(p);
    }

    // ---------- comportamenti problema nel programma ----------
    function sezioneComportamenti(p, modifica) {
        const cc = C.elenco(p);
        if (!cc.length && !modifica) return '';
        return h`<h3>Comportamenti problema</h3>
            ${cc.map((c) => {
                const pt = C.andamento(p, c), ult = pt.slice(-5), ok = C.aObiettivo(pt, c);
                return h`<div class="scheda imbottita comp-scheda ${c.stato === 'sospeso' ? 'spento' : ''}">
                    <div class="comp-testa"><b>${c.nome}</b> <span class="pill">${c.misura === 'durata' ? 'durata' : 'frequenza'}</span>
                        ${c.stato === 'sospeso' ? h`<span class="pill grigia">sospeso</span>` : ''}${ok ? h`<span class="pill verde">${icona('flag-checkered')} obiettivo</span>` : ''}
                        ${modifica ? h`<button class="ib" data-a="comp-mod" data-id="${c.id}" aria-label="Modifica ${c.nome}">${icona('pen')}</button>` : ''}</div>
                    ${c.definizione ? h`<p class="sotto piccolo">${c.definizione}</p>` : ''}
                    <p class="sotto piccolo">${ult.length ? 'Ultimi giorni: ' + ult.map((x) => C.numero(x.valore)).join(' · ') + ' ' + C.unita(c) : 'Ancora nessun giorno osservato'}${c.obiettivo ? ` · obiettivo ≤ ${C.numero(c.obiettivo.max)} per ${c.obiettivo.giorni} giorni` : ''}</p>
                    ${pt.length ? h`<button class="bt piccolo fantasma" data-a="comp-andamento" data-id="${c.id}">${icona('chart-line')} Andamento</button>` : ''}
                </div>`;
            })}
            ${modifica ? h`<button class="bt largo fantasma" data-a="comp-nuovo">${icona('plus')} Nuovo comportamento da monitorare</button>` : ''}`;
    }
    function moduloComportamento(c) {
        const a = c || { nome: '', definizione: '', misura: 'frequenza', antecedenti: [], conseguenze: [], stato: 'attivo' };
        const testa = (ic, titolo, sotto) => h`<div class="ma-testa"><span class="ma-ic">${icona(ic)}</span><h3>${titolo}</h3>${sotto ? h`<span class="ma-sotto">${sotto}</span>` : ''}</div>`;
        const conAbc = (a.antecedenti || []).length || (a.conseguenze || []).length;
        return foglio(h`<form class="modulo-att ma"><h2>${c ? 'Modifica comportamento' : 'Nuovo comportamento'}</h2>
            <section class="ma-card">${testa('triangle-exclamation', 'Cosa')}
                <label class="campo"><span>Nome</span><input name="nome" required maxlength="120" value="${a.nome}" ${c ? '' : grezzo('autofocus')} placeholder="es. Colpire, Urlare, Fuga dal tavolo"></label>
                <label class="campo"><span>Definizione operativa <small class="sotto">· cosa conta come episodio e cosa no; si legge in seduta</small></span><textarea name="definizione" rows="3" maxlength="2000" placeholder="es. Colpisce l'adulto con la mano aperta o chiusa. Non conta il contatto accidentale.">${a.definizione || ''}</textarea></label>
            </section>
            <section class="ma-card">${testa('hand-pointer', 'In seduta', 'come si misura')}
                <div class="ma-tiles ma-due">
                    <label class="ma-tile"><input type="radio" name="misura" value="frequenza" ${a.misura !== 'durata' ? grezzo('checked') : ''}><span class="ma-grande">${icona('plus')}</span><b>Frequenza</b><small>un tocco per episodio: colpi, urla, lanci</small></label>
                    <label class="ma-tile"><input type="radio" name="misura" value="durata" ${a.misura === 'durata' ? grezzo('checked') : ''}><span class="ma-grande">${icona('stopwatch')}</span><b>Durata</b><small>avvia e ferma: crisi, pianto, fuga</small></label>
                </div>
            </section>
            <section class="ma-card">${testa('flag-checkered', 'Obiettivo', 'facoltativo')}
                <p class="ma-frase">Al massimo <input name="max" type="number" min="0" max="999" step="0.1" inputmode="decimal" value="${a.obiettivo ? a.obiettivo.max : ''}" placeholder="—" class="ma-n"> all'ora per <input name="giorni" type="number" min="1" max="30" inputmode="numeric" value="${a.obiettivo ? a.obiettivo.giorni : 5}" class="ma-n"> giorni di fila</p>
                <span class="sotto piccolo">Episodi all'ora (frequenza) o minuti all'ora (durata).</span>
            </section>
            <section class="ma-card">${testa('sliders', 'Opzioni', 'tocca per attivare')}
                <div class="ma-chips">
                    <label class="ma-chip ${a.intensita ? 'on' : ''}" title="Lieve, media, grave per ogni episodio"><input type="checkbox" name="intensita" ${a.intensita ? grezzo('checked') : ''}>${icona('gauge-high')} Intensità</label>
                    <button type="button" class="ma-chip ${conAbc ? 'on' : ''}" data-ma-apri="abc" aria-pressed="${conAbc ? 'true' : 'false'}">${icona('diagram-next')} ABC: antecedenti e conseguenze</button>
                </div>
                <div class="ma-opz" data-ma-sez="abc" ${conAbc ? '' : grezzo('hidden')}>
                    <div class="riga-campi">
                        <label class="campo"><span>Antecedenti, uno per riga</span><textarea name="antecedenti" rows="4" placeholder="Richiesta&#10;Attesa&#10;Transizione&#10;Rumore">${(a.antecedenti || []).join('\n')}</textarea></label>
                        <label class="campo"><span>Conseguenze, una per riga</span><textarea name="conseguenze" rows="4" placeholder="Pausa&#10;Attenzione&#10;Oggetto&#10;Ignorato">${(a.conseguenze || []).join('\n')}</textarea></label>
                    </div>
                    <span class="sotto piccolo">In seduta, dopo ogni episodio, si toccano antecedente e conseguenza (facoltativi).</span></div>
            </section>
            ${c ? h`<section class="ma-card">${testa('toggle-on', 'Stato')}<div class="scelta">
                <label><input type="radio" name="stato" value="attivo" ${c.stato !== 'sospeso' ? grezzo('checked') : ''}><span>Si monitora</span></label>
                <label><input type="radio" name="stato" value="sospeso" ${c.stato === 'sospeso' ? grezzo('checked') : ''}><span>Sospeso</span></label></div>
                <span class="sotto piccolo">Sospeso: sparisce dalla seduta, i dati restano.</span></section>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
            dopo: (el) => {
                el.querySelectorAll('.ma-chip > input[type=checkbox]').forEach((x) => x.addEventListener('change', () => x.closest('.ma-chip').classList.toggle('on', x.checked)));
                el.querySelectorAll('[data-ma-apri]').forEach((b) => b.addEventListener('click', () => {
                    const z = el.querySelector(`[data-ma-sez="${b.dataset.maApri}"]`), apri = z.hidden;
                    z.hidden = !apri; b.classList.toggle('on', apri); b.setAttribute('aria-pressed', apri ? 'true' : 'false');
                }));
            }
        });
    }
    async function andamentoComportamento(p, c) {
        const pt = C.andamento(p, c), R = C.riepilogo(pt);
        const tot = pt.reduce((n, x) => n + x.episodi, 0), min = pt.reduce((n, x) => n + x.minuti, 0);
        const lista = (l) => l.length ? h`<ul class="comp-lista">${l.slice(0, 6).map(([k, n]) => h`<li><span>${k}</span><b>${n}</b> <small class="sotto">${Math.round(100 * n / R.episodi)}%</small></li>`)}</ul>` : h`<p class="sotto piccolo">Non segnati.</p>`;
        const fasce = Object.keys(R.ore).map(Number).sort((a, b) => a - b);
        await foglio(h`<div><h2>${c.nome}</h2>
            <p class="sotto">${pt.length} ${pt.length === 1 ? 'giorno osservato' : 'giorni osservati'} · ${tot} episodi in ${C.numero(min / 60)} ore${c.obiettivo ? ` · obiettivo ≤ ${C.numero(c.obiettivo.max)} ${C.unita(c)} per ${c.obiettivo.giorni} giorni${C.aObiettivo(pt, c) ? ' · raggiunto' : ''}` : ''}</p>
            <div class="comp-grafico-box">${grezzo(C.grafico(pt, c))}</div>
            <p class="sotto piccolo">${C.unita(c)} per giorno: i salvataggi dello stesso giorno si sommano, con i loro minuti di osservazione.</p>
            ${R.episodi ? h`<div class="riga-campi comp-abc">
                <div><h3>Antecedenti</h3>${lista(R.antecedenti)}</div>
                <div><h3>Conseguenze</h3>${lista(R.conseguenze)}</div></div>
                ${c.intensita ? h`<h3>Intensità</h3><p>${[1, 2, 3].map((i) => `${C.INTENSITA[i]} ${R.intensita[i] || 0}`).join(' · ')}</p>` : ''}
                ${fasce.length ? h`<h3>Ore del giorno</h3><p class="comp-fasce">${fasce.map((o) => h`<span><b>${o}:00</b> ${R.ore[o]}</span>`)}</p>` : ''}` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Chiudi</button></div></div>`);
    }

    TiceHome.estendi({
        azioni: {
        'comp-nuovo': async () => {
            const p = paz(T.pid);
            if (!puoProgrammi(p)) return;
            const r = await moduloComportamento(null);
            if (!r) return;
            C.crea(p, r);
            await salvaPaziente(p);
            T.mantieniScroll = true; disegna();
        },
        'comp-mod': async (b) => {
            const p = paz(T.pid), c = C.trova(p, b.dataset.id);
            if (!c || !puoProgrammi(p)) return;
            const r = await moduloComportamento(c);
            if (!r) return;
            C.imposta(c, r);
            // il nome cambia anche nelle sedute già salvate
            (p.history || []).forEach((x) => { if (x.mode === 'comportamento' && x.comportamentoId === c.id) x.setName = c.nome; });
            await salvaPaziente(p);
            T.mantieniScroll = true; disegna();
        },
        'comp-andamento': async (b) => { const p = paz(T.pid), c = C.trova(p, b.dataset.id); if (c) await andamentoComportamento(p, c); },
        'comp-piu': (b) => {
            const p = paz(T.pid), c = C.trova(p, b.dataset.id);
            if (!c) return;
            const e = C.aggiungi(C.raccolta(bozza(p.id), c.id));
            ultimeDi(bozza(p.id)).push('comp:' + c.id);
            T.compUltimo = { pid: p.id, cid: c.id, eid: e.id };
            if (navigator.vibrate) navigator.vibrate(12);
            salvaBozza(); aggiornaStriscia(p);
        },
        'comp-durata': (b) => {
            const p = paz(T.pid), c = C.trova(p, b.dataset.id);
            if (!c) return;
            const e = C.alterna(C.raccolta(bozza(p.id), c.id));
            if (!e) ultimeDi(bozza(p.id)).push('comp:' + c.id);   // all'avvio: l'annulla lo ferma senza contarlo
            if (e) T.compUltimo = { pid: p.id, cid: c.id, eid: e.id };
            if (navigator.vibrate) navigator.vibrate(e ? [8, 40, 8] : 12);
            salvaBozza(); aggiornaStriscia(p);
        },
        'comp-dettaglio': (b) => {
            const p = paz(T.pid), u = T.compUltimo;
            if (!u) return;
            const r = C.raccolta(bozza(p.id), u.cid), e = r.episodi.find((x) => x.id === u.eid);
            if (!e) return;
            const k = b.dataset.k, v = k === 'i' ? +b.dataset.v : b.dataset.v;
            if (e[k] === v) delete e[k]; else e[k] = v;
            salvaBozza(); aggiornaStriscia(p);
        },
        'comp-chiudi-ultimo': () => { T.compUltimo = null; aggiornaStriscia(paz(T.pid)); },
        'comp-apri': async (b) => { const p = paz(T.pid), c = C.trova(p, b.dataset.id); if (c) await foglioComportamento(p, c); },
        },
        aggancio: { striscia, sezioneComportamenti, annullaComportamento }
    });
})();
