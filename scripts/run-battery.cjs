#!/usr/bin/env node
/**
 * scripts/run-battery.cjs
 * Universal Autonomous Battery Runner: API Integrity + Desktop Fuzzing + Mobile Fuzzing + Domain Tests
 * Accepts dynamic targets via --url=<url> or --repo=<path>
 * Generates structured reports in qa-results/<target>/<date>/execucao-XX/
 */

delete process.env.ELECTRON_RUN_AS_NODE;

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const cypress = require('cypress');
const { runInfraCheck } = require('./infra-checker.cjs');

// Parse CLI arguments
const args = process.argv.slice(2);

// Handle help flag cleanly without executing Cypress
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Universal Autonomous QA Battery Runner
Usage:
  node scripts/run-battery.cjs [options]

Options:
  --url=<url>            Target application base URL (default: http://localhost)
  --repo=<path>          Target repository path for contracts & domain specs
  --stage=<stage>        Execution stage: all, smoke, api, ui, desktop, mobile, full
  --browser=<browser>    Browser to run: chrome, electron, firefox, edge
  --headed               Run tests with browser UI visible
  --safe-mode            Force read-only testing (no destructive clicks/inputs)
  --allow-mutations      Allow mutation/write operations against target
  --help, -h             Show this help message
`);
  process.exit(0);
}
function getArg(key, defaultValue = '') {
  const prefix = `--${key}=`;
  const found = args.find((a) => a.startsWith(prefix));
  if (found) return found.substring(prefix.length);
  const index = args.indexOf(`--${key}`);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }
  return defaultValue;
}

// Target and execution parameters
const rawUrl = getArg('url', '');
const rawRepo = getArg('repo', '');
const stage = getArg('stage', 'all').toLowerCase();
const browser = getArg('browser', 'chrome');
const headed = args.includes('--headed');
const strict = args.includes('--strict') || getArg('strict') === 'true';
const authUser = getArg('auth-user', process.env.CYPRESS_AUTH_USER || '');
const authPass = getArg('auth-pass', process.env.CYPRESS_AUTH_PASS || '');
const authUrl = getArg('auth-url', process.env.CYPRESS_AUTH_URL || '/login');

// Safety Mode & Mutation Controls
const safeModeFlag = args.includes('--safe-mode') || getArg('safe-mode') === 'true';
const allowMutations = args.includes('--allow-mutations') || getArg('allow-mutations') === 'true';

// Default Safety Rule: If --url provided WITHOUT --repo and WITHOUT --allow-mutations -> SAFE_MODE=true
const hasUrl = Boolean(rawUrl);
const hasRepo = Boolean(rawRepo);
let safeMode = safeModeFlag;
if (hasUrl && !hasRepo && !allowMutations) {
  safeMode = true;
}

// Determine Base URL
let baseUrl = rawUrl || process.env.CYPRESS_BASE_URL || 'http://localhost';
if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
  baseUrl = `http://${baseUrl}`;
}

