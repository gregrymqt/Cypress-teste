# Plano de Execução — Lote 1: Git Hygiene, PRs com CI & Atalhos do Hub

## Contexto e Objetivos
- **Objetivo**: Salvar as alterações pendentes do `Gestao-Restaurante` em 2 commits atômicos, abrir PR e dar merge com validação de CI; publicar e configurar o repositório `Cypress-teste` no GitHub com branch de feature (2 commits: atalhos `package.json` + workflow de CI GitHub Actions), abrir PR, validar CI e dar merge.
- **Invariantes**:
  - Código, commits e mensagens técnicas em **inglês**.
  - Documentação e logs em **português**.
  - Árvore de trabalho limpa ao término de cada etapa (`git status` limpo).
  - Nunca commitar `graft/`, credenciais ou arquivos `.env`.

---

## Checklist de Execução

### Etapa 1: Gestao-Restaurante (Branch, 2 Commits, PR e Merge)
- [ ] **1.1 Criar branch de feature**: `git checkout -b feat/qa-contracts-security-and-frontend-cleanup`
- [ ] **1.2 Commit 1 (QA & Infra)**:
  - Staging: `git add qa-contracts.json infra/nginx/conf.d/default.conf .dockerignore`
  - Commit: `git commit -m "feat(qa): add declarative qa-contracts and nginx security headers"`
- [ ] **1.3 Commit 2 (Frontend Hooks & Logs)**:
  - Staging: `git add src/frontend/ features/ docs/orquestracao/02-log-execucao.md`
  - Commit: `git commit -m "feat(frontend): improve abort signal propagation and resilient hooks"`
- [ ] **1.4 Push & PR**:
  - Push: `git push -u origin feat/qa-contracts-security-and-frontend-cleanup`
  - PR: `gh pr create --fill`
- [ ] **1.5 Validar CI & Merge**:
  - Monitorar: `gh pr checks --watch`
  - Merge: `gh pr merge --squash --delete-branch`
  - Sincronizar: `git checkout main && git pull`

### Etapa 2: Cypress-teste (Init, Base Commit, Shortcuts, CI e PR)
- [ ] **2.1 Criação do repositório remoto e base commit**:
  - Garantir branch `main`: `git branch -M main`
  - Criar repo público: `gh repo create gregrymqt/Cypress-teste --public --source=. --remote=origin`
  - Staging dos arquivos base do hub e commit inicial: `git commit -m "chore: initial commit for universal autonomous cypress qa hub"`
  - Push base: `git push -u origin main`
- [ ] **2.2 Criar branch de feature**: `git checkout -b feat/qa-shortcuts-and-ci`
- [ ] **2.3 Commit 1 (Atalhos no package.json)**:
  - Adicionar `"qa:smoke"`, `"qa:all"`, `"qa:full"` em `package.json:13`.
  - Commit: `git commit -m "feat(scripts): add qa:smoke, qa:all, and qa:full shortcuts to package.json"`
- [ ] **2.4 Commit 2 (Workflow de CI & Flag --help)**:
  - Suporte a flag `--help` em `scripts/run-battery.cjs:46`.
  - Criar `.github/workflows/ci.yml:1` com validações de sintaxe e Cypress verify.
  - Commit: `git commit -m "ci: add github actions workflow for syntax, cypress verification and cli help"`
- [ ] **2.5 Push, PR, CI & Merge**:
  - Push: `git push -u origin feat/qa-shortcuts-and-ci`
  - PR: `gh pr create --fill`
  - Monitorar: `gh pr checks --watch`
  - Merge: `gh pr merge --squash --delete-branch`
  - Sincronizar: `git checkout main && git pull`
