# VAULT: GitHub Secrets Kanonikus Útmutató

## Szükséges Secrets
| Secret | Érték | Megjegyzés |
|--------|-------|------------|
| VPS_HOST | 31.97.44.1 | WebSuli Hostinger VPS |
| VPS_USERNAME | root | SSH user |
| VPS_SSH_KEY | privát kulcs teljes tartalma | BEGIN...END blokkokkal |

## Beállítás helye
https://github.com/kosazoltan/WEBSULI/settings/secrets/actions

## VPS_SSH_KEY helyes formátuma
```
-----BEGIN OPENSSH PRIVATE KEY-----
... (sok sor) ...
-----END OPENSSH PRIVATE KEY-----
```
NEM a nyilvános kulcs (`ssh-rsa AAAA...`)!

## SSH kulcs fájl
- Privát: `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli` (ezt kell a secretbe)
- Nyilvános: `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli.pub` (VPS authorized_keys-be)

## Cancelled workflow
NORMÁLIS: `concurrency: cancel-in-progress: true` törli az előző futást.
