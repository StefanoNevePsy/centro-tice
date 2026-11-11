#!/bin/sh
# Tutti i test del Centro TICE, uno dopo l'altro: si ferma al primo che fallisce.
# Li usano la verifica automatica e la pubblicazione (che non parte se uno fallisce).
set -e
cd "$(dirname "$0")/.."
node tools/componi-custode.js --verifica
for t in custode appsscript tice-sync accesso-desktop tice-import tice-modalita tice-stampa orario tice-turni tice-ta tice-td tice-lu tice-comportamenti scc; do
  echo "== $t"
  node "tools/test-$t.js"
done
for f in js/numbers-reader.js js/tice-*.js js/state.js js/patients.js js/dataviz.js js/gemini.js js/app.js tice-config.js sw.js electron/*.js; do node --check "$f"; done
echo "Tutti i test superati"
