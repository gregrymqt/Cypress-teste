// ***********************************************************
// cypress/support/e2e.js
// Global configuration and per-test error assertion
// ***********************************************************

// Cypress 16 backward compatibility polyfill for Cypress.env
try {
  const envPolyfill = function (key, value) {
    const envObj = (typeof Cypress.config === 'function' && Cypress.config('env')) || {};
    if (arguments.length === 0) {
      return envObj;
    }
    if (typeof key === 'object' && key !== null) {
      Object.assign(envObj, key);
      return envObj;
    }
    if (typeof value !== 'undefined') {
      envObj[key] = value;
      return value;
    }
    if (typeof envObj[key] !== 'undefined') {
      return envObj[key];
    }
    if (typeof Cypress.expose === 'function') {
      try {
        const exp = Cypress.expose(key);
        if (typeof exp !== 'undefined') return exp;
      } catch {}
    }
    return undefined;
  };

  try {
    Cypress.env = envPolyfill;
  } catch {
    Object.defineProperty(Cypress, 'env', {
      value: envPolyfill,
      writable: true,
      configurable: true,
    });
  }
} catch {}

import './commands';

// Per-test critical runtime error collector and expected error status whitelists
let currentTestErrors = [];
let expectedHttpErrors = [];
Cypress.expectedHttpErrors = expectedHttpErrors;

// Register uncaught:exception handler once globally
Cypress.on('uncaught:exception', (err, runnable) => {
  // Record the error message and stack for assertion at the end of the test
  currentTestErrors.push({
    type: 'Uncaught JS Exception',
    message: err.message,
    stack: err.stack,
  });

  // Return false so Cypress doesn't crash mid-step prematurely,
  // allowing afterEach to assert with comprehensive diagnostics
  return false;
});

beforeEach(() => {
  // Reset error collector and expected errors for the current test
  currentTestErrors = [];
  expectedHttpErrors = [];
  Cypress.expectedHttpErrors = expectedHttpErrors;

  // Capture application HTTP 5xx server errors originating from the page
  cy.intercept('**', (req) => {
    req.on('response', (res) => {
      if (res.statusCode >= 500) {
        const allowed = (Cypress.expectedHttpErrors || expectedHttpErrors || []).map(Number).includes(Number(res.statusCode));
        if (!allowed) {
          currentTestErrors.push({
            type: 'HTTP 5xx Server Error',
            message: `${req.method} ${req.url} -> Status ${res.statusCode} (${res.statusMessage || 'Internal Server Error'})`,
          });
        }
      }
    });
  });
});

afterEach(() => {
  // Assert zero critical runtime errors occurred during test execution
  if (currentTestErrors.length > 0) {
    const errorLog = currentTestErrors
      .map((e, i) => `  [${i + 1}] ${e.type}: ${e.message}`)
      .join('\n');
    expect(currentTestErrors, `Critical runtime errors detected during test:\n${errorLog}`).to.be.empty;
  }
});
