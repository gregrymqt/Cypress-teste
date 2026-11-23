/**
 * cypress/support/commands.js
 * Universal Commands: Session Login, Autonomous Crawler, Fuzzer, Network/Console Interceptors & UX Heuristics
 */

/**
 * Cypress 16 Compatibility Helper: Read public configuration safely
 * Reads Cypress.expose(key) if available, falling back to Cypress.env(key)
 */
function getPublicFlag(key, defaultValue = undefined) {
  let val;
  if (typeof Cypress.expose === 'function') {
    try {
      val = Cypress.expose(key);
    } catch {}
  }
  if (val === undefined && typeof Cypress.env === 'function') {
    try {
      val = Cypress.env(key);
    } catch {}
  }
  return val !== undefined ? val : defaultValue;
}
Cypress.getPublicFlag = getPublicFlag;

/**
 * Cypress 16 Compatibility Command: Access secrets safely
 * Uses cy.env(keys).then(callback) when cy.env is a command function,
 * falling back to Cypress.env(k) for pre-16 versions.
 */
Cypress.Commands.add('withSecrets', (keys, callback) => {
  if (typeof cy.env === 'function') {
    return cy.env(keys).then((result) => {
      return callback(result);
    });
  } else {
    let fallbackResult;
    if (Array.isArray(keys)) {
      fallbackResult = {};
      keys.forEach((k) => {
        fallbackResult[k] = typeof Cypress.env === 'function' ? Cypress.env(k) : undefined;
      });
    } else if (typeof keys === 'string') {
      fallbackResult = typeof Cypress.env === 'function' ? Cypress.env(keys) : undefined;
    } else {
      fallbackResult = typeof Cypress.env === 'function' ? Cypress.env() : {};
    }
    return cy.wrap(fallbackResult, { log: false }).then((val) => {
      return callback(val);
    });
  }
});

// Device Viewport Preset Matrix
const VIEWPORT_PRESETS = {
  desktop: { width: 1280, height: 800 },
  'desktop-hd': { width: 1920, height: 1080 },
  mobile: { width: 375, height: 667 }, // iPhone SE/8
  'mobile-large': { width: 390, height: 844 }, // iPhone 14
  tablet: { width: 768, height: 1024 }
};

// Destructive terms to avoid clicking when SAFE_MODE is active
const DESTRUCTIVE_KEYWORDS_REGEX = /delete|remove|excluir|apagar|fechar caixa|cancelar|logout|sair/i;

Cypress.Commands.add('setDeviceViewport', (presetName) => {
  const preset = VIEWPORT_PRESETS[presetName] || VIEWPORT_PRESETS.desktop;
  cy.viewport(preset.width, preset.height);
  cy.log(`Viewport adjusted to: ${presetName} (${preset.width}x${preset.height})`);
});

