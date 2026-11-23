import { defineConfig } from 'cypress';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    screenshotOnRunFailure: true,
    chromeWebSecurity: false,
    setupNodeEvents(on, config) {
      // Custom Node Tasks for universal execution telemetry
      on('task', {
        logMessage(msg) {
          console.log(`[CYPRESS NODE] ${msg}`);
          return null;
        },
        saveDiscoveredRoutes({ project = 'universal', routes }) {
          console.log(`[CYPRESS NODE] Discovered ${routes.length} routes for ${project}`);
          return null;
        },
        'rateLimit:reset'() {
          try {
            const { execSync } = require('child_process');
            execSync('docker exec restaurante_redis redis-cli -a redis_seguro_123 FLUSHDB', { stdio: 'ignore' });
            console.log('[CYPRESS NODE rateLimit:reset] Redis rate limit cache cleared.');
          } catch {
            // Non-blocking fallback if container is not running or redis password differs
          }
          return null;
        },
        'db:seed'({ project = 'universal', scenario = 'default' } = {}) {
          const seedScript = process.env.DB_SEED_SCRIPT;
          const seedUrl = process.env.DB_SEED_URL;

          if (seedScript && fs.existsSync(seedScript)) {
            try {
              console.log(`[CYPRESS NODE db:seed] Executing seed script: ${seedScript} for ${project} (${scenario})`);
              execSync(`node "${seedScript}"`, {
                stdio: 'inherit',
                env: { ...process.env, SEED_SCENARIO: scenario, SEED_PROJECT: project },
              });
            } catch (err) {
              console.error(`[CYPRESS NODE db:seed] Seed script error: ${err.message}`);
            }
          } else if (seedUrl) {
            console.log(`[CYPRESS NODE db:seed] Triggering HTTP reset at: ${seedUrl} for ${project} (${scenario})`);
            try {
              if (typeof fetch === 'function') {
                fetch(seedUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ project, scenario }),
                }).catch(() => {});
              }
            } catch (err) {
              console.error(`[CYPRESS NODE db:seed] HTTP seed error: ${err.message}`);
            }
          } else {
            console.log(`[CYPRESS NODE db:seed] Deterministic no-op for ${project} (scenario: ${scenario}) - no DB_SEED_SCRIPT or DB_SEED_URL configured.`);
          }
          return null;
        },
        'downloads:clear'() {
          const downloadsFolder = config.downloadsFolder || path.join(process.cwd(), 'cypress', 'downloads');
          if (fs.existsSync(downloadsFolder)) {
            try {
              const files = fs.readdirSync(downloadsFolder);
              for (const file of files) {
                const fullPath = path.join(downloadsFolder, file);
                if (fs.statSync(fullPath).isFile()) {
                  fs.unlinkSync(fullPath);
                }
              }
              console.log(`[CYPRESS NODE downloads:clear] Cleared ${files.length} file(s) in downloadsFolder`);
            } catch (err) {
              console.error(`[CYPRESS NODE downloads:clear] Failed to clear downloads: ${err.message}`);
            }
          }
          return null;
        },
      });

      return config;
    },
  },
});
