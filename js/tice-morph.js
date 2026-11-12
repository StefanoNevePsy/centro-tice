/**
 * Centro TICE — ridisegno parziale della schermata («morph» del DOM).
 *
 * TiceMorph.aggiorna(radice, htmlNuovo) costruisce il nuovo albero in un <template> e lo
 * riconcilia con quello che c'è già: i nodi uguali restano, cambiano solo attributi e testo
 * dove differiscono, i figli si inseriscono, tolgono e riordinano per chiave. Così non si
 * perdono focus, testo scritto, scorrimento, <details> aperti, né ripartono le animazioni.
 * Senza librerie. Il risultato è lo stesso di radice.innerHTML = htmlNuovo, tranne per lo
 * stato scelto dall'utente (campi col focus, <details> aperti da lui, contenitori saltati).
 *
 * Chiave di un elemento: id, poi data-att, data-pid, data-id, data-morph (con tag e, per
 * quelli non-id, data-a; i doppioni si distinguono col numero d'ordine). Senza chiave:
 * per posizione e tag.
 *
 * Contenitori riempiti da altro codice dopo il disegno: se ci sono già, non si entra
 * (nemmeno negli attributi): [data-grafici], #tice-gis, [data-scc], [data-morph-salta].
 * Se hanno data-morph-firma e questa cambia, il contenitore si rimonta (nodo nuovo e vuoto).
 *
 * Interruttore: localStorage.tice_morph = '0' lo spegne (si torna a innerHTML).
 */
