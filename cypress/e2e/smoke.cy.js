/// <reference types="cypress" />

describe('Smoke Test - Target Health & Integrity', () => {
  const baseUrl = Cypress.config('baseUrl') || 'http://localhost';

  it('deve responder com status HTTP < 500 na rota raiz e renderizar corpo sem erros JS', () => {
    // 1. Probing base HTTP connectivity
    cy.request({
      url: baseUrl,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'Root HTTP Status must be healthy (< 500)').to.be.lessThan(500);
    });

    // 2. Visit target and verify non-empty DOM body
    cy.visit('/', { failOnStatusCode: false });
    cy.get('body').should('be.visible').and('not.be.empty');
  });

  it('deve carregar dados de fixtures locais com integridade', () => {
    cy.fixture('example.json').then((data) => {
      expect(data).to.have.property('name', 'Cypress Test Fixture');
    });
  });

  it('deve validar camada de compatibilidade Cypress 16, controle de erros e helpers de rede', () => {
    // 1. getPublicFlag
    const safeMode = Cypress.getPublicFlag('SAFE_MODE', true);
    expect(safeMode).to.not.be.undefined;

    // 2. withSecrets helper
    cy.withSecrets(['AUTH_USER', 'AUTH_PASS'], (secrets) => {
      expect(secrets).to.be.an('object');
    });

    // 3. allowHttpErrors whitelists 500 and suppresses failure in global afterEach collector
    cy.allowHttpErrors([500, 503]);
    cy.intercept('GET', '/test-500-resilience-probe', { statusCode: 500, body: { error: 'Simulated 500 Outage' } }).as('mock500');
    cy.window().then((win) => {
      win.fetch('/test-500-resilience-probe').catch(() => {});
    });

    // 4. assertNoRequest verifies no unexpected network dispatch occurred
    cy.intercept('POST', '/forbidden-never-called').as('forbiddenCall');
    cy.assertNoRequest('forbiddenCall');
  });
});