// UX Heuristics Check: Detect horizontal overflow, blank screen, broken visible images & WCAG accessibility
Cypress.Commands.add('checkUXHeuristics', (context = 'default', options = {}) => {
  let ctx = context;
  let opts = options;
  if (typeof context === 'object' && context !== null) {
    opts = context;
    ctx = opts.context || 'default';
  }
  opts = opts || {};

  cy.window({ log: false }).then((win) => {
    const docEl = win.document.documentElement;
    const scrollWidth = docEl.scrollWidth;
    const clientWidth = docEl.clientWidth;
    const hasHorizontalOverflow = scrollWidth > clientWidth + 2; // 2px tolerance

    if (hasHorizontalOverflow) {
      cy.log(`[UX WARNING] Horizontal overflow detected (${ctx}): scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`);
    }
    expect(hasHorizontalOverflow, `Horizontal overflow check on [${ctx}] (scrollWidth=${scrollWidth}, clientWidth=${clientWidth})`).to.be.false;

    const isElementVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = win.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        parseFloat(style.opacity || '1') > 0
      );
    };

    // 1. Blank Screen / Empty Render Detection
    const bodyEl = win.document.body;
    const visibleText = (bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : '').trim();
    const meaningfulSelectors = 'img, svg, canvas, input, button, table, ul, ol';
    const meaningfulElements = bodyEl
      ? Array.from(bodyEl.querySelectorAll(meaningfulSelectors)).filter(isElementVisible).length
      : 0;
    const isNotBlank = visibleText.length > 0 || meaningfulElements > 0;

    if (!isNotBlank) {
      cy.log(`[UX CRITICAL] Blank screen detected on [${ctx}]`);
    }
    expect(
      isNotBlank,
      `[UX CRITICAL] Blank screen detected on [${ctx}]`
    ).to.be.true;

    // 2. Check for broken visible images (naturalWidth === 0)
    const images = Array.from(win.document.querySelectorAll('img')).filter(isElementVisible);
    const brokenImages = images.filter((img) => img.complete && img.naturalWidth === 0);
    if (brokenImages.length > 0) {
      const brokenSrcs = brokenImages.map((img) => img.src || img.getAttribute('src') || 'unknown').join(', ');
      cy.log(`[UX WARNING] Broken images detected (${ctx}): ${brokenSrcs}`);
    }
    expect(brokenImages.length, `Broken visible images check on [${ctx}] (found: ${brokenImages.length})`).to.equal(0);

    // 3. Accessibility Check: Buttons and links without accessible names
    const interactiveElements = Array.from(
      win.document.querySelectorAll('button, a[href], [role="button"]')
    ).filter(isElementVisible);

    const unnamedInteractive = interactiveElements.filter((el) => {
      const text = (el.innerText || el.textContent || '').trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const ariaLabelledBy = (el.getAttribute('aria-labelledby') || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      const imgAlt = Array.from(el.querySelectorAll('img[alt]'))
        .map((img) => img.getAttribute('alt')?.trim())
        .filter(Boolean)
        .join('');
      const svgTitle = (el.querySelector('svg title')?.textContent || '').trim();

      const accessibleName = text || ariaLabel || ariaLabelledBy || title || imgAlt || svgTitle;
      return !accessibleName;
    });

    if (unnamedInteractive.length > 0) {
      const samples = unnamedInteractive.slice(0, 3).map((el) => el.outerHTML.slice(0, 80)).join(' | ');
      cy.log(`[A11Y WARNING] ${unnamedInteractive.length} interactive elements without accessible name (${ctx}): ${samples}`);
    }
    expect(
      unnamedInteractive.length,
      `A11Y check on [${ctx}]: interactive buttons/links must have accessible names (found ${unnamedInteractive.length} inaccessible)`
    ).to.equal(0);

    // 4. Accessibility Check: Form controls missing labels or placeholders
    const formControls = Array.from(
      win.document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea')
    ).filter(isElementVisible);

    const unlabelledControls = formControls.filter((input) => {
      const ariaLabel = (input.getAttribute('aria-label') || '').trim();
      const ariaLabelledBy = (input.getAttribute('aria-labelledby') || '').trim();
      const placeholder = (input.getAttribute('placeholder') || '').trim();
      const title = (input.getAttribute('title') || '').trim();

      let hasAccessibleLabel = Boolean(ariaLabel || ariaLabelledBy || placeholder || title);
      if (!hasAccessibleLabel) {
        if (input.closest('label')) {
          hasAccessibleLabel = true;
        }
      }
      if (!hasAccessibleLabel && input.id) {
        const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(input.id) : input.id;
        const labelFor = win.document.querySelector(`label[for="${escapedId}"]`);
        if (labelFor && (labelFor.textContent || '').trim().length > 0) {
          hasAccessibleLabel = true;
        }
      }
      return !hasAccessibleLabel;
    });

    if (unlabelledControls.length > 0) {
      const samples = unlabelledControls.slice(0, 3).map((el) => el.outerHTML.slice(0, 80)).join(' | ');
      cy.log(`[A11Y WARNING] ${unlabelledControls.length} form inputs without labels/placeholders (${ctx}): ${samples}`);
    }
    expect(
      unlabelledControls.length,
      `A11Y check on [${ctx}]: form inputs must have associated labels or placeholders (found ${unlabelledControls.length} unlabelled)`
    ).to.equal(0);

    // 5. Mobile Touch Target Size Check (WCAG 2.2 AA — 24x24px minimum)
    const isMobile = opts.isMobile === true || win.innerWidth < 768;
    if (isMobile) {
      const interactiveTargets = Array.from(
        win.document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input:not([type="hidden"]), select')
      ).filter(isElementVisible);

      const undersizedTargets = interactiveTargets.filter((el) => {
        // Exclude inline prose links
        const style = win.getComputedStyle(el);
        if (el.tagName === 'A' && style.display === 'inline' && Boolean(el.closest('p, li, span'))) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width < 24 || rect.height < 24;
      });

      if (undersizedTargets.length > 0) {
        const diagnostics = undersizedTargets.map((el) => {
          const rect = el.getBoundingClientRect();
          const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('name') || el.getAttribute('title') || el.tagName).trim().slice(0, 30);
          return `<${el.tagName.toLowerCase()} "${label}": ${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}px>`;
        }).join(', ');
        cy.log(`[WCAG 2.2 AA WARNING] Undersized touch targets on [${ctx}]: ${diagnostics}`);
      }

      expect(
        undersizedTargets.length,
        `[WCAG 2.2 AA] Mobile touch targets on [${ctx}] must be at least 24x24px (found ${undersizedTargets.length} undersized: ${undersizedTargets.slice(0, 5).map((el) => {
          const rect = el.getBoundingClientRect();
          const label = (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20);
          return `<${el.tagName.toLowerCase()} "${label}": ${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}px>`;
        }).join(', ')})`
      ).to.equal(0);
    }
  });

  // 6. Optional cypress-axe integration if installed and configured
  cy.window({ log: false }).then(() => {
    if (typeof cy.injectAxe === 'function' && typeof cy.checkA11y === 'function') {
      try {
        cy.injectAxe();
        cy.checkA11y(null, { includedImpacts: ['critical', 'serious'] });
      } catch (err) {
        cy.log(`[A11Y Axe] Check skipped: ${err.message}`);
      }
    }
  });
});

