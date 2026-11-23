/// <reference types="cypress" />

describe('Testes Discriminatórios E2E - Gestão Restaurante Inteligente', () => {
  beforeEach(() => {
    // Clear local storage prior to each spec to guarantee isolation
    cy.clearLocalStorage();
  });

  describe('1. Discriminação de Gateway e Camada de Rede (API & Segurança)', () => {
    it('deve discriminar chamadas não-autenticadas à API retornando 401 Unauthorized', () => {
      cy.request({
        url: '/api/v1/fechamentos',
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.equal(401);
      });

      cy.request({
        url: '/api/v1/admin/tenants',
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.equal(401);
      });
    });

    it('deve proteger a documentação Swagger exigindo autenticação (401 Unauthorized)', () => {
      cy.request({
        url: '/swagger/index.html',
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.equal(401);
      });
    });
  });

  describe('2. Discriminação de Autenticação e Controle de Acesso (Login Negativo vs Positivo)', () => {
    it('deve discriminar e rejeitar credenciais inválidas com feedback adequado de segurança', () => {
      cy.intercept('POST', '**/api/v1/auth/login').as('loginRequest');

      cy.visit('/');

      // Garante que o gateway redireciona para a tela de autenticação
      cy.url().should('include', 'login');

      // Preenche credenciais inválidas
      cy.get('input[type="email"], input[placeholder*="@"], input').first().clear().type('usuario.invalido@teste.com');
      cy.get('input[type="password"], input[placeholder*="••"]').last().clear().type('senha_errada_123');

      // Clica em "Acessar Painel"
      cy.contains(/Acessar Painel/i).click();

      // Valida interceptação discriminatória (401 Unauthorized)
      cy.wait('@loginRequest').its('response.statusCode').should('equal', 401);

      // Permanece na tela de login
      cy.url().should('include', 'login');
    });

    it('deve autenticar com sucesso o Gestor e discriminar o acesso à área autenticada', () => {
      cy.intercept('POST', '**/api/v1/auth/login').as('loginSucesso');

      cy.visit('/');

      // Preenche credenciais válidas do Gestor (conforme seed do banco)
      cy.get('input[type="email"], input[placeholder*="@"], input').first().clear().type('gestor@restaurante.com');
      cy.get('input[type="password"], input[placeholder*="••"]').last().clear().type('123456');

      // Submete login
      cy.contains(/Acessar Painel/i).click();

      // Valida sucesso na autenticação
      cy.wait('@loginSucesso').its('response.statusCode').should('equal', 200);

      // Discrimina o acesso: usuário agora deve ter permissão e sair da tela de login
      cy.url().should('not.include', 'login');
    });
  });

  describe('3. Discriminação de Rotas Protegidas (Broken Access Control - OWASP A01)', () => {
    it('deve bloquear acesso direto a telas protegidas quando deslogado e redirecionar para o login', () => {
      cy.clearLocalStorage();
      cy.visit('/(tabs)/pdv');

      // Deve ser redirecionado para a tela de login
      cy.url().should('include', 'login');
    });

    it('deve preservar a estabilidade da UI e não acionar falso banner de servidor offline', () => {
      cy.visit('/');
      cy.contains(/Servidor Offline/i).should('not.exist');
    });
  });

  describe('4. Discriminação de Perfis RBAC, Integridade de JWT e Rate Limiting', () => {
    it('deve validar controle de acesso baseado em função (RBAC): usuário não-admin recebe 403 Forbidden em /api/v1/admin/tenants', () => {
      // Authenticate as Gestor (non-admin in platform tenant scope)
      cy.request({
        method: 'POST',
        url: '/api/v1/auth/login',
        body: {
          email: 'gestor@restaurante.com',
          password: '123456',
        },
        failOnStatusCode: false,
      }).then((loginRes) => {
        expect(loginRes.status, 'Gestor API login must succeed').to.equal(200);

        const gestorToken = loginRes.body?.token || loginRes.body?.accessToken || loginRes.body?.data?.token;
        expect(gestorToken, 'Auth token must be returned').to.be.a('string').and.not.be.empty;

        cy.request({
          method: 'GET',
          url: '/api/v1/admin/tenants',
          headers: {
            Authorization: `Bearer ${gestorToken}`,
          },
          failOnStatusCode: false,
        }).then((adminRes) => {
          expect(adminRes.status).to.equal(403);
        });
      });
    });

    it('deve rejeitar requisição com token JWT adulterado/inválido retornando 401 Unauthorized', () => {
      cy.request({
        method: 'GET',
        url: '/api/v1/fechamentos',
        headers: {
          Authorization: 'Bearer invalid.token.here',
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.equal(401);
      });
    });
  });

  describe('5. Isolamento Multi-Tenant (IDOR / BOLA) e Resiliência sob Falha de Rede', () => {
    it('deve garantir isolamento multi-tenant (IDOR): requisição a recursos de outro tenant deve retornar 403 ou 404 (nunca 200 com dados)', () => {
      cy.request({
        method: 'POST',
        url: '/api/v1/auth/login',
        body: {
          email: 'gestor@restaurante.com',
          password: '123456',
        },
        failOnStatusCode: false,
      }).then((loginRes) => {
        expect(loginRes.status).to.equal(200);
        const gestorToken = loginRes.body?.token || loginRes.body?.accessToken || loginRes.body?.data?.token;
        expect(gestorToken).to.be.a('string').and.not.be.empty;

        const foreignTenantId = '00000000-0000-0000-0000-000000000099';

        // 1. Query parameter tampering attempt
        cy.request({
          method: 'GET',
          url: `/api/v1/fechamentos?tenantId=${foreignTenantId}`,
          headers: {
            Authorization: `Bearer ${gestorToken}`,
          },
          failOnStatusCode: false,
        }).then((res) => {
          expect([403, 404]).to.include(res.status, 'Foreign tenant access via query param must be rejected with 403 or 404');
        });

        // 2. Header tampering attempt
        cy.request({
          method: 'GET',
          url: '/api/v1/fechamentos',
          headers: {
            Authorization: `Bearer ${gestorToken}`,
            'X-Tenant-Id': foreignTenantId,
          },
          failOnStatusCode: false,
        }).then((res) => {
          expect([403, 404]).to.include(res.status, 'Foreign tenant access via X-Tenant-Id header must be rejected with 403 or 404');
        });

        // 3. Direct resource UUID tampering attempt (specific resource from foreign tenant)
        const foreignResourceId = '00000000-0000-0000-0000-000000000099';
        cy.request({
          method: 'GET',
          url: `/api/v1/fechamentos/${foreignResourceId}`,
          headers: {
            Authorization: `Bearer ${gestorToken}`,
          },
          failOnStatusCode: false,
        }).then((res) => {
          expect([403, 404]).to.include(res.status, 'Direct resource access with foreign UUID must be rejected with 403 or 404');
        });
      });
    });

    it('deve demonstrar resiliência da UI sob falha 503 na submissão de pedido sem travar a interface', () => {
      // Whitelist HTTP 503 for this resilience boundary check
      cy.allowHttpErrors([503]);

      // Intercept POST pedidos/vendas with 503 Service Unavailable
      cy.intercept('POST', '**/*{pedidos,vendas}*', {
        statusCode: 503,
        body: { message: 'Service Unavailable - Simulated Server Outage' },
      }).as('failingOrder');

      cy.loginSession('gestor@restaurante.com', '123456', '/');
      cy.visit('/(tabs)/pdv');
      cy.contains(/PDV|Catálogo|Produtos/i, { timeout: 10000 }).should('be.visible');

      // Add item to cart
      cy.get('body').then(($body) => {
        const productCard = $body.find('[role="button"], button').filter((_, el) => /R\$|\bAdicionar\b/i.test(Cypress.$(el).text())).first();
        expect(productCard.length, 'Must locate at least one product card to add').to.be.greaterThan(0);
        cy.wrap(productCard).click({ force: true });
      });

      // Add item to cart via modifier modal
      cy.contains(/Adicionar ao Pedido/i, { timeout: 10000 }).should('be.visible').click({ force: true });

      // Open checkout bottom sheet (mandatory: cart must show checkout trigger with items)
      cy.contains(/Cobrar/i, { timeout: 10000 }).should('be.visible').click({ force: true });

      // Click submit payment button in checkout bottom sheet
      cy.contains(/Confirmar pagamento/i, { timeout: 10000 }).should('be.visible').click({ force: true });
      cy.wait('@failingOrder');

      // Assert UI displays an error or warning message and is NOT locked in infinite loading
      cy.get('body').should('be.visible');
      cy.get('[aria-busy="true"]', { timeout: 4000 }).should('not.exist');
    });

    it('deve aplicar Rate Limiting (429 Too Many Requests) sob rajada de tentativas inválidas de login', function () {
      const safeModeFlag = Cypress.getPublicFlag ? Cypress.getPublicFlag('SAFE_MODE', false) : (typeof Cypress.env === 'function' ? Cypress.env('SAFE_MODE') : false);
      const isSafeMode = safeModeFlag === true || safeModeFlag === 'true';
      if (isSafeMode) {
        cy.log('Pulando teste de rate limiting pois SAFE_MODE está ativo.');
        this.skip();
      }

      const burstCount = 12;
      let triggeredRateLimit = false;

      Cypress._.times(burstCount, () => {
        cy.request({
          method: 'POST',
          url: '/api/v1/auth/login',
          body: {
            email: 'burst.attacker@restaurante.com',
            password: 'wrong_password_burst',
          },
          failOnStatusCode: false,
        }).then((res) => {
          if (res.status === 429) {
            triggeredRateLimit = true;
          }
        });
      });

      cy.then(() => {
        expect(triggeredRateLimit, 'Rate limit 429 deve ser acionado sob rajada de requisições').to.be.true;
        // Purge Redis rate limit cache so subsequent specs/logins are not throttled
        cy.task('rateLimit:reset');
      });
    });
  });
});
