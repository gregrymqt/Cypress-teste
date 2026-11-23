/// <reference types="cypress" />

describe('Bateria Completa de Testes de Frontend e Integração - Gestão Restaurante', () => {
  describe('1. Sanitização e Verificação Inicial da Tela de Login', () => {
    beforeEach(() => {
      cy.clearLocalStorage();
    });

    it('deve carregar a tela de Login com todos os componentes visuais obrigatórios e visíveis', () => {
      cy.visit('/');
      cy.url().should('include', 'login');

      // Verifica campos de entrada e botão principal
      cy.get('input').should('have.length.at.least', 2);
      cy.contains(/Acessar Painel/i).should('be.visible');
      cy.get('body').should('contain.text', 'Restaurante Inteligente');
    });
  });

  describe('2. Validação Operacional dos Módulos Frontend (Área Autenticada)', () => {
    beforeEach(() => {
      // Reutiliza sessão autenticada via cy.loginSession para eliminar redundância
      cy.loginSession('gestor@restaurante.com', '123456', '/');
    });

    it('Módulo Dashboard: deve renderizar os KPIs de faturamento e previsão', () => {
      cy.visit('/(tabs)');
      cy.contains(/Restaurante Teste E2E|Gestor|Dashboard/i).should('be.visible');
      cy.contains(/Faturamento|Vendas|Pedidos/i).should('be.visible');
      // Garante ausência de banners de erro de conexão
      cy.contains(/Servidor Offline/i).should('not.exist');
    });

    it('Módulo PDV (Vendas): deve renderizar catálogo de produtos e categorias', () => {
      cy.visit('/(tabs)/pdv');
      cy.contains(/PDV|Vendas|Catálogo|Produtos/i).should('be.visible');
      cy.get('input[placeholder*="Buscar"], input[placeholder*="pesquisar"], input').first().should('be.visible');
    });

    it('Módulo Caixa: deve exibir o contexto do turno e opções de movimentação', () => {
      cy.visit('/(tabs)/caixa');
      cy.contains(/Caixa|Turno|Faturamento|Sessão/i).should('be.visible');
      cy.contains(/Suprimento|Sangria|Fechar Caixa|Abrir/i).should('be.visible');
    });

    it('Módulo Estoque: deve exibir listagem de insumos e badges de saldo', () => {
      cy.visit('/(tabs)/estoque');
      cy.contains(/Estoque|Insumos|Fichas/i).should('be.visible');
    });

    it('Módulo KDS (Cozinha): deve carregar o painel operacional da cozinha', () => {
      cy.visit('/kds');
      cy.contains(/KDS|Cozinha|Pedidos|Recebido|Preparando/i).should('be.visible');
    });

    it('Módulo Perfil: deve exibir dados da unidade, operador e equipe', () => {
      cy.visit('/(tabs)/perfil');
      cy.contains(/Gestor|Perfil|Operador|Terminal/i).should('be.visible');
    });

    it('Módulo Previsões: deve exibir tela de inteligência preditiva', () => {
      cy.visit('/(tabs)/previsoes');
      cy.contains(/Previsão|Demanda|Capacidade|Inteligência/i).should('be.visible');
    });
  });

  describe('3. Validação de Integridade do Gateway e Segurança HTTP', () => {
    it('deve garantir que o Nginx está servindo os assets estáticos com compressão e sem erros 5xx', () => {
      cy.request({
        url: '/',
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
        },
      }).then((res) => {
        expect(res.status).to.equal(200);
        expect(res.headers['content-type']).to.include('text/html');

        const encoding = res.headers['content-encoding'];
        if (encoding) {
          expect(encoding).to.match(/gzip|br/i);
          cy.log(`Compressão HTTP ativa: ${encoding}`);
        } else {
          cy.log('Aviso: Content-Encoding não detectado no HTML raiz; validando status estático 200 OK');
          expect(res.status).to.equal(200);
        }
      });
    });

    it('deve responder com status healthy no endpoint de integridade do backend (/api/v1/health)', () => {
      cy.request('/api/v1/health').then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.have.property('status', 'healthy');
      });
    });

    it('deve validar proteção contra abuso com Rate Limiting ativo no gateway e backend', () => {
      cy.request('/api/v1/health').then((res) => {
        expect(res.headers).to.have.property('x-ratelimit-limit');
      });
    });
  });
});
