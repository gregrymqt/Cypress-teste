# Log de Execução de Tarefas

## [2026-11-22] Universal Autonomous QA Hub (Black-Box & White-Box)
- Desacoplamento total de `gestao-restaurante`: removidas specs acopladas e configurado runner 100% dinâmico.
- Criadas specs universais (`01-api-scanner.cy.js`, `02-desktop-fuzzer.cy.js`, `03-mobile-fuzzer.cy.js`) com crawling e fuzzing autônomo.
- Implementado `scripts/infra-checker.cjs` para probing de portas (Postgres, MySQL, Redis, Web) e docker-compose.
- Integrado `scripts/run-battery.cjs` com suporte a `--url`, `--repo`, `--stage`, `--auth-user`, salvando relatórios em `qa-results/`.
- Validada execução ponta a ponta com sucesso nos modos URL e Repo.
- Executada bateria desktop headed em `http://localhost/` (`node scripts/run-battery.cjs --stage=desktop --url=http://localhost/ --headed`): 2 testes passaram com sucesso (viewports desktop e desktop-hd).
- Ajustado `02-desktop-fuzzer.cy.js` para migração de `cy.env(['AUTH_USER', ...])` no Cypress 16.
- Adicionada geração automática de `report.md` no runner `scripts/run-battery.cjs` detalhando erros (stack, spec, screenshot) e acertos, com espelhamento em `qa-results/ULTIMO-RELATORIO.md`.

## [2026-11-22] Refatoração & Upgrade: Universal Autonomous QA Hub
- **Governança & Ponto de Entrada**: Criado `AGENTS.md` definindo `.agents/qa-project-context.md` como autoridade canônica, uso obrigatório de `.agents/skills/`, e atualização de `01-plano-atual.md` e `02-log-execucao.md`.
- **Runners Node (`scripts/`)**:
  - `run-battery.cjs`: Adicionadas flags `--safe-mode` e `--allow-mutations`. Implementada regra de segurança padrão (`SAFE_MODE=true` quando `--url` for fornecido sem `--repo` e sem `--allow-mutations`). Adicionado suporte a `--stage=domain` (auto-descoberta de specs `cypress/e2e/*.cy.js` exceto `smoke.cy.js`) e `--stage=full` (universal + domain).
  - `infra-checker.cjs`: Adicionada flag `--strict` (código 1 em falha de serviços obrigatórios declarados no `docker-compose`).
- **Comandos de Suporte Cypress (`cypress/support/`)**:
  - `e2e.js`: Movido `Cypress.on('uncaught:exception')` para registro global único. Coletor per-test para exceções JS não tratadas e status HTTP 5xx com asserção estrita em `afterEach` (zero erros críticos).
  - `commands.js`: Criado `cy.loginSession()` usando `cy.session()` com seletores resilientes e fallback de regex (`/entrar|login|acessar/i`).
  - `commands.js`: `cy.crawlAndFuzz()` atualizado para interceptar/bloquear mutações HTTP (`POST`/`PUT`/`PATCH`/`DELETE`) e ignorar botões destrutivos quando em `SAFE_MODE`.
  - `commands.js`: `cy.checkUXHeuristics()` enriquecido com validação de imagens quebradas (`naturalWidth === 0`) além do controle de overflow horizontal.
- **Specs Universais (`cypress/e2e/universal/`)**:
  - `01-api-scanner.cy.js`: Asserção de headers de segurança HTTP (`X-Content-Type-Options`, `X-Frame-Options` ou CSP); bloqueio de Swagger público desprotegido em `SAFE_MODE` (a menos que `ALLOW_OPEN_SWAGGER=true`); inspeção de `Content-Encoding` (`gzip` ou `br`).
  - `02-desktop-fuzzer.cy.js` & `03-mobile-fuzzer.cy.js`: Removidos handlers duplicados de exceção em `beforeEach`; autenticação mobile e desktop unificada via `cy.loginSession()`; crawling respeitando `SAFE_MODE`.
- **Specs de Domínio (`cypress/e2e/`)**:
  - `smoke.cy.js`: Atualizado com validação real de HTTP < 500, renderização de corpo e ausência de exceções JS.
  - `gestao-restaurante-discriminatorio.cy.js`: Centralizados testes de segurança; adicionados testes de RBAC (403 em `/api/v1/admin/tenants`), JWT inválido (401) e Rate Limiting (429 sob burst, pulando se `SAFE_MODE=true`).
  - `gestao-restaurante-frontend-battery.cy.js`: Otimizado com `cy.loginSession()` no `beforeEach`; asserções atualizadas para `.should('be.visible')`; teste de compressão Nginx ajustado; duplicatas de login removidas.
  - `gestao-restaurante-fluxo-operacional.cy.js`: Criada spec de fluxo operacional completo (Login Gestor -> Abertura de Caixa -> PDV -> Montagem e Submissão de Pedido -> KDS e Persistência), com skip automático se `SAFE_MODE=true`.
