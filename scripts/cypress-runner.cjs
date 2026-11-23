#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Prevent Electron from running as pure Node when launched inside Electron-based terminals/IDEs
delete process.env.ELECTRON_RUN_AS_NODE;

const isWindows = process.platform === 'win32';
const cypressBin = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  isWindows ? 'cypress.cmd' : 'cypress'
);

const args = process.argv.slice(2);

const child = spawn(cypressBin, args, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
