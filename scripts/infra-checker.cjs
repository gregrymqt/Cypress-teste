#!/usr/bin/env node
/**
 * scripts/infra-checker.cjs
 * Universal Infrastructure & Services Health Checker (White-Box Mode)
 * Detects Docker services, database connections (Postgres/MySQL/SQL Server), Redis and port availability.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');

// Parse arguments
const args = process.argv.slice(2);
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

const targetRepo = getArg('repo', '');
const isStrictCli = args.includes('--strict') || getArg('strict') === 'true';

// Known service to port mapping for strict validation
const SERVICE_PORT_MAP = {
  'Redis': [6379],
  'PostgreSQL': [5432],
  'MySQL': [3306],
  'SQL Server': [1433],
  'RabbitMQ': [5672, 15672]
};

// Port scanner utility
function checkPort(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = 'closed';

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      status = 'open';
      socket.destroy();
    });
    socket.once('timeout', () => {
      socket.destroy();
    });
    socket.once('error', () => {
      socket.destroy();
    });
    socket.once('close', () => {
      resolve({ port, status });
    });

    socket.connect(port, host);
  });
}

async function runInfraCheck(options = {}) {
  const repo = options.repo || targetRepo;
  const strict = typeof options.strict === 'boolean' ? options.strict : isStrictCli;

  console.log('='.repeat(60));
  console.log(`  UNIVERSAL INFRASTRUCTURE & SERVICES HEALTH CHECK ${strict ? '[STRICT MODE]' : ''}`);
  console.log('='.repeat(60));

  const results = {
    repoPath: repo || 'N/A (Black-Box URL mode)',
    dockerComposeDetected: false,
    services: [],
    portsChecked: [],
    offlineRequiredServices: [],
    strict: strict,
    strictFailed: false,
    timestamp: new Date().toISOString()
  };

  if (repo) {
    const absPath = path.resolve(repo);
    if (!fs.existsSync(absPath)) {
      console.log(`[WARN] Target repository path not found: ${absPath}`);
    } else {
      console.log(`[INFO] Inspecting repository: ${absPath}`);

      // Check for docker-compose files
      const composeCandidates = ['docker-compose.yml', 'docker-compose.yaml', 'docker-compose.prod.yml'];
      for (const candidate of composeCandidates) {
        const fullCandidate = path.join(absPath, candidate);
        if (fs.existsSync(fullCandidate)) {
          results.dockerComposeDetected = true;
          const content = fs.readFileSync(fullCandidate, 'utf-8');
          console.log(`[FOUND] Docker Compose file: ${candidate}`);

          if (/redis/i.test(content)) results.services.push('Redis');
          if (/postgres/i.test(content)) results.services.push('PostgreSQL');
          if (/mysql/i.test(content)) results.services.push('MySQL');
          if (/sqlserver|mssql/i.test(content)) results.services.push('SQL Server');
          if (/rabbitmq/i.test(content)) results.services.push('RabbitMQ');
        }
      }
    }
  }

  // Common service ports to probe on localhost
  const portsToProbe = [
    { port: 80, name: 'HTTP Web Server' },
    { port: 443, name: 'HTTPS Web Server' },
    { port: 3000, name: 'Frontend Dev Server (Node/React/Next)' },
    { port: 5000, name: 'Backend API / ASP.NET / Flask' },
    { port: 5173, name: 'Vite Dev Server' },
    { port: 5432, name: 'PostgreSQL Database' },
    { port: 3306, name: 'MySQL Database' },
    { port: 1433, name: 'SQL Server Database' },
    { port: 6379, name: 'Redis Cache' },
    { port: 5672, name: 'RabbitMQ AMQP Broker' },
    { port: 15672, name: 'RabbitMQ Management Dashboard' },
    { port: 8080, name: 'Application Gateway / API' }
  ];

  console.log('\n[PROBING] Local Service Ports:');
  for (const item of portsToProbe) {
    const res = await checkPort('127.0.0.1', item.port);
    const isOpen = res.status === 'open';
    const tag = isOpen ? '[ONLINE]' : '[OFFLINE]';
    if (isOpen) {
      console.log(`  ${tag.padEnd(10)} Port ${String(item.port).padEnd(6)} -> ${item.name}`);
    }
    results.portsChecked.push({ port: item.port, name: item.name, status: res.status });
  }

  const onlineServices = results.portsChecked.filter((p) => p.status === 'open');
  console.log(`\n[SUMMARY] Detected ${onlineServices.length} active service port(s) on localhost.`);

  const uniqueDeclaredServices = [...new Set(results.services)];
  if (uniqueDeclaredServices.length > 0) {
    console.log(`[DETECTED FROM REPO] Services declared: ${uniqueDeclaredServices.join(', ')}`);

    for (const serviceName of uniqueDeclaredServices) {
      const ports = SERVICE_PORT_MAP[serviceName] || [];
      if (ports.length > 0) {
        const isOnline = ports.some((port) =>
          results.portsChecked.some((p) => p.port === port && p.status === 'open')
        );
        if (!isOnline) {
          results.offlineRequiredServices.push(serviceName);
        }
      }
    }
  }

  if (results.offlineRequiredServices.length > 0) {
    console.log(`[WARNING] Offline declared service(s): ${results.offlineRequiredServices.join(', ')}`);
    if (strict && repo && results.dockerComposeDetected) {
      console.error(`\n[STRICT FAILURE] Required service(s) offline: ${results.offlineRequiredServices.join(', ')}`);
      results.strictFailed = true;
    }
  }

  console.log('='.repeat(60));

  return results;
}

if (require.main === module) {
  runInfraCheck().then((results) => {
    if (results.strict && results.strictFailed) {
      process.exit(1);
    }
    process.exit(0);
  });
}

module.exports = { runInfraCheck, checkPort, SERVICE_PORT_MAP };
