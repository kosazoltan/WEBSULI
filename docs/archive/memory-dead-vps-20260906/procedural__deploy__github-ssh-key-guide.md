---
id: procedural_deploy_20260410_106
type: procedural
domain: deploy
created: 2026-04-10
source: GITHUB-SECRETS-SSH-KEY-EXPLAINED.md
tags: [ssh, github-secrets, private-key, public-key]
project: websuli
---

# GitHub Secrets: SSH Kulcs Útmutató

## Mit kell beírni a VPS_SSH_KEY-be
A PRIVÁT kulcsot kell beírni, NEM a nyilvánosat.

## Privát kulcs ismérvei (HELYES)
- Fájl: `id_rsa_websuli` (nincs .pub kiterjesztés)
- Kezdés: `-----BEGIN OPENSSH PRIVATE KEY-----`
- Hossz: 1500-3500 karakter, sok sor

## Nyilvános kulcs ismérvei (ROSSZ a secrethez)
- Fájl: `id_rsa_websuli.pub`
- Kezdés: `ssh-rsa AAAA...`
- Egyetlen sor, 300-500 karakter

## GitHub Secret beállítása
1. https://github.com/kosazoltan/WEBSULI/settings/secrets/actions
2. VPS_SSH_KEY → Update
3. `Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli"` kimenetét illessze be
4. Update secret
