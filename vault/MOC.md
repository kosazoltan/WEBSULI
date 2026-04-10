# WEBSULI Memória Rendszer — Map of Content (MOC)

> Generálva: 2026-04-10 | 42 forrás MD fájl osztályozva

## Memória Rétegek

```
memory/
├── procedural/
│   ├── deploy/         (15 fájl: deployment eljárások, SSH, VPS, GitHub Actions)
│   └── development/    (3 fájl: kód review, local setup, elemzés)
├── semantic/
│   ├── infrastructure/ (11 fájl: VPS info, SSH, MCP, Cloudflare, Hostinger)
│   └── technology/     (5 fájl: design, AI funckiók, teljesítmény)
├── episodic/
│   └── 2026/           (6 fájl: deploy státuszok, diagnosztikák, dev log)
└── projects/
    └── websuli/        (2 fájl: projekt overview, letöltés)

vault/
├── infrastructure/     (3 fájl: VPS, SSH, Secrets kanonikus)
├── development/        (3 fájl: Material Improver, Design, Performance)
└── MOC.md
```

## Procedural (deploy)
- `memory/procedural/deploy/deploy-check-deployment.md` ← CHECK-DEPLOYMENT.md
- `memory/procedural/deploy/deploy-database-recovery.md` ← DATABASE-RECOVERY.md
- `memory/procedural/deploy/deploy-now.md` ← DEPLOY-NOW.md
- `memory/procedural/deploy/deploy-vps-guide.md` ← DEPLOY-VPS.md
- `memory/procedural/deploy/github-actions-fix.md` ← GITHUB-ACTIONS-DEPLOYMENT-FIX.md
- `memory/procedural/deploy/github-ssh-key-guide.md` ← GITHUB-SECRETS-SSH-KEY-EXPLAINED.md
- `memory/procedural/deploy/github-ssh-key-fix.md` ← GITHUB-SECRETS-SSH-KEY-FIX.md
- `memory/procedural/deploy/ssh-key-info.md` ← SSH-KEY-INFO.md
- `memory/procedural/deploy/vercel-render-deploy.md` ← VERCEL_RENDER_TELEPITES.md
- `memory/procedural/deploy/vps-deploy-fix.md` ← VPS-DEPLOY-FIX.md
- `memory/procedural/deploy/github-actions-setup.md` ← source/GITHUB-ACTIONS-SETUP.md
- `memory/procedural/deploy/google-auth-setup.md` ← source/GOOGLE_AUTH_SETUP.md
- `memory/procedural/deploy/readme-hostinger.md` ← source/README-HOSTINGER.md
- `memory/procedural/deploy/readme-vps.md` ← source/README-VPS.md
- `memory/procedural/deploy/ssh-setup.md` ← source/SSH-SETUP.md

## Procedural (development)
- `memory/procedural/development/code-analysis-report.md` ← source/CODE_ANALYSIS_REPORT.md
- `memory/procedural/development/code-review-2024-12.md` ← source/CODE_REVIEW_2024_12.md
- `memory/procedural/development/readme-local.md` ← source/README-LOCAL.md

## Semantic (infrastructure)
- `memory/semantic/infrastructure/github-secrets-info.md` ← GITHUB-SECRETS-INFO.md
- `memory/semantic/infrastructure/hostinger-api-setup.md` ← HOSTINGER-API-SETUP.md
- `memory/semantic/infrastructure/hostinger-api-token.md` ← HOSTINGER-API-TOKEN-SETUP.md
- `memory/semantic/infrastructure/hostinger-vps-list.md` ← HOSTINGER-VPS-LIST.md
- `memory/semantic/infrastructure/mcp-config.md` ← MCP-CONFIG-FIXED.md
- `memory/semantic/infrastructure/mcp-status.md` ← MCP-READY.md + MCP-SETUP-COMPLETE.md
- `memory/semantic/infrastructure/ssh-connection-summary.md` ← SSH-CONNECTION-SUMMARY.md
- `memory/semantic/infrastructure/vps-config.md` ← VPS-CONFIG.md
- `memory/semantic/infrastructure/vps-ips-summary.md` ← VPS-IPS-SUMMARY.md
- `memory/semantic/infrastructure/websuli-vps-info.md` ← WEBSULI-VPS-INFO.md
- `memory/semantic/infrastructure/readme-cloudflare.md` ← source/README-CLOUDFLARE.md

## Semantic (technology)
- `memory/semantic/technology/design-implementation-plan.md` ← DESIGN-IMPLEMENTATION-PLAN.md
- `memory/semantic/technology/landing-performance-analysis.md` ← LANDING_PAGE_PERFORMANCE_ANALYSIS.md
- `memory/semantic/technology/material-improvement-feature.md` ← MATERIAL_IMPROVEMENT_FEATURE.md
- `memory/semantic/technology/material-improver-plan.md` ← MATERIAL_IMPROVER_PLAN.md
- `memory/semantic/technology/edu-platform-design-2026.md` ← edu-platform-design-prompt-2026.md

## Episodic (2026)
- `memory/episodic/2026/deployment-status-snapshot.md` ← DEPLOYMENT-STATUS.md
- `memory/episodic/2026/vps-deployment-check-2026.md` ← VPS-DEPLOYMENT-CHECK.md
- `memory/episodic/2026/vps-deployment-diagnosis.md` ← VPS-DEPLOYMENT-DIAGNOSIS.md
- `memory/episodic/2026/vps-diagnosis-result.md` ← VPS-DIAGNOSIS-RESULT.md
- `memory/episodic/2026/vps-project-analysis.md` ← VPS-PROJECT-ANALYSIS.md
- `memory/episodic/2026/session-dev-log.md` ← session.md

## Projects
- `memory/projects/websuli/project-overview.md` — projekt összefoglaló
- `memory/projects/websuli/readme-download.md` ← source/README-DOWNLOAD.md

## Vault (hosszú távú kanonikus tudás)
- `vault/infrastructure/hostinger-vps-canonical.md` — VPS IP-k, SSH, MCP
- `vault/infrastructure/github-secrets-canonical.md` — Secrets format, értékek
- `vault/infrastructure/ssh-canonical.md` — SSH config, kulcsok
- `vault/development/material-improver-canonical.md` — AI funkció kritikus tanulságok
- `vault/development/design-system-2026-canonical.md` — Magyar fontok, korcsoport design
- `vault/development/performance-optimization-canonical.md` — N+1, bundle, React

## Forrás fájlok (osztályozatlan eredetiek, megmaradnak)
32 gyökér MD fájl + 10 source/ MD fájl = 42 összesen