// Audit Session Cookies (HttpOnly, SameSite, Secure on HTTPS)
Cypress.Commands.add('auditSessionCookies', () => {
  cy.getAllCookies().then((cookies) => {
    if (!cookies || cookies.length === 0) {
      cy.log('[Cookie Audit] No cookies found to audit.');
      return;
    }

    const authCookies = cookies.filter((c) => /token|session|auth|sid|jwt/i.test(c.name));
    if (authCookies.length === 0) {
      cy.log(`[Cookie Audit] ${cookies.length} cookie(s) found, but none matched auth/session keywords.`);
      return;
    }

    const isHttps = Boolean(Cypress.config('baseUrl')?.startsWith('https://'));
    authCookies.forEach((cookie) => {
      cy.log(`[Cookie Audit] Checking auth cookie: ${cookie.name}`);
      expect(cookie.httpOnly, `Auth cookie "${cookie.name}" must have HttpOnly flag`).to.be.true;
      expect(Boolean(cookie.sameSite), `Auth cookie "${cookie.name}" must define SameSite attribute`).to.be.true;
      if (isHttps) {
        expect(cookie.secure, `Auth cookie "${cookie.name}" on HTTPS must have Secure flag`).to.be.true;
      }
    });
  });
});

// Shared Session Login: caches authentication across specs and viewports
Cypress.Commands.add('loginSession', (user, pass, loginUrl = '/login') => {
  const sessionKey = `${user}-${loginUrl}`;
  cy.session(
    sessionKey,
    () => {
      // Intercept login API call before clicking submit
      cy.intercept('POST', '**/*{auth,login,token}*').as('sessionLoginReq');

      cy.visit(loginUrl, { failOnStatusCode: false });

      // Ensure form inputs are mounted by SPA/React framework before querying
      cy.get('input', { timeout: 10000 }).should('have.length.at.least', 2);

      cy.get('body').then(($body) => {
        // Resilient email / username input locator (avoiding pseudo-case insensitive selectors in jQuery)
        const emailInput = $body.find('input').filter((_, el) => {
          const $el = Cypress.$(el);
          const type = ($el.attr('type') || '').toLowerCase();
          const name = ($el.attr('name') || '').toLowerCase();
          const placeholder = ($el.attr('placeholder') || '').toLowerCase();
          const ariaLabel = ($el.attr('aria-label') || '').toLowerCase();
          return (
            type === 'email' ||
            /user|login|email|usuario/.test(name) ||
            /@|email|usuário|usuario/.test(placeholder) ||
            /email|usuário|usuario/.test(ariaLabel) ||
            type === 'text'
          );
        }).first();

        // Resilient password input locator
        const passInput = $body.find('input').filter((_, el) => {
          const $el = Cypress.$(el);
          const type = ($el.attr('type') || '').toLowerCase();
          const name = ($el.attr('name') || '').toLowerCase();
          const placeholder = ($el.attr('placeholder') || '').toLowerCase();
          const ariaLabel = ($el.attr('aria-label') || '').toLowerCase();
          return (
            type === 'password' ||
            /pass|senha/.test(name) ||
            /senha|••/.test(placeholder) ||
            /senha|password/.test(ariaLabel)
          );
        }).first();

        expect(emailInput.length, 'Login user input must exist').to.be.greaterThan(0);
        expect(passInput.length, 'Login password input must exist').to.be.greaterThan(0);

        cy.wrap(emailInput).clear({ force: true }).type(user, { force: true });
        cy.wrap(passInput).clear({ force: true }).type(pass, { force: true });

        // Locate submit action: prioritize button with exact CTA labels
        const submitBtn = $body.find('button[type="submit"], input[type="submit"], [role="button"], button').filter((_, el) => {
          const text = Cypress.$(el).text().trim();
          const label = Cypress.$(el).attr('aria-label') || '';
          return /^(acessar painel|entrar|login)$/i.test(text) || /acessar painel|entrar/i.test(label);
        });

        if (submitBtn.length > 0) {
          cy.wrap(submitBtn.first()).click({ force: true });
        } else {
          cy.contains(/Acessar Painel|Entrar|Login/i).click({ force: true });
        }
      });

      // Wait for login request to complete with 2xx status code
      cy.wait('@sessionLoginReq', { timeout: 10000 }).then((interception) => {
        expect(interception.response?.statusCode, 'Login request must return 2xx').to.be.lessThan(400);
        const token = interception.response?.body?.token || interception.response?.body?.accessToken;
        if (token) {
          cy.window().then((win) => {
            win.localStorage.setItem('auth_access_token', token);
            win.localStorage.setItem('token', token);
          });
        }
      });

      // After clicking submit, assert redirect away from /login
      cy.url({ timeout: 10000 }).should('not.include', 'login');

      // Audit session cookies after authentication succeeds
      cy.auditSessionCookies();
    },
    {
      validate() {
        cy.window({ log: false }).then((win) => {
          let hasToken = false;
          const storages = [win.localStorage, win.sessionStorage];
          for (const storage of storages) {
            if (storage) {
              for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (/token|auth|jwt|session/i.test(key) && storage.getItem(key)) {
                  hasToken = true;
                  break;
                }
              }
            }
            if (hasToken) break;
          }
          const hasCookie = Boolean(win.document && win.document.cookie && win.document.cookie.trim().length > 0);
          return { hasAuthIndicator: hasToken || hasCookie };
        }).then(({ hasAuthIndicator }) => {
          if (hasAuthIndicator) {
            expect(hasAuthIndicator).to.be.true;
          } else {
            cy.visit('/', { failOnStatusCode: false });
            cy.url({ timeout: 5000 }).should('not.include', '/login');
          }
        });
      }
    }
  );
});