- **Verificação**: Sintaxe validada via `node --check` com saída limpa; `infra-checker.cjs` validado nos modos normal e `--strict`; `smoke.cy.js` executado com sucesso (2/2 testes aprovados).

## [2026-11-22] Correções Cirúrgicas e Isolamento Multi-Projeto (Domains)
- **Isolamento de Domínio**: Criado `cypress/e2e/domains/gestao-restaurante/` e migradas as 3 specs de negócio (`discriminatorio`, `frontend-battery`, `fluxo-operacional`). Atualizados `scripts/run-battery.cjs`, `AGENTS.md` e `.agents/qa-project-context.md` para suportar `--project=<name>` em kebab-case com auto-descoberta dinâmica de specs.
- **Bug #1 (Health vs Swagger Probes)**: Probes divididas em `healthProbes` (telemetria 200 OK sem falha) e `swaggerProbes` (bloqueio de schemas JSON públicos desprotegidos em `SAFE_MODE`) em `01-api-scanner.cy.js`. Adicionado filtro para schemas JSON autênticos prevenindo falsos positivos por fallbacks HTML de SPAs.
- **Bugs #2 & #3 (Comandos & cy.session)**: Substituído `cy.log` por `console.log` no interceptor de rede em `commands.js` evitando corrupção da fila do Cypress. Endurecido `cy.loginSession` com asserção explícita de inputs, monitoramento de transição de rota/DOM e validação estrita de tokens/cookies em `validate()`. Adicionado polyfill de compatibilidade transparente para Cypress 16 em `cypress/support/e2e.js`.
- **Bug #4 (RBAC Estrito)**: Eliminado fallback permissivo em `gestao-restaurante-discriminatorio.cy.js`. Asserção mandatória de login 200 OK, token válido e status 403 Forbidden em `/api/v1/admin/tenants`.
- **Bug #5 (Fluxo Operacional Estrito)**: Eliminados skips silenciosos em `gestao-restaurante-fluxo-operacional.cy.js`; adicionadas asserções obrigatórias para catálogo PDV (`productCards.length > 0`), captura dinâmica do nome do produto, botão de finalização no checkout e verificação persistente do item no KDS antes e após reload.
- **Validação**: Sintaxe 100% válida via `node --check`; saída controlada com código 1 para projetos sem domínio em `--stage=domain`; execução de `01-api-scanner.cy.js` aprovada com 3/3 testes verdes; execução de `smoke.cy.js` aprovada com 2/2 testes verdes.

## [2026-11-22] Bloco 1/3: Prontidão Cypress 16, Esperas Determinísticas & Coletor Controlado
- Implementados helpers `getPublicFlag()` e `cy.withSecrets()` em `cypress/support/commands.js`, refatorando checagens de `SAFE_MODE`, `ALLOW_MUTATIONS` e `ALLOW_OPEN_SWAGGER`.
- Atualizado `scripts/run-battery.cjs` para passar flags públicas via `config.expose` em Cypress 16+ preservando `env` estritamente para credenciais.
- Eliminados `cy.wait(150)` e `cy.wait(200)` em `commands.js` e `03-mobile-fuzzer.cy.js` em favor de asserções determinísticas de visibilidade e ausência de `[aria-busy="true"]`.
- Adicionado array `expectedHttpErrors` e comando `cy.allowHttpErrors([500, 503])` em `cypress/support/e2e.js` e `commands.js`, além do helper `cy.assertNoRequest(alias)`.
- Validados sintaxe (`node --check`) e execução de smoke (`--stage=smoke`) com 100% de sucesso (3/3 testes aprovados).

## [2026-11-22] Bloco 2/3: Contratos OpenAPI Dinâmicos & Acessibilidade WCAG
- Integrada validação dinâmica de rotas OpenAPI GET (até 10 rotas parameterless seguras) em `01-api-scanner.cy.js` verificando ausência de 5xx e tipos JSON condizentes.
- Enriquecido `cy.checkUXHeuristics` em `commands.js` com validações DOM sem dependências para nomes acessíveis e labels de formulários, com suporte seguro a `cypress-axe`.
- Migrada autenticação nos fuzzers universais (`02-desktop-fuzzer.cy.js` e `03-mobile-fuzzer.cy.js`) para `cy.withSecrets()`.
- Validada execução das baterias com sucesso total: `--stage=api` (3/3 aprovados) e `--stage=smoke` (3/3 aprovados).

