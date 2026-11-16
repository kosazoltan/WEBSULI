#!/usr/bin/env bash
# Telepítés előtti őr: van-e AKTÍV tananyaggyártás / javítás / okosítás az éles adatbázisban?
#
# Használat (minden `gh pr merge` ELŐTT, a repó gyökeréből):
#   bash scripts/qa/active-runs-guard.sh
# Kilépési kód: 0 = nincs aktív futás (összevonható), 1 = van aktív futás (NE vonj össze; a darabszámokat kiírja),
#               2 = hiba (nem sikerült lekérdezni; ilyenkor sem szabad vakon összevonni).
# Runbook: docs/telepites-elotti-or.md
#
# Működés: CSAK OLVASÓ lekérdezés (egyetlen SELECT) a Neon SQL-over-HTTP végpontján, `Neon-Batch-Read-Only: true`
# fejléccel. A kapcsolati szöveg (DATABASE_URL) soha nem kerül parancssorba, naplóba vagy kimenetbe: a curl a
# fejlécet a szabványos bemeneten kapott konfigból olvassa (`-K -`).
#
# Miért `curl`, és nem Node: a fejlesztői gépen a Node TLS-kapcsolata a Neon felé nem megy, a `curl` igen.
# Miért nincs `bc`: a Git Bash-ben nincs `bc` (2026-11-16-án a hiánya miatt üres összeg jött ki) — az összeget a
# shell számolja.
#
# A DATABASE_URL forrása: a már beállított környezeti változó, különben a `source/.env` (munkafában a fő
# checkout `source/.env` fájlja; felülírható: GUARD_ENV_FILE). Semmit nem égetünk be.
set -u

fail() { echo "GUARD_ERROR: $1" >&2; exit 2; }

URL="${DATABASE_URL:-}"
if [ -z "$URL" ]; then
  ENV_FILE="${GUARD_ENV_FILE:-}"
  if [ -z "$ENV_FILE" ]; then
    ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || fail "nem git-repóban futott"
    ENV_FILE="$ROOT/source/.env"
    if [ ! -f "$ENV_FILE" ]; then
      # Munkafa: a fő checkout a közös git-könyvtár szülője.
      COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || COMMON=""
      [ -n "$COMMON" ] && ENV_FILE="$(dirname "$COMMON")/source/.env"
    fi
  fi
  [ -f "$ENV_FILE" ] || fail "nincs DATABASE_URL és nincs .env fájl (GUARD_ENV_FILE)"
  CR=$(printf '\015')
  URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//' | tr -d "$CR")
fi
[ -n "$URL" ] || fail "nincs DATABASE_URL"

HOST=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#')
case "$HOST" in
  ""|*"://"*) fail "a DATABASE_URL gazdaneve nem olvasható ki" ;;
esac

SQL="SELECT (SELECT count(*) FROM lesson_workflow_runs WHERE state IN ('running','waiting') AND lease_until > now()) AS workflow, (SELECT count(*) FROM studio_jobs WHERE status IN ('pending','running') AND finished_at IS NULL AND created_at > now() - interval '6 hours') AS studio, (SELECT count(*) FROM improved_html_files WHERE status = 'processing') AS improve, (SELECT count(*) FROM one_step_runs WHERE phase NOT IN ('done','parked','error') AND updated_at > now() - interval '30 minutes') AS onestep"
BODY=$(printf '{"query": "%s", "params": []}' "$SQL")

OUT=$(printf 'header = "Neon-Connection-String: %s"\nheader = "Neon-Batch-Read-Only: true"\nheader = "Content-Type: application/json"\n' "$URL" \
  | curl -s -m 30 -K - -X POST "https://$HOST/sql" --data "$BODY" 2>/dev/null)

if ! printf '%s' "$OUT" | grep -q '"rows"'; then
  # A hibaüzenetből a kapcsolati szöveg mintája is kiszűrve, rövidítve.
  echo "GUARD_ERROR: $(printf '%s' "$OUT" | sed -E 's#postgres(ql)?://[^"[:space:]]*#<rejtve>#g' | cut -c1-300)" >&2
  exit 2
fi

# A Neon a számlálókat idézőjelben adja: "rows":[{"workflow":"0","studio":"0","improve":"0","onestep":"0"}]
# (tömb-módban ["0","0","0","0"]); a sorrend mindkét esetben a SELECT oszlopaié. A sor nem tartalmaz ']' jelet.
ROW=$(printf '%s' "$OUT" | sed -E 's/.*"rows":\[([^]]*)\].*/\1/')
# shellcheck disable=SC2046
set -- $(printf '%s' "$ROW" | grep -oE '"[0-9]+"' | tr -d '"')
[ "$#" -eq 4 ] || fail "a válasz sora nem négy számláló (kapott: $#)"
SUM=0
for n in "$1" "$2" "$3" "$4"; do SUM=$((SUM + n)); done
DETAIL=" workflow=$1 studio=$2 improve=$3 onestep=$4"

echo "GUARD_COUNTS:$DETAIL"
echo "AKTIV=$SUM"
if [ "$SUM" -gt 0 ]; then
  echo "GUARD: van aktív futás — NE vonj össze / telepíts, várd meg a végét." >&2
  exit 1
fi
echo "GUARD: nincs aktív futás."
exit 0