// Helper to normalize strings to lowercase kebab-case
function toKebabCase(str) {
  return String(str || '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

// Derive a clean project/target name for reporting
let rawProject = getArg('project', '');
let projectName = '';
if (rawProject) {
  projectName = toKebabCase(rawProject);
} else if (rawRepo) {
  projectName = toKebabCase(path.basename(path.resolve(rawRepo)));
} else if (rawUrl) {
  try {
    const parsed = new URL(baseUrl);
    projectName = toKebabCase(parsed.hostname);
  } catch {
    projectName = 'url-target';
  }
} else {
  projectName = 'universal-target';
}
if (!projectName) {
  projectName = 'universal-target';
}

function generateMarkdownReport(summary, cypressResult, executionDir) {
  const isPassed = summary.status === 'PASSED';
  const statusBadge = isPassed ? '🟢 APROVADO (PASSED)' : '🔴 REPROVADO (FAILED)';

  const failedTests = [];
  const passedTests = [];

  if (cypressResult && Array.isArray(cypressResult.runs)) {
    cypressResult.runs.forEach((run) => {
      const specPath = run.spec ? (run.spec.relative || run.spec.name) : 'unknown-spec';
      const screenshots = run.screenshots || [];

      if (Array.isArray(run.tests)) {
        run.tests.forEach((t) => {
          const testTitle = Array.isArray(t.title) ? t.title.join(' > ') : (t.title || 'Teste sem título');
          const duration = t.duration ? `${(t.duration / 1000).toFixed(2)}s` : '0s';

          if (t.state === 'failed') {
            const rawError = t.displayError || (t.attempts && t.attempts[t.attempts.length - 1]?.error?.message) || 'Erro desconhecido';
            const matchingScreenshot = screenshots.find((s) => s.testId === t.testId || (s.path && s.path.includes(t.title?.[t.title.length - 1])));
            failedTests.push({
              title: testTitle,
              spec: specPath,
              duration: duration,
              error: rawError,
              screenshot: matchingScreenshot ? path.relative(executionDir, matchingScreenshot.path) : null
            });
          } else if (t.state === 'passed') {
            passedTests.push({
              title: testTitle,
              spec: specPath,
              duration: duration
            });
          }
        });
      }
    });
  }

  let md = `# Relatório de Execução de QA - ${statusBadge}\n\n`;
  md += `## 📋 Visão Geral\n\n`;
  md += `| Métrica | Detalhe |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Status** | **${statusBadge}** |\n`;
  md += `| **Alvo / URL** | \`${summary.baseUrl}\` |\n`;
  md += `| **Projeto** | \`${summary.project}\` |\n`;
  md += `| **Stage** | \`${summary.stage}\` |\n`;
  md += `| **Safe Mode** | \`${summary.safeMode ? 'ATIVO (Bloqueia mutações)' : 'DESATIVADO'}\` |\n`;
  md += `| **Permite Mutações** | \`${summary.allowMutations ? 'SIM' : 'NÃO'}\` |\n`;
  md += `| **Navegador** | \`${summary.browser}\` |\n`;
  md += `| **Duração** | \`${summary.durationSeconds}s\` |\n`;
  md += `| **Data/Hora Início** | \`${summary.startTime}\` |\n`;
  md += `| **Data/Hora Fim** | \`${summary.endTime}\` |\n`;
  md += `| **Total de Testes** | **${summary.totalTests}** |\n`;
  md += `| **Passaram (Acertos)** | **${summary.totalPassed}** |\n`;
  md += `| **Falharam (Erros)** | **${summary.totalFailed}** |\n\n`;

  md += `---\n\n`;

  md += `## ❌ Falhas Identificadas (Erros a Corrigir)\n\n`;
  if (failedTests.length === 0) {
    md += `> ✅ **Nenhuma falha registrada nesta execução. Todos os testes passaram!**\n\n`;
  } else {
    failedTests.forEach((f, idx) => {
      md += `### ${idx + 1}. ${f.title}\n`;
      md += `- **Arquivo de Spec:** \`${f.spec}\`\n`;
      md += `- **Duração:** \`${f.duration}\`\n`;
      if (f.screenshot) {
        md += `- **Screenshot do Erro:** \`${f.screenshot}\`\n`;
      }
      md += `\n**Mensagem de Erro / Stack:**\n\`\`\`text\n${f.error.trim()}\n\`\`\`\n\n`;
    });
  }

  md += `---\n\n`;

  md += `## ✅ Testes Aprovados (Acertos)\n\n`;
  if (passedTests.length === 0) {
    md += `> ⚠️ **Nenhum teste foi aprovado.**\n\n`;
  } else {
    md += `| # | Suíte / Cenário | Spec | Duração |\n`;
    md += `| :-: | :--- | :--- | :-: |\n`;
    passedTests.forEach((p, idx) => {
      md += `| ${idx + 1} | ${p.title} | \`${p.spec}\` | ${p.duration} |\n`;
    });
    md += `\n`;
  }

  return md;
}

// Map universal spec files
const universalSpecsDir = path.resolve(__dirname, '..', 'cypress', 'e2e', 'universal');
const e2eDir = path.resolve(__dirname, '..', 'cypress', 'e2e');
const domainsDir = path.join(e2eDir, 'domains');
const projectDomainDir = path.join(domainsDir, projectName);

const allSpecs = {
  api: path.join(universalSpecsDir, '01-api-scanner.cy.js'),
  desktop: path.join(universalSpecsDir, '02-desktop-fuzzer.cy.js'),
  mobile: path.join(universalSpecsDir, '03-mobile-fuzzer.cy.js'),
};

// Discover domain specs dynamically from cypress/e2e/domains/<projectName>/*.cy.js
const projectDomainSpecs = (fs.existsSync(projectDomainDir) && fs.statSync(projectDomainDir).isDirectory())
  ? fs.readdirSync(projectDomainDir)
      .filter((file) => file.endsWith('.cy.js'))
      .map((file) => path.join(projectDomainDir, file))
  : [];

let selectedSpecs = [];
if (stage === 'all') {
  // Universal specs (api, desktop, mobile)
  selectedSpecs = [allSpecs.api, allSpecs.desktop, allSpecs.mobile];
} else if (stage === 'domain') {
  // Project-specific domain specs
  if (!fs.existsSync(projectDomainDir) || projectDomainSpecs.length === 0) {
    console.error(`\n[FATAL] No domain specs found for project "${projectName}" at:`);
    console.error(`  ${projectDomainDir}`);
    console.error(`Please ensure "cypress/e2e/domains/${projectName}/" exists and contains ".cy.js" specs, or specify --project=<name>.\n`);
    process.exit(1);
  }
  selectedSpecs = projectDomainSpecs;
} else if (stage === 'full') {
  // Universal + domain specs
  if (!fs.existsSync(projectDomainDir) || projectDomainSpecs.length === 0) {
    console.warn(`\n[WARN] No domain specs found for project "${projectName}" at "${path.relative(process.cwd(), projectDomainDir)}". Proceeding with universal specs only. Hint: specify domain with --project=<name>.\n`);
    selectedSpecs = [allSpecs.api, allSpecs.desktop, allSpecs.mobile];
  } else {
    selectedSpecs = [allSpecs.api, allSpecs.desktop, allSpecs.mobile, ...projectDomainSpecs];
  }
} else if (stage === 'ui') {
  selectedSpecs = [allSpecs.desktop, allSpecs.mobile];
} else if (stage === 'smoke') {
  selectedSpecs = [path.join(e2eDir, 'smoke.cy.js')];
} else if (allSpecs[stage]) {
  selectedSpecs = [allSpecs[stage]];
} else {
  selectedSpecs = [path.resolve(stage)];
}

// Setup results directory: qa-results/<project>/<YYYY-MM-DD>/execucao-XX/
const dateStr = new Date().toISOString().slice(0, 10);
const baseResultsDir = path.resolve(__dirname, '..', 'qa-results', projectName, dateStr);
fs.mkdirSync(baseResultsDir, { recursive: true });

const existing = fs.readdirSync(baseResultsDir).filter((d) => d.startsWith('execucao-'));
const nextExecNum = existing.length + 1;
const executionDirName = `execucao-${String(nextExecNum).padStart(2, '0')}`;
const executionDir = path.join(baseResultsDir, executionDirName);
fs.mkdirSync(executionDir, { recursive: true });

async function main() {
  const startTime = new Date();
  console.log('='.repeat(65));
  console.log(`  UNIVERSAL QA BATTERY RUNNER`);
  console.log(`  Target:           ${baseUrl}`);
  console.log(`  Project:          ${projectName}`);
  console.log(`  Stage:            ${stage.toUpperCase()}`);
  console.log(`  Safe Mode:        ${safeMode ? 'ENABLED (Safe read-only fuzzing)' : 'DISABLED'}`);
  console.log(`  Allow Mutations:  ${allowMutations ? 'YES' : 'NO'}`);
  console.log(`  Browser:          ${browser} ${headed ? '(headed)' : '(headless)'}`);
  console.log(`  Selected Specs:   ${selectedSpecs.length} spec file(s)`);
  console.log(`  Artifacts:        ${path.relative(process.cwd(), executionDir)}`);
  console.log('='.repeat(65));

  let infraReport = null;
  // If repository path was provided, run infrastructure inspection first
  if (rawRepo) {
    infraReport = await runInfraCheck({ repo: rawRepo, strict: strict });
    if (strict && infraReport.strictFailed) {
      console.error(`\n[FATAL] Infrastructure health check failed in strict mode. Halting test battery.`);
      process.exit(1);
    }
  }

  // Declarative Repository Contracts (qa-contracts.json)
  let contractsFilePath = null;
  if (rawRepo) {
    const candidate = path.resolve(rawRepo, 'qa-contracts.json');
    if (fs.existsSync(candidate)) {
      contractsFilePath = candidate;
    }
  } else {
    const candidate = path.resolve(process.cwd(), 'qa-contracts.json');
    if (fs.existsSync(candidate)) {
      contractsFilePath = candidate;
    }
  }

  let qaContractsData = null;
  if (contractsFilePath) {
    try {
      const content = fs.readFileSync(contractsFilePath, 'utf8');
      qaContractsData = JSON.parse(content);
      console.log(`[CONTRACTS] Loaded qa-contracts.json from ${contractsFilePath}`);
    } catch (err) {
      console.error(`\n[FATAL] Malformed qa-contracts.json at ${contractsFilePath}: ${err.message}\n`);
      process.exit(1);
    }
  }

  // Public configuration flags (safe for browser exposure)
  const publicFlags = {
    CYPRESS_BASE_URL: baseUrl,
    SAFE_MODE: safeMode,
    ALLOW_MUTATIONS: allowMutations,
    ALLOW_OPEN_SWAGGER: args.includes('--allow-open-swagger') || getArg('allow-open-swagger') === 'true' || process.env.ALLOW_OPEN_SWAGGER === 'true',
    QA_CONTRACTS: qaContractsData ? JSON.stringify(qaContractsData) : null,
  };

  // Sensitive authentication credentials (kept in Node env)
  const secretEnv = {
    AUTH_USER: authUser,
    AUTH_PASS: authPass,
    AUTH_URL: authUrl,
  };

  const cypressVersion = (cypress.getVersion && cypress.getVersion()) || (require('cypress/package.json')?.version) || '16.0.0';
  const majorVersion = parseInt(String(cypressVersion).split('.')[0], 10) || 16;
  const supportsExpose = majorVersion >= 16;

  const cypressConfig = {
    baseUrl: baseUrl,
    screenshotsFolder: path.join(executionDir, 'screenshots'),
    screenshotOnRunFailure: true,
    video: false,
  };

  if (supportsExpose) {
    cypressConfig.expose = publicFlags;
  }

  // Pass secrets via env; in pre-16 fallback, combine secrets with public flags
  const cypressEnv = supportsExpose
    ? secretEnv
    : { ...secretEnv, ...publicFlags };

  try {
    const cypressResult = await cypress.run({
      spec: selectedSpecs.join(','),
      browser: browser,
      headed: headed,
      config: cypressConfig,
      env: cypressEnv,
      quiet: false,
    });

    const endTime = new Date();
    const durationSeconds = ((endTime - startTime) / 1000).toFixed(1);

    const isCrashed = typeof cypressResult.totalFailed === 'undefined';
    const totalTests = isCrashed ? 0 : cypressResult.totalTests;
    const totalPassed = isCrashed ? 0 : cypressResult.totalPassed;
    const totalFailed = isCrashed ? 1 : cypressResult.totalFailed;
    const totalPending = isCrashed ? 0 : cypressResult.totalPending;

    const summary = {
      project: projectName,
      baseUrl: baseUrl,
      stage: stage,
      safeMode: safeMode,
      allowMutations: allowMutations,
      browser: browser,
      date: dateStr,
      executionId: executionDirName,
      status: totalFailed === 0 && !isCrashed ? 'PASSED' : 'FAILED',
      durationSeconds: Number(durationSeconds),
      totalTests,
      totalPassed,
      totalFailed,
      totalPending,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      infraReport: infraReport
    };

    // Save structured report
    fs.writeFileSync(path.join(executionDir, 'summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(executionDir, 'run.json'), JSON.stringify(cypressResult, null, 2));

    // Generate and save Markdown Report with detailed errors and successes
    const markdownReport = generateMarkdownReport(summary, cypressResult, executionDir);
    const mdReportPath = path.join(executionDir, 'report.md');
    fs.writeFileSync(mdReportPath, markdownReport, 'utf8');

    // Also update canonical latest reports for quick inspection
    const projectLatestMd = path.join(baseResultsDir, 'ULTIMO-RELATORIO.md');
    const globalLatestMd = path.resolve(__dirname, '..', 'qa-results', 'ULTIMO-RELATORIO.md');
    fs.writeFileSync(projectLatestMd, markdownReport, 'utf8');
    fs.writeFileSync(globalLatestMd, markdownReport, 'utf8');

    console.log('\n' + '='.repeat(65));
    console.log(`  EXECUTION SUMMARY [${summary.status}] - ${durationSeconds}s`);
    console.log(`  Tests: Total=${totalTests} | Passed=${totalPassed} | Failed=${totalFailed} | Pending=${totalPending}`);
    console.log(`  JSON Report: ${path.join(executionDir, 'summary.json')}`);
    console.log(`  Markdown:    ${mdReportPath}`);
    console.log(`  Latest MD:   ${globalLatestMd}`);
    console.log('='.repeat(65));

    process.exit(totalFailed === 0 ? 0 : 1);
  } catch (err) {
    console.error(`\n[FATAL RUNNER ERROR] ${err.message}`);
    process.exit(1);
  }
}

main();