// Console Errors Tracker
Cypress.Commands.add('captureConsoleErrors', () => {
  const errors = [];
  cy.window().then((win) => {
    win.__capturedErrors = errors;
    win.addEventListener('error', (event) => {
      errors.push({ type: 'uncaught-error', message: event.message, filename: event.filename, lineno: event.lineno });
    });
    win.addEventListener('unhandledrejection', (event) => {
      errors.push({ type: 'unhandled-rejection', reason: String(event.reason) });
    });
  });
  return cy.wrap(errors);
});

// Network Failure Interceptor (Captures 4xx and 5xx responses)
Cypress.Commands.add('captureNetworkErrors', () => {
  const failedRequests = [];
  cy.intercept('**', (req) => {
    req.on('response', (res) => {
      if (res.statusCode >= 400) {
        failedRequests.push({
          url: req.url,
          method: req.method,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage
        });
      }
    });
  }).as('networkWatch');
  return cy.wrap(failedRequests);
});

// Whitelist specific HTTP error status codes for negative/resilience tests
Cypress.Commands.add('allowHttpErrors', (statusCodes = [500, 503]) => {
  const codes = Array.isArray(statusCodes) ? statusCodes : [statusCodes];
  if (!Cypress.expectedHttpErrors) {
    Cypress.expectedHttpErrors = [];
  }
  codes.forEach((code) => {
    const num = Number(code);
    if (!Cypress.expectedHttpErrors.includes(num)) {
      Cypress.expectedHttpErrors.push(num);
    }
  });
  cy.log(`[HTTP Resilience] Whitelisted HTTP status codes: ${codes.join(', ')}`);
});

