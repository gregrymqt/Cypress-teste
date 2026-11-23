/**
 * cypress/e2e/universal/02-desktop-fuzzer.cy.js
 * Universal Autonomous Desktop UI/UX & Fuzzer Engine
 * Interacts with 100% of discovered interactive elements, monitors JS exceptions and network errors.
 */

describe('Universal Desktop UI/UX Autonomous Fuzzer', () => {
  const baseUrl = Cypress.config('baseUrl') || 'http://localhost';
  const desktopViewports = ['desktop', 'desktop-hd'];

  beforeEach(() => {
    // Capture network failures for telemetry
    cy.captureNetworkErrors();
  });

  desktopViewports.forEach((vp) => {
    it(`Stage 2: Autonomous crawl & fuzz in [${vp}] viewport`, () => {
      cy.setDeviceViewport(vp);

      cy.withSecrets(['AUTH_USER', 'AUTH_PASS', 'AUTH_URL'], (secrets = {}) => {
        const authUser = secrets.AUTH_USER;
        const authPass = secrets.AUTH_PASS;
        const authUrl = secrets.AUTH_URL || '/login';

        // 1. Session Authentication Phase (if credentials provided)
        if (authUser && authPass) {
          cy.loginSession(authUser, authPass, authUrl);
        }

        cy.visit(baseUrl, { failOnStatusCode: false });

        // 2. UX Heuristic validation (layout overflow, broken images & a11y)
        cy.checkUXHeuristics(`Desktop-${vp}-Entry`, { isMobile: false });

        // 3. Autonomous Crawl & Interactive Element Fuzzing (respects SAFE_MODE)
        cy.crawlAndFuzz({
          maxClicks: 30,
          fillInputs: true,
          stayOnOrigin: true,
          context: `Desktop-${vp}`,
          isMobile: false
        });

        // 4. Post-fuzzing UX sanity check
        cy.checkUXHeuristics(`Desktop-${vp}-PostFuzz`, { isMobile: false });
      });
    });
  });
});
