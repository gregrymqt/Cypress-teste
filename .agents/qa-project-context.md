# QA Project Context: Universal Autonomous QA Hub

> Context consumed by AI Agents and automation runners. Keeps operations fast, lean, and deterministic.

---

## 1. Universal Architecture Overview
- **Repository Purpose**: Universal, multi-target automated QA Hub. Agnostic of project or technology stack.
- **Modes of Operation**:
  1. **Black-Box (URL Mode)**: Runs against any live URL (`--url=https://...`), discovers API/Swagger routes, checks security headers, and launches an autonomous crawler/fuzzer across Desktop and Mobile viewports.
  2. **White-Box (Repo Mode)**: Runs against a local repository directory (`--repo=../projeto`), probes Docker services, active databases (Postgres, MySQL, SQL Server) and Redis cache via `scripts/infra-checker.cjs`, then runs the test battery.

---

## 2. Command Reference for AI Agents

All testing executions are invoked via `scripts/run-battery.cjs`:

```bash
# 1. Run full battery against a live URL (API + Desktop Fuzz + Mobile Fuzz)
node scripts/run-battery.cjs --url=https://example.com

# 2. Run with authentication
node scripts/run-battery.cjs --url=http://localhost:3000 --auth-user=admin@example.com --auth-pass=Secret123 --auth-url=/login

# 3. Run with local repository inspection (DB, Redis, Docker)
node scripts/run-battery.cjs --repo=../Gestao-Restaurante --url=http://localhost:5000

# 4. Run specific stages
node scripts/run-battery.cjs --url=https://example.com --stage=api      # API & Swagger Discovery
node scripts/run-battery.cjs --url=https://example.com --stage=desktop  # Desktop UI & Fuzzing
node scripts/run-battery.cjs --url=https://example.com --stage=mobile   # Mobile UI & Fuzzing
node scripts/run-battery.cjs --url=https://example.com --stage=ui       # Desktop + Mobile UI
node scripts/run-battery.cjs --url=http://localhost --project=gestao-restaurante --stage=domain # Domain-specific tests
node scripts/run-battery.cjs --url=http://localhost --project=gestao-restaurante --stage=full   # Universal + Domain tests

# 5. Domain Specs Isolation Convention
Domain tests must be isolated under `cypress/e2e/domains/<project>/` (e.g. `cypress/e2e/domains/gestao-restaurante/`).
The runner automatically resolves this folder using `--project=<name>` (normalized to lowercase kebab-case) or `--repo=<path>`.

# 6. Check local infrastructure services independently
node scripts/infra-checker.cjs --repo=../Gestao-Restaurante

# 7. Declarative Repository Contracts (qa-contracts.json)
The runner automatically discovers `qa-contracts.json` at `<repoPath>/qa-contracts.json` (or `./qa-contracts.json` when `--repo` is omitted) and exposes it to Cypress via `QA_CONTRACTS`.
Stage 1.5 of `cypress/e2e/universal/01-api-scanner.cy.js` executes declarative endpoint contracts:
```json
{
  "auth": { "loginUrl": "/api/v1/auth/login", "body": { "email": "...", "senha": "..." }, "tokenPath": "token" },
  "endpoints": [
    { "method": "GET", "path": "/api/v1/produtos", "auth": true, "expectedStatus": 200, "requiredFields": ["items"] }
  ]
}
```
```

---

## 3. Results & Telemetry Directory
Every execution writes structured metrics directly to:
`qa-results/<target-or-project>/<YYYY-MM-DD>/execucao-XX/`

- `summary.json`: Summary metrics (`totalTests`, `totalPassed`, `totalFailed`, `durationSeconds`, `infraReport`).
- `run.json`: Complete raw Cypress execution metadata.
- `screenshots/`: Automatically generated screenshots for any failed assertions or layout overflows.

---

## 4. Coding & Fuzzing Conventions
- **Language**: English for code, variable identifiers, and comments; Portuguese for plans, logs, and user reports.
- **Fuzzing Engine**: `cy.crawlAndFuzz()` executes bounded interactions with all visible buttons, links, inputs, and tabs.
- **UX Heuristics**: `cy.checkUXHeuristics()` validates absence of horizontal overflow (`scrollWidth <= clientWidth`).
- **Viewports**:
  - Desktop: `1280x800`, `1920x1080`
  - Mobile: `375x667` (iPhone SE), `390x844` (iPhone 14)
