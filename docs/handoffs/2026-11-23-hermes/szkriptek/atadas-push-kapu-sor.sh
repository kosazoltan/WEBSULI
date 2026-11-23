#!/usr/bin/env bash
# Átadás előtti push-kapu sor: főág-összefésülés (ütközésnél visszavonás), node_modules, gate:push. Eredmény: push-eredmeny.tsv
S=${S:-$HOME/websuli-atadas-naplok}; mkdir -p "$S"
OUT=$S/push-eredmeny.tsv
source ~/.claude/scripts/websuli-kapusor.sh
kapusor_be "atadas push-kapu sor" || exit 1
trap 'rm -rf /c/Users/kosaz/.claude/websuli-kapusor.lock' EXIT
for n in advent-c advent-s6 tgm-s6c1 aranyos-kapuk tgm-s6c tgm-sk2 vak-v2 zaro-hurok szoletra-szintezes-2 szoletra-a1-bank szoletra-szintezes kitakaro-elovagas kisfilm-leallitas eredmeny-510 kisfilm-videomodell merge-kapu-rest kitakaro-521 vak-futtato-1 vak-futtato-2 vak-ellenor-deepseek docs-potlasok eredmeny-bontas foterv gepkoltoztetes-folytatas teljes-revizio advent-kepgyarto; do
  w=/d/repo/WEBSULI/.claude/worktrees/$n
  cd "$w" || { printf '%s\t-\t-\tNINCS_MUNKAFA\n' "$n" >>"$OUT"; continue; }
  b=$(git branch --show-current)
  if [ -n "$(git status --porcelain)" ]; then printf '%s\t%s\t%s\tPISZKOS_FA\n' "$n" "$b" "$(git rev-parse --short HEAD)" >>"$OUT"; continue; fi
  if ! git merge-base --is-ancestor origin/main HEAD; then
    if ! git merge -q --no-edit origin/main >"$S/merge-$n.log" 2>&1; then
      git merge --abort >/dev/null 2>&1
      printf '%s\t%s\t%s\tUTKOZES_A_FOAGGAL\t%s\n' "$n" "$b" "$(git rev-parse --short HEAD)" "$(git diff --name-only --diff-filter=U | head -3 | tr '\n' ' ')" >>"$OUT"; continue
    fi
  fi
  [ -d source/node_modules ] || npm.cmd ci --prefix source --ignore-scripts >"$S/ci-$n.log" 2>&1
  npm run gate:push >"$S/gate-$n.log" 2>&1
  if grep -q "pre-push-gate: ZÖLD" "$S/gate-$n.log"; then r=ZOLD; else r="BUKOTT"; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$n" "$b" "$(git rev-parse HEAD)" "$r" "$(grep -E '\| FAIL ' "$S/gate-$n.log" | cut -d'|' -f1 | sed 's/ *$//' | tr '\n' ';')" >>"$OUT"
done
echo KESZ >>"$OUT"