(function () {
    'use strict';

    const CHIAVI = ['id', 'data-att', 'data-pid', 'data-id', 'data-morph'];
    const SALTA = '[data-grafici], #tice-gis, [data-scc], [data-morph-salta]';
    // lo stato «open» che l'ultimo HTML generato dava a ogni <details>: serve a capire se lo ha cambiato l'utente
    const apertoGenerato = new WeakMap();

    function attivo() {
        try { return localStorage.getItem('tice_morph') !== '0'; } catch (e) { return true; }
    }
    const eElemento = (n) => n.nodeType === 1;
    const daSaltare = (n) => eElemento(n) && n.matches(SALTA);
    const firma = (n) => n.getAttribute('data-morph-firma') || '';

    function chiaveBase(n) {
        if (!eElemento(n)) return null;
        for (const c of CHIAVI) {
            const v = n.getAttribute(c);
            if (v) return n.nodeName + '|' + c + '|' + v + (c === 'id' ? '' : '|' + (n.getAttribute('data-a') || ''));
        }
        return null;
    }
    // chiavi dei fratelli, rese uniche: la seconda volta che compare la stessa prende #1, e così via
    function chiaviDi(nodi) {
        const conta = Object.create(null);
        return nodi.map((n) => {
            const k = chiaveBase(n);
            if (k === null) return null;
            const i = conta[k] || 0;
            conta[k] = i + 1;
            return k + '#' + i;
        });
    }
    function compatibili(a, b) {
        if (a.nodeType !== b.nodeType) return false;
        if (!eElemento(a)) return true;
        if (a.nodeName !== b.nodeName) return false;
        if (daSaltare(a) !== daSaltare(b)) return false;
        if (daSaltare(a) && firma(a) !== firma(b)) return false;
        if (a.nodeName === 'INPUT' && a.getAttribute('type') !== b.getAttribute('type')) return false;
        return true;
    }
    function registra(n) {
        if (!eElemento(n)) return;
        if (n.nodeName === 'DETAILS') apertoGenerato.set(n, n.hasAttribute('open'));
        n.querySelectorAll('details').forEach((d) => apertoGenerato.set(d, d.hasAttribute('open')));
    }

    function attributi(a, b, focus) {
        const salta = (nome) => (a.nodeName === 'DETAILS' && nome === 'open') || (focus && (nome === 'value' || nome === 'checked' || nome === 'selected'));
        [...a.attributes].forEach((at) => { if (!b.hasAttribute(at.name) && !salta(at.name)) a.removeAttribute(at.name); });
        [...b.attributes].forEach((at) => {
            if (salta(at.name) || a.getAttribute(at.name) === at.value) return;
            if (at.namespaceURI) a.setAttributeNS(at.namespaceURI, at.name, at.value); else a.setAttribute(at.name, at.value);
        });
    }

    function figli(a, b) {
        const vecchi = [...a.childNodes], nuovi = [...b.childNodes];
        const kv = chiaviDi(vecchi), kn = chiaviDi(nuovi);
        const chiaveDi = new Map(), mappa = new Map();
        vecchi.forEach((n, i) => { chiaveDi.set(n, kv[i]); if (kv[i]) mappa.set(kv[i], n); });
        const servono = new Set(kn.filter(Boolean));
        const liberi = vecchi.filter((n, i) => !kv[i]);
        const usati = new Set();
        let inizio = 0, rif = a.firstChild;
        nuovi.forEach((nc, i) => {
            // i vecchi con chiave che non servono più si tolgono subito: così quelli che restano non vengono spostati
            while (rif && chiaveDi.get(rif) && !servono.has(chiaveDi.get(rif))) { const s = rif.nextSibling; a.removeChild(rif); rif = s; }
            let m = null;
            if (kn[i]) {
                const c = mappa.get(kn[i]);
                if (c && !usati.has(c) && compatibili(c, nc)) m = c;
            } else {
                while (inizio < liberi.length && usati.has(liberi[inizio])) inizio++;
                for (let j = inizio; j < liberi.length; j++) { const c = liberi[j]; if (!usati.has(c) && compatibili(c, nc)) { m = c; break; } }
            }
            if (m) {
                usati.add(m);
                if (m === rif) rif = rif.nextSibling; else a.insertBefore(m, rif);
                nodo(m, nc);
            } else {
                a.insertBefore(nc, rif);
                registra(nc);
            }
        });
        while (rif) { const s = rif.nextSibling; a.removeChild(rif); rif = s; }
    }

    function nodo(a, b) {
        if (!eElemento(a)) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
        if (daSaltare(a)) return;
        const focus = document.activeElement === a;
        attributi(a, b, focus);
        const tag = a.nodeName;
        if (tag === 'TEMPLATE') { if (a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML; return; }
        if (tag === 'TEXTAREA') { if (!focus) { figli(a, b); a.value = b.value; } return; }
        if (tag === 'SELECT') {
            const scelto = focus ? a.value : null;
            figli(a, b);
            const nuove = [...b.options];
            if (focus) { if ([...a.options].some((o) => o.value === scelto)) a.value = scelto; }
            else [...a.options].forEach((o, i) => { if (nuove[i]) o.selected = nuove[i].selected; });
            return;
        }
        figli(a, b);
        if (tag === 'DETAILS') {
            // l'apertura scelta dall'utente resta, se l'HTML non l'ha cambiata rispetto a quello di prima
            const nuovo = b.hasAttribute('open');
            const prima = apertoGenerato.has(a) ? apertoGenerato.get(a) : nuovo;
            if (nuovo !== prima) a.open = nuovo;
            apertoGenerato.set(a, nuovo);
        } else if (tag === 'INPUT' && !focus) {
            const tipo = String(a.getAttribute('type') || '').toLowerCase();
            if (tipo === 'checkbox' || tipo === 'radio') a.checked = b.hasAttribute('checked');
            else if (tipo !== 'file') { const v = b.getAttribute('value'); a.value = v == null ? '' : v; }
        }
    }

    function aggiorna(radice, htmlNuovo) {
        const t = document.createElement('template');
        t.innerHTML = String(htmlNuovo);
        const att = document.activeElement;
        const dentro = !!att && att !== document.body && att !== radice && radice.contains(att);
        let sel = null;
        if (dentro) { try { sel = [att.selectionStart, att.selectionEnd, att.selectionDirection]; } catch (e) { /* niente */ } }
        figli(radice, t.content);
        // rete di sicurezza: se per uno spostamento l'elemento ha perso il focus, glielo si ridà
        if (dentro && att.isConnected && document.activeElement !== att) {
            try { att.focus({ preventScroll: true }); if (sel && sel[0] != null) att.setSelectionRange(sel[0], sel[1], sel[2] || 'none'); } catch (e) { /* niente */ }
        }
    }
    // dopo un ridisegno completo (innerHTML): registra lo stato «generato» dei <details>
    function segna(radice) { registra(radice); }

    window.TiceMorph = { aggiorna, segna, attivo };
})();
