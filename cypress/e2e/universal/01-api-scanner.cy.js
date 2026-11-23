/**
 * cypress/e2e/universal/01-api-scanner.cy.js
 * Universal API, Security, Exposure & Contract Integrity Scanner
 * Works in both Black-Box mode (probing Swagger/OpenAPI routes and sensitive files)
 * and Catalog mode (executing dynamic and declarative endpoint matrices).
 */

describe('Universal API & Contract Integrity Scanner', () => {
  const baseUrl = Cypress.config('baseUrl') || 'http://localhost';

  const healthProbes = [
    '/api/v1/health',
    '/health'
  ];

  const sensitiveProbes = [
    '/.env',
    '/.git/config',
    '/actuator/env',
    '/actuator/health',
    '/metrics',
    '/graphql',
    '/server-status'
  ];

  // Common API documentation paths across .NET, Node, Python, Spring, Go
  const swaggerProbes = [
    '/swagger/v1/swagger.json',
    '/swagger/index.html',
    '/api-docs',
    '/openapi.json',
    '/v3/api-docs'
  ];

  // Local helper to resolve $ref pointers safely (depth limit of 5 to prevent circular references)
  function resolveSchemaRef(doc, schema, depth = 0) {
    if (!schema || depth >= 5 || typeof schema !== 'object') return schema;
    if (schema.$ref && typeof schema.$ref === 'string') {
      const refPath = schema.$ref.replace(/^#\//, '').split('/');
      let target = doc;
      for (const segment of refPath) {
        if (target && typeof target === 'object' && segment in target) {
          target = target[segment];
        } else {
          target = null;
          break;
        }
      }
      if (target) {
        return resolveSchemaRef(doc, target, depth + 1);
      }
    }
    return schema;
  }

  // Local helper to access nested properties by dot-notation (e.g. "data.token" or "items.0.id")
  function getByDotPath(obj, dotPath) {
    if (!obj || typeof obj !== 'object' || !dotPath) return undefined;
    const parts = dotPath.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part];
      } else {
        return undefined;
      }
    }
    return curr;
  }

  it('Stage 1.1: Standard health and availability telemetry probes', () => {
    cy.log(`Probing health and telemetry endpoints on ${baseUrl}`);

    healthProbes.forEach((route) => {
      cy.request({
        url: `${baseUrl}${route}`,
        failOnStatusCode: false,
        timeout: 5000
      }).then((response) => {
        cy.log(`Health probe [${route}] -> Status: ${response.status} (Duration: ${response.duration}ms)`);
        if (response.status === 200) {
          cy.log(`[HEALTH OK] Active health telemetry endpoint at ${route}`);
        }
      });
    });
  });

  it('Stage 1.2: Sensitive file and admin exposure probes', () => {
    cy.log(`Probing sensitive file and admin endpoints on ${baseUrl}`);

    sensitiveProbes.forEach((route) => {
      cy.request({
        url: `${baseUrl}${route}`,
        failOnStatusCode: false,
        timeout: 5000
      }).then((response) => {
        cy.log(`Sensitive probe [${route}] -> Status: ${response.status}`);
        const contentType = (response.headers['content-type'] || '').toLowerCase();
        const bodyStr = typeof response.body === 'object' ? JSON.stringify(response.body) : String(response.body || '');
        const sensitiveSignatures = /DB_PASSWORD=|SECRET_KEY=|AWS_SECRET|\[core\]|repositoryformatversion|Apache Server Status|GraphQL Playground|# HELP /i;

        if (response.status === 200) {
          // If 200 OK and not HTML (e.g. text/plain, application/json, octet-stream), it is an exposed sensitive file
          expect(
            contentType.includes('text/html'),
            `Sensitive endpoint ${route} must not return 200 OK with non-HTML content (Content-Type: ${contentType})`
          ).to.be.true;

          // If 200 OK with HTML (SPA fallback), assert that it does not contain real sensitive/admin signatures
          const hasSecretSignature = sensitiveSignatures.test(bodyStr);
          expect(
            hasSecretSignature,
            `Sensitive/admin signature leaked on ${route} (even inside HTML response)`
          ).to.be.false;

          cy.log(`[SPA Fallback] Endpoint ${route} returned 200 HTML without sensitive signatures.`);
        } else {
          // Status is 3xx, 4xx, etc. — verify no sensitive content leaked in response body
          if (route === '/.env' || route === '/.git/config') {
            const hasSecretSignature = sensitiveSignatures.test(bodyStr);
            expect(hasSecretSignature, `Sensitive configuration content leaked on ${route}`).to.be.false;
          }
        }
      });
    });
  });

  it('Stage 1.3: OpenAPI / Swagger discovery, PII leak guard & deep schema validation', () => {
    const safeModeVal = Cypress.getPublicFlag ? Cypress.getPublicFlag('SAFE_MODE', false) : Cypress.env('SAFE_MODE');
    const allowSwaggerVal = Cypress.getPublicFlag ? Cypress.getPublicFlag('ALLOW_OPEN_SWAGGER', false) : Cypress.env('ALLOW_OPEN_SWAGGER');
    const isSafeMode = safeModeVal === true || safeModeVal === 'true';
    const allowOpenSwagger = allowSwaggerVal === true || allowSwaggerVal === 'true';

    cy.log(`Probing API documentation endpoints on ${baseUrl} (SAFE_MODE: ${isSafeMode})`);

    swaggerProbes.forEach((route) => {
      cy.request({
        url: `${baseUrl}${route}`,
        failOnStatusCode: false,
        timeout: 5000
      }).then((response) => {
        const found = [200, 301, 302, 401, 403].includes(response.status);
        cy.log(`Probe [${route}] -> Status: ${response.status} (${found ? 'ACCESSIBLE/PROTECTED' : 'NOT FOUND'})`);

        const isJson = Boolean(response.headers['content-type']?.includes('application/json') && typeof response.body === 'object');
        if (response.status === 200 && isJson) {
          cy.log(`[SWAGGER DISCOVERED] Found active OpenAPI/Swagger JSON schema at ${route}`);
          expect(response.body).to.be.an('object');

          // In SAFE_MODE (live target), publicly exposed unauthenticated API documentation is rejected unless ALLOW_OPEN_SWAGGER=true
          if (isSafeMode && !allowOpenSwagger) {
            expect(response.status, `Public Swagger/OpenAPI schema exposed at ${route} in SAFE_MODE (must require auth or set ALLOW_OPEN_SWAGGER=true)`).to.not.equal(200);
          }

          // Deep OpenAPI GET Contract Validation
          if (response.body.paths && typeof response.body.paths === 'object' && (!isSafeMode || allowOpenSwagger)) {
            const paths = response.body.paths;
            const parameterlessGetEndpoints = Object.keys(paths)
              .filter((p) => {
                const routeObj = paths[p];
                const hasGet = Boolean(routeObj && (routeObj.get || routeObj.GET));
                const isParameterless = !p.includes('{') && !p.includes(':');
                const isSafeGet = !/logout|delete/i.test(p);
                return hasGet && isParameterless && isSafeGet;
              })
              .slice(0, 10);

            if (parameterlessGetEndpoints.length > 0) {
              cy.log(`[OpenAPI Contract] Probing ${parameterlessGetEndpoints.length} discovered parameterless GET endpoints`);
              parameterlessGetEndpoints.forEach((apiPath) => {
                const basePath = response.body.basePath || '';
                const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
                const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
                const fullRoute = `${cleanBase}${cleanPath}`;
                const targetUrl = `${baseUrl}${fullRoute.startsWith('/') ? '' : '/'}${fullRoute}`;

                cy.request({
                  url: targetUrl,
                  failOnStatusCode: false,
                  timeout: 5000
                }).then((apiRes) => {
                  cy.log(`[Contract GET] ${fullRoute} -> Status: ${apiRes.status}`);
                  expect(apiRes.status, `GET ${fullRoute} must not return 5xx server error`).to.be.lessThan(500);

                  const isJsonBody = Boolean(apiRes.headers['content-type']?.includes('application/json'));
                  if (apiRes.status === 200 && isJsonBody) {
                    const isValidJson = typeof apiRes.body === 'object' && apiRes.body !== null;
                    expect(isValidJson, `GET ${fullRoute} response body must be a valid JSON object or array`).to.be.true;

                    // Resolve declared schema for 200 response
                    const routeDecl = paths[apiPath]?.get || paths[apiPath]?.GET;
                    const okResp = routeDecl?.responses && (routeDecl.responses['200'] || routeDecl.responses[200]);
                    const rawSchema = okResp?.content?.['application/json']?.schema || okResp?.schema;
                    const resolvedSchema = resolveSchemaRef(response.body, rawSchema);

                    if (resolvedSchema) {
                      // Validate declared root type
                      if (resolvedSchema.type === 'array') {
                        expect(apiRes.body, `GET ${fullRoute} 200 body should match declared array type`).to.be.an('array');
                      } else if (resolvedSchema.type === 'object') {
                        expect(apiRes.body, `GET ${fullRoute} 200 body should match declared object type`).to.be.an('object');
                      }

                      // Validate required fields on root object response
                      if (Array.isArray(resolvedSchema.required) && typeof apiRes.body === 'object' && apiRes.body !== null && !Array.isArray(apiRes.body)) {
                        resolvedSchema.required.forEach((prop) => {
                          expect(apiRes.body[prop], `Required property "${prop}" missing in GET ${fullRoute}`).to.not.be.undefined;
                        });
                      }

                      // Validate required fields on array items
                      if ((resolvedSchema.type === 'array' || resolvedSchema.items) && Array.isArray(apiRes.body) && apiRes.body.length > 0) {
                        const itemSchema = resolveSchemaRef(response.body, resolvedSchema.items);
                        if (itemSchema && Array.isArray(itemSchema.required) && typeof apiRes.body[0] === 'object' && apiRes.body[0] !== null) {
                          itemSchema.required.forEach((prop) => {
                            expect(apiRes.body[0][prop], `Required property "${prop}" missing in items of GET ${fullRoute}`).to.not.be.undefined;
                          });
                        }
                      }
                    }

                    // Unauthenticated PII Leak Guard
                    const isWhitelisted = /health|status|version|public|config|catalogo|produtos/i.test(cleanPath);
                    if (!isWhitelisted && Array.isArray(apiRes.body) && apiRes.body.length > 0) {
                      const sampleItem = apiRes.body[0];
                      if (sampleItem && typeof sampleItem === 'object') {
                        const keys = Object.keys(sampleItem);
                        const hasPii = keys.some((k) => /email|cpf|cnpj|password|senha|token|secret|telefone|phone/i.test(k));
                        expect(hasPii, `[SECURITY CRITICAL] Unauthenticated GET ${fullRoute} leaked sensitive user/PII records`).to.be.false;
                      }
                    }
                  }
                });
              });
            }
          }
        }
      });
    });
  });

  it('Stage 1.4: Strict HTTP security headers & cookie hardening', () => {
    cy.request({
      url: baseUrl,
      failOnStatusCode: false,
      timeout: 8000,
      headers: {
        'Accept-Encoding': 'gzip, deflate, br'
      }
    }).then((res) => {
      expect([200, 301, 302, 304, 401, 403]).to.include(res.status);
      expect(res.duration).to.be.lessThan(8000);

      const headers = res.headers;
      const xContentType = headers['x-content-type-options'];
      const xFrame = headers['x-frame-options'];
      const csp = headers['content-security-policy'] || '';
      const hsts = headers['strict-transport-security'];

      cy.log(`Base URL HTTP Status: ${res.status} | Latency: ${res.duration}ms`);

      // 1. Anti-MIME sniffing enforcement
      expect(xContentType, 'Missing X-Content-Type-Options header').to.match(/nosniff/i);

      // 2. Clickjacking protection enforcement (X-Frame-Options or CSP frame-ancestors)
      const hasFrameProtection = Boolean(xFrame || /frame-ancestors/i.test(csp));
      expect(hasFrameProtection, 'Missing Clickjacking protection (X-Frame-Options or CSP frame-ancestors)').to.be.true;

      // 3. Strict-Transport-Security on HTTPS
      if (baseUrl.startsWith('https://')) {
        expect(hsts, 'HTTPS target must enforce Strict-Transport-Security').to.be.a('string').and.not.be.empty;
      }

      // 4. HTTP Compression validation
      const encoding = headers['content-encoding'];
      if (encoding) {
        expect(encoding).to.match(/gzip|br/i);
        cy.log(`[HTTP Compression] Content-Encoding active: ${encoding}`);
      }

      // 5. Landing response cookie audit
      cy.auditSessionCookies();
    });
  });

  it('Stage 1.5: Declarative repository contracts (qa-contracts.json)', () => {
    const rawContracts = Cypress.getPublicFlag ? Cypress.getPublicFlag('QA_CONTRACTS', null) : Cypress.env('QA_CONTRACTS');
    let contracts = null;
    if (rawContracts) {
      try {
        contracts = typeof rawContracts === 'string' ? JSON.parse(rawContracts) : rawContracts;
      } catch (err) {
        cy.log(`[Contracts Error] Failed to parse QA_CONTRACTS: ${err.message}`);
      }
    }

    if (!contracts) {
      cy.log('[Contracts] No qa-contracts.json configured; skipping declarative contract suite.');
      return;
    }

    cy.log('[Contracts] Executing declarative contract specifications from qa-contracts.json');
    let authToken = null;
    const endpoints = Array.isArray(contracts.endpoints) ? contracts.endpoints : [];
    const needsAuth = endpoints.some((e) => e.auth === true);

    if (contracts.auth && needsAuth) {
      const loginUrl = contracts.auth.loginUrl.startsWith('http')
        ? contracts.auth.loginUrl
        : `${baseUrl}${contracts.auth.loginUrl.startsWith('/') ? '' : '/'}${contracts.auth.loginUrl}`;

      cy.request({
        method: 'POST',
        url: loginUrl,
        body: contracts.auth.body,
        failOnStatusCode: false
      }).then((loginRes) => {
        expect(loginRes.status, `Contract authentication to ${contracts.auth.loginUrl} failed`).to.be.lessThan(400);
        authToken = getByDotPath(loginRes.body, contracts.auth.tokenPath || 'token');
        expect(authToken, `Token not found at path "${contracts.auth.tokenPath}" in login response`).to.be.a('string').and.not.be.empty;
      });
    }

    cy.then(() => {
      endpoints.forEach((ep) => {
        const reqHeaders = {};
        if (ep.auth && authToken) {
          reqHeaders['Authorization'] = `Bearer ${authToken}`;
        }
        const epUrl = ep.path.startsWith('http')
          ? ep.path
          : `${baseUrl}${ep.path.startsWith('/') ? '' : '/'}${ep.path}`;

        cy.request({
          method: ep.method || 'GET',
          url: epUrl,
          headers: reqHeaders,
          body: ep.body || undefined,
          failOnStatusCode: false
        }).then((res) => {
          cy.log(`[Contract] ${ep.method || 'GET'} ${ep.path} -> Status: ${res.status}`);
          const expectedStatus = ep.expectedStatus !== undefined ? ep.expectedStatus : 200;
          expect(res.status, `Endpoint ${ep.method || 'GET'} ${ep.path} status`).to.equal(expectedStatus);

          if (Array.isArray(ep.requiredFields)) {
            ep.requiredFields.forEach((field) => {
              const val = getByDotPath(res.body, field);
              expect(val, `Required field "${field}" must exist in response of ${ep.path}`).to.not.be.undefined;
            });
          }
        });
      });
    });
  });
});
