/**
 * cypress/e2e/universal/03-mobile-fuzzer.cy.js
 * Universal Autonomous Mobile UI/UX & Responsive Fuzzer
 * Validates mobile viewports (375x667, 390x844), hamburger menus, touch targets & horizontal overflow.
 */

describe('Universal Mobile UI/UX Autonomous Fuzzer', () => {
  const baseUrl = Cypress.config('baseUrl') || 'http://localhost';
  const mobileViewports = ['mobile', 'mobile-large'];

  beforeEach(() => {
    // Capture network failures for telemetry
    cy.captureNetworkErrors();
  });

  mobileViewports.forEach((vp) => {
    it(`Stage 3: Autonomous mobile UI responsiveness & fuzzing in [${vp}]`, () => {
      cy.setDeviceViewport(vp);

      cy.withSecrets(['AUTH_USER', 'AUTH_PASS', 'AUTH_URL'], (secrets = {}) => {
        const authUser = secrets.AUTH_USER;
        const authPass = secrets.AUTH_PASS;
        const authUrl = secrets.AUTH_URL || '/login';

        // 1. Session Authentication Phase (Mobile now supports auth)
        if (authUser && authPass) {
          cy.loginSession(authUser, authPass, authUrl);
        }

        cy.visit(baseUrl, { failOnStatusCode: false });

        // 2. Mobile UX Heuristic (Strict: no horizontal scrollbars, broken images & a11y)
        cy.checkUXHeuristics(`Mobile-${vp}-Entry`, { isMobile: true });

        // 3. Check and open hamburger / drawer navigation if present
        cy.get('body').then(($body) => {
          const menuBtn = $body.find('button, [role="button"], [data-testid]').filter((_, el) => {
            const label = el.getAttribute('aria-label') || '';
            const cls = typeof el.className === 'string' ? el.className : '';
            const testid = el.getAttribute('data-testid') || '';
            const hasSvg = el.querySelector('svg') !== null;
            return /menu|hamburger|drawer/i.test(label + ' ' + cls + ' ' + testid) || (el.tagName.toLowerCase() === 'button' && hasSvg);
          }).first();
          if (menuBtn.length && menuBtn.is(':visible')) {
            cy.log('[Mobile] Drawer / Hamburger button detected. Triggering mobile menu.');
            cy.wrap(menuBtn).click({ force: true });
            cy.get('body').should('be.visible');
            cy.get('[aria-busy="true"]', { timeout: 4000 }).should('not.exist');
          }
        });

        // 4. Bounded Mobile Fuzzing (Forms, links, mobile buttons, respects SAFE_MODE)
        cy.crawlAndFuzz({
          maxClicks: 20,
          fillInputs: true,
          stayOnOrigin: true,
          context: `Mobile-${vp}`,
          isMobile: true
        });

        // 5. Post-interaction overflow and layout stability check
        cy.checkUXHeuristics(`Mobile-${vp}-PostFuzz`, { isMobile: true });
      });
    });
  });
});
