# VAULT: SSH Kanonikus Tudás

## SSH Config (`~/.ssh/config`)
```
Host websuli
    HostName 31.97.44.1
    User root
    IdentityFile C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

## Gyors parancsok
```bash
ssh websuli                              # belépés
ssh websuli "pm2 status"                # státusz
ssh websuli "cd /var/www/websuli/source && git log -1 --oneline"
```

## SSH kulcs generálás
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa_websuli
```

## Authorized keys hozzáadása
```powershell
type "$env:USERPROFILE\.ssh\id_rsa_websuli.pub" | ssh root@31.97.44.1 "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

## Cloudflare SSL (521 hiba)
- Flexible mód: ha nincs SSL cert a szerveren
- Full mód: ha Certbot lefutott
- Tűzfal: Port 80 és 443 engedélyezve kell legyen
