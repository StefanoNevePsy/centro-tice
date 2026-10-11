#!/bin/bash
# Pubblica il Centro TICE su GitHub Pages dal branch giusto, senza aprire il browser.
# Doppio clic dal Finder. Serve il programma «gh» di GitHub, una volta sola:
#   brew install gh      e poi      gh auth login
REPO="StefanoNevePsy/centro-tice"
BRANCH="claude/quaderno-tice"

cd "$(dirname "$0")" || exit 1
if ! command -v gh >/dev/null 2>&1; then
  echo "Manca «gh». Installalo con:  brew install gh   e poi:  gh auth login"
  read -r -p "Premi Invio per chiudere…" _; exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Prima accedi a GitHub:"; gh auth login || exit 1
fi

echo "Pubblico «$BRANCH» su https://stefanonevepsy.github.io/centro-tice/ …"
gh workflow run pages.yml -R "$REPO" --ref main -f branch="$BRANCH" || { read -r -p "Non riuscito. Premi Invio…" _; exit 1; }
sleep 6
ID=$(gh run list -R "$REPO" --workflow pages.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$ID" -R "$REPO" --exit-status && echo "Fatto: l'app si aggiorna da sola alla prossima apertura." || echo "Il deploy non è andato a buon fine: guarda su GitHub › Actions."
read -r -p "Premi Invio per chiudere…" _
