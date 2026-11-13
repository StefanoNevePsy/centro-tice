#!/bin/sh
# Prove della corsia veloce con gli emulatori di Firebase (regole, custode, client veri).
# Servono Java e Node; le librerie si installano UNA volta fuori dal repository (vedi docs/firebase.md).
#   FB_DIR=cartella delle librerie (di serie ~/.cache/tice-firebase)
set -e
cd "$(dirname "$0")/.."
FB_DIR="${FB_DIR:-$HOME/.cache/tice-firebase}"
if [ ! -x "$FB_DIR/node_modules/.bin/firebase" ]; then
  echo "Installo gli strumenti di Firebase in $FB_DIR (una volta sola)…"
  mkdir -p "$FB_DIR" && (cd "$FB_DIR" && npm init -y >/dev/null && npm i --legacy-peer-deps firebase-tools@15 @firebase/rules-unit-testing firebase@13.1.0)
fi
export NODE_PATH="$FB_DIR/node_modules${NODE_PATH:+:$NODE_PATH}"
export GCLOUD_PROJECT=demo-tice
# la libreria di Firebase com'è in produzione (gstatic), per la prova con due browser
SDK="$FB_DIR/sdk-$(sed -n "s/.*var SDK_VERSIONE = '\([0-9.]*\)'.*/\1/p" js/tice-veloce.js)"
if [ ! -f "$SDK/firebase-firestore.js" ]; then
  mkdir -p "$SDK"
  for f in firebase-app.js firebase-auth.js firebase-firestore.js; do
    curl -fsS -o "$SDK/$f" "https://www.gstatic.com/firebasejs/${SDK##*sdk-}/$f" || rm -f "$SDK/$f"
  done
fi
export TICE_SDK_DIR="$SDK"
node tools/test-tice-veloce.js
"$FB_DIR/node_modules/.bin/firebase" emulators:exec --only firestore,auth --project demo-tice "node tools/test-firebase.js && node tools/test-firebase-browser.js"
