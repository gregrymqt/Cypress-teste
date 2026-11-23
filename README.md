# Cypress Universal QA Hub 🚀

Hub Universal e Autônomo de Testes e QA (E2E, API Discovery, UI/UX Fuzzing e Verificação de Infraestrutura).

Opera em modo agnóstico para **qualquer website, webapp ou repositório**, sem dependências de projetos fixos.

---

## 🎯 Modos de Operação

### 1. Modo URL (Black-Box)
Testa qualquer aplicação web fornecendo apenas a URL.
- **Descoberta de API**: Sonda rotas Swagger/OpenAPI e checa cabeçalhos de segurança HTTP.
- **Desktop Fuzzing & UX**: Varre e interage com botões, links e formulários em viewports 1280x800 e 1920x1080, checando overflow e erros de console JS.
- **Mobile Fuzzing & UX**: Testa responsividade em 375x667 e 390x844, gavetas de navegação e touch targets.

```bash
# Executar bateria completa em uma URL
node scripts/run-battery.cjs --url=https://exemplo.com

# Executar com autenticação prévia
node scripts/run-battery.cjs --url=http://localhost:3000 --auth-user=admin@site.com --auth-pass=123456 --auth-url=/login
```

### 2. Modo Repositório (White-Box)
Inspeciona a infraestrutura local antes dos testes de navegação:
- Detecta serviços em `docker-compose.yml`.
- Checa portas ativas de Banco de Dados (Postgres 5432, MySQL 3306, SQL Server 1433) e Redis (6379).

```bash
# Executar inspecionando repositório e URL
node scripts/run-battery.cjs --repo=../Meu-Projeto --url=http://localhost:5000

# Checar apenas serviços e infraestrutura
node scripts/infra-checker.cjs --repo=../Meu-Projeto
```

---

## 📊 Relatórios de Execução (`qa-results`)
Cada execução gera um pacote estruturado em:
`qa-results/<projeto-ou-dominio>/<YYYY-MM-DD>/execucao-XX/`

- `summary.json`: Métricas gerais (total, aprovados, falhas, duração, status de infraestrutura).
- `run.json`: Detalhes completos de execução Cypress.
- `screenshots/`: Capturas de tela automáticas em caso de falha.