// Assert that a named intercept alias never received any network requests
Cypress.Commands.add('assertNoRequest', (alias) => {
  const cleanAlias = alias.startsWith('@') ? alias.slice(1) : alias;
  cy.get(`@${cleanAlias}.all`).should('have.length', 0);
});

// Autonomous Crawler & Fuzzer Engine
Cypress.Commands.add('crawlAndFuzz', (options = {}) => {
  const {
    maxClicks = 25,
    fillInputs = true,
    stayOnOrigin = true,
    context = 'Fuzz',
    isMobile = false
  } = options;

  const safeModeFlag = getPublicFlag('SAFE_MODE', false);
  const allowMutationsFlag = getPublicFlag('ALLOW_MUTATIONS', false);
  const isSafeMode = (safeModeFlag === true || safeModeFlag === 'true') && !(allowMutationsFlag === true || allowMutationsFlag === 'true');
  const isAllowOpenSwagger = getPublicFlag('ALLOW_OPEN_SWAGGER', false) === true || getPublicFlag('ALLOW_OPEN_SWAGGER', false) === 'true';

  cy.window({ log: false }).then((win) => {
    const origin = win.location.origin;
    cy.log(`[Fuzzer] Starting autonomous crawl on ${origin} (context: ${context}, isMobile: ${isMobile}, SAFE_MODE: ${isSafeMode})`);
  });

  // When in SAFE_MODE, block and stub mutating HTTP calls (POST, PUT, PATCH, DELETE)
  if (isSafeMode) {
    cy.log('[Fuzzer] SAFE_MODE active: intercepting and blocking mutating requests');
    cy.intercept({ method: /^(POST|PUT|PATCH|DELETE)$/ }, (req) => {
      // Allow authentication endpoints to proceed so login sessions function
      if (req.url.includes('/auth') || req.url.includes('/login') || req.url.includes('/token')) {
        req.continue();
      } else {
        console.log(`[SAFE_MODE BLOCKED] ${req.method} ${req.url}`);
        req.reply({
          statusCode: 200,
          body: { message: '[SAFE_MODE] Mutating request safely intercepted by autonomous fuzzer' },
          headers: { 'x-safe-mode-blocked': 'true' }
        });
      }
    }).as('safeModeBlocker');
  }

  // 1. Gather all interactive form elements and fuzz test with safe inputs
  if (fillInputs) {
    cy.get('body').then(($body) => {
      const inputs = $body.find('input:visible, textarea:visible, select:visible');
      if (inputs.length > 0) {
        cy.log(`[Fuzzer] Found ${inputs.length} interactive inputs to test`);
        let xssProbeInjected = false;

        cy.wrap(inputs).each(($input) => {
          const type = ($input.attr('type') || 'text').toLowerCase();
          const name = ($input.attr('name') || '').toLowerCase();

          // Skip read-only, disabled, hidden or submit inputs
          if ($input.is(':disabled') || $input.prop('readonly') || ['submit', 'button', 'hidden'].includes(type)) {
            return;
          }

          if (type === 'email' || name.includes('email')) {
            cy.wrap($input).clear({ force: true }).type('qa-fuzz-test@example.com', { force: true });
          } else if (type === 'password' || name.includes('password') || name.includes('senha')) {
            cy.wrap($input).clear({ force: true }).type('TestPassword123!', { force: true });
          } else if (type === 'number') {
            cy.wrap($input).clear({ force: true }).type('10', { force: true });
          } else if (type === 'checkbox' || type === 'radio') {
            cy.wrap($input).check({ force: true });
          } else if ($input.is('select')) {
            const options = $input.find('option');
            if (options.length > 1) {
              cy.wrap($input).select(options.eq(1).val(), { force: true });
            }
          } else if (type === 'text' || type === 'search' || $input.is('textarea')) {
            if (!isSafeMode && !xssProbeInjected && (type === 'text' || type === 'search')) {
              xssProbeInjected = true;
              cy.wrap($input).clear({ force: true }).type('QA_PROBE_<img src=x onerror="window.__qaXssTriggered=true">', { force: true });
            } else {
              cy.wrap($input).clear({ force: true }).type('QA Autonomous Probe', { force: true });
            }
          }
        });

        // After input fuzzing completes, verify XSS canary was not triggered
        cy.window({ log: false }).then((win) => {
          expect(win.__qaXssTriggered, 'Reflected XSS vulnerability detected during input fuzzing').to.not.equal(true);
        });
      }
    });
  }

  // 2. Fuzz clicks on interactive elements with visited signature tracking
  const visitedSignatures = new Set();
  let lastHref = '';
  let lastModalCount = 0;
  let stepCount = 0;

  const countModals = (win) => {
    try {
      if (typeof Cypress !== 'undefined' && Cypress.$) {
        return Cypress.$('[role="dialog"]:visible, dialog[open], [aria-modal="true"]:visible', win.document).length;
      }
    } catch {}
    const modals = Array.from(win.document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]'));
    return modals.filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = win.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }).length;
  };

  // Initialize route baseline and modal count
  cy.window({ log: false }).then((win) => {
    lastHref = win.location.href;
    lastModalCount = countModals(win);
  });

  const crawlStep = () => {
    if (stepCount >= maxClicks) {
      // 4. SPA History & Reload Resilience
      cy.reload();
      cy.checkUXHeuristics(`${context}-PostReload`, { isMobile });
      return;
    }

    cy.window({ log: false }).then((win) => {
      if (stepCount >= maxClicks) {
        cy.reload();
        cy.checkUXHeuristics(`${context}-PostReload`, { isMobile });
        return;
      }

      // 1. Visited Element Signature Tracking: live DOM query for visible clickable candidates
      const candidates = Cypress.$('button:visible, a:visible, [role="button"]:visible, [role="tab"]:visible', win.document);
      let targetEl = null;
      let targetSig = '';
      let targetLabel = '';
      let targetHref = '';

      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        const text = (el.innerText || el.textContent || '').trim();
        const ariaLabel = (el.getAttribute('aria-label') || '').trim();
        const title = (el.getAttribute('title') || '').trim();
        const combinedLabel = `${text} ${ariaLabel} ${title}`.trim();
        const href = el.getAttribute('href') || '';

        const sig = `${el.tagName}|${el.id || ''}|${el.getAttribute('name') || ''}|${href}|${el.getAttribute('role') || ''}|${combinedLabel.slice(0, 40)}`;

        if (visitedSignatures.has(sig)) {
          continue;
        }

        // Skip clicking elements matching destructive terms in SAFE_MODE (mark visited to avoid re-evaluating)
        if (isSafeMode && DESTRUCTIVE_KEYWORDS_REGEX.test(combinedLabel)) {
          visitedSignatures.add(sig);
          cy.log(`[Fuzzer] SAFE_MODE skipping destructive action: "${combinedLabel}"`);
          continue;
        }

        // Skip external navigation links when stayOnOrigin is active (mark visited)
        if (href && (href.startsWith('http://') || href.startsWith('https://')) && stayOnOrigin) {
          if (!href.startsWith(win.location.origin)) {
            visitedSignatures.add(sig);
            cy.log(`[Fuzzer] Skipping external navigation link: ${href}`);
            continue;
          }
        }

        // First unvisited eligible candidate found
        targetEl = el;
        targetSig = sig;
        targetLabel = combinedLabel;
        targetHref = href;
        break;
      }

      if (!targetEl) {
        cy.log(`[Fuzzer] No more unvisited clickable targets found (crawled ${stepCount} elements). Ending crawl.`);
        // 4. SPA History & Reload Resilience
        cy.reload();
        cy.checkUXHeuristics(`${context}-PostReload`, { isMobile });
        return;
      }

      // Mark signature as visited immediately before clicking
      visitedSignatures.add(targetSig);
      stepCount++;

      // 2. Actionability / Overlap Check Before { force: true }
      const rect = targetEl.getBoundingClientRect();
      const centerX = Math.floor(rect.left + rect.width / 2);
      const centerY = Math.floor(rect.top + rect.height / 2);

      if (centerX >= 0 && centerX <= win.innerWidth && centerY >= 0 && centerY <= win.innerHeight) {
        const topEl = win.document.elementFromPoint(centerX, centerY);
        if (topEl && topEl !== targetEl && !targetEl.contains(topEl)) {
          cy.log(`[UX OVERLAP WARNING] Interactive element "${targetLabel}" is covered by <${topEl.tagName.toLowerCase()}>`);
        }
      }

      // Execute click with { force: true }
      cy.wrap(targetEl, { log: false }).click({ force: true });

      // Deterministic DOM stability check: ensure body is visible and no blocking spinner is active
      cy.get('body').should('be.visible');
      cy.get('[aria-busy="true"]', { timeout: 4000 }).should('not.exist');

      // 3. Per-Transition & Modal UX Audits
      cy.window({ log: false }).then((postWin) => {
        const currentHref = postWin.location.href;
        const currentModalCount = countModals(postWin);

        if (currentHref !== lastHref || currentModalCount > lastModalCount) {
          lastHref = currentHref;
          lastModalCount = currentModalCount;
          cy.checkUXHeuristics(`${context}-Step${stepCount}`, { isMobile });
        } else if (currentModalCount !== lastModalCount) {
          lastModalCount = currentModalCount;
        }
      });

      // Recurse to next unvisited step
      crawlStep();
    });
  };

  // Launch crawl loop
  crawlStep();
});