## [2026-11-22] Bloco 3/3: Aprofundamento de Domínio (gestao-restaurante), cy.task & IDOR
- Registradas tarefas Node `db:seed` e `downloads:clear` em `cypress.config.js` com retorno estrito de `null` e suporte a script/HTTP.
- Refatorado `gestao-restaurante-fluxo-operacional.cy.js` com spies não-mockados (`@createOrder`, `@fetchKds`), asserção matemática estrita e zero `cy.wait(Number)`.
- Adicionados testes de isolamento multi-tenant (IDOR/BOLA contra vazamento de dados de outro tenant) e resiliência de rede sob 503 com `cy.allowHttpErrors` em `gestao-restaurante-discriminatorio.cy.js`.
- Validados sintaxe (`node --check`) de `cypress.config.js` e scripts, além de execução smoke com 100% de sucesso (3/3 testes aprovados).

## [2026-11-22] Parte B: Security & Contracts Hardening — Probes Sensíveis, OpenAPI Profundo, Cookies, XSS Canary & Contratos
- Integrado suporte declarativo a `qa-contracts.json` em `scripts/run-battery.cjs`, propagando via `QA_CONTRACTS` para validação em Stage 1.5 de `01-api-scanner.cy.js` com Bearer auth e asserções via dot-path.
- Implementado comando `cy.auditSessionCookies()` (`HttpOnly`, `SameSite`, `Secure` em HTTPS) e canário de XSS refletido em `cy.crawlAndFuzz()` verificando `win.__qaXssTriggered` em `cypress/support/commands.js`.
- Reestruturado `cypress/e2e/universal/01-api-scanner.cy.js` em 5 estágios sequenciais: telemetria (1.1), exposição sensível/admin e segredos (1.2), OpenAPI com resolução `$ref` e guarda de PII não-autenticado (1.3), headers de segurança e cookies (1.4), e contratos declarativos (1.5).
- Atualizadas diretrizes em `AGENTS.md` e `.agents/qa-project-context.md`, validada sintaxe (`node --check`) e executada bateria smoke (`--stage=smoke`) com 100% de sucesso (3/3 testes verdes), com grafo atualizado via `graft build`.

## [2026-11-22] Hotfix: Shadowing de Variável `cy` no Crawler & Tratamento de Fallback SPA no Scanner
- Corrigido shadowing acidental do objeto global `cy` em `cy.crawlAndFuzz()` renomeando variáveis de coordenadas para `centerX` e `centerY` em `cypress/support/commands.js`.
- Eliminado falso positivo em Stage 1.2 de `cypress/e2e/universal/01-api-scanner.cy.js`: requisições 200 OK com `text/html` (fallback de SPA Vite/React sob Nginx) são aceitas caso não contenham assinaturas reais de segredos/admin.
- Validação sintática limpa (`node --check`) e execução smoke aprovada com 100% de sucesso (3/3 testes verdes). Grafo determinístico sincronizado via `graft build`.

## [2026-11-22] Execução, Calibração e Expansão por Repositório (Domain Suite: 23/23 Green)
- **Grafo & Contratos**: Sincronizado grafo `graft build` (34 nós, 43 arestas) e adicionado `qa-contracts.json` na raiz do `Gestao-Restaurante` com Stage 1.5 validado.
- **Sessão & Seletores**: Corrigido `cy.loginSession()` eliminando seletores inválidos jQuery `[attr*="val" i]`, priorizando CTA exato ("Acessar Painel") e persistindo token no storage.
- **Segurança & Rate Limit**: Adicionada task `rateLimit:reset` via Redis eliminando falsos 429 colaterais pós-rajada e alinhados payloads DTO com `password: '123456'`.
- **PDV & KDS**: Calibrada montagem de pedido via modal "Personalizar Pedido", interceptada rota real `POST /api/v1/vendas` e abastecido estoque dos insumos (100 un carne, 50 kg bacon).
- **Validação**: Suíte de domínio executada com sucesso total: **23 testes aprovados, 0 falhas (100% GREEN)** em 54.4s.

## [2026-11-22] Autossuficiência Completa e Validação Universal --stage=full (32/32 Green)
- Removido `qa-contracts.json` espelhado na raiz do `Cypress-teste`, mantendo o isolamento estrito no repositório de domínio.
- Injetado reabastecimento de estoque autônomo e idempotente no `beforeEach` do fluxo operacional (`POST /api/v1/estoque/entrada`), eliminando falhas 422 em bancos recém-iniciados.
- Corrigida detecção de portas AMQP do RabbitMQ no `scripts/infra-checker.cjs` e substituído seletor Sizzle inválido no menu de `03-mobile-fuzzer.cy.js` por filtragem DOM nativa.
- Blindada a configuração do Nginx (`infra/nginx/conf.d/default.conf`) com headers obrigatórios de Clickjacking (`X-Frame-Options: SAMEORIGIN`) no server/SPA.
- Executada bateria completa (`--stage=full`): **32 testes aprovados de 32 (100% GREEN, 0 falhas)** em 76.1s cobrindo Universal API, Fuzzers Desktop/Mobile e as 3 Specs de Domínio.
