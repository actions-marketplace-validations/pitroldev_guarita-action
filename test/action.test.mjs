import test from 'node:test';
import assert from 'node:assert/strict';
import { GuaritaClient } from '../src/client.mjs';
import { readInputs } from '../src/inputs.mjs';
import { assertCriticalPolicy, runScan } from '../src/scan.mjs';

const id = 'scan_fixture_123';
const target = 'https://app.example.com/';
const env = { 'INPUT_API-KEY': 'gsk_fixture', 'INPUT_TARGET-URL': target };
const done = (summary = {}) => ({ id, status: 'done', summary: { criticalCount: 0, score: 10, ...summary } });
const report = (scan = {}) => ({ scan: { id, status: 'done', modulesRun: 40, ...scan } });
function fixture({ scans = [done()], fullReport = report() } = {}) {
  const calls = [];
  return {
    calls,
    async createScan(...args) { calls.push(['create', ...args]); return { id, status: 'queued' }; },
    async getScan() { calls.push(['poll']); return scans.shift() ?? done(); },
    async getReport() { calls.push(['report']); return fullReport; },
    async cancelScan(scanId) { calls.push(['cancel', scanId]); },
  };
}

test('default run does not consume AI quota and follows queued/running/done to a complete report', async () => {
  const config = readInputs(env);
  assert.equal(config.withAi, false);
  const client = fixture({ scans: [{ id, status: 'queued' }, { id, status: 'running' }, done()] });
  let waits = 0;
  const result = await runScan({ client, ...config, wait: async () => { waits++; } });
  assert.deepEqual(result, { id, criticalCount: 0, riskScore: 10 });
  assert.equal(waits, 2);
  assert.deepEqual(client.calls[0], ['create', target, false]);
  assert.equal(client.calls.filter(c => c[0] === 'create').length, 1);
});

for (const flag of ['blocked', 'incomplete', 'passive']) {
  test('a zero-critical report with ' + flag + ' coverage cannot pass', async () => {
    const client = fixture({ fullReport: report({ [flag]: true }) });
    await assert.rejects(runScan({ client, target, withAi: false }), /could not complete/);
  });
}

test('critical findings fail the default policy while the explicit opt-out still returns the count', async () => {
  const result = await runScan({ client: fixture({ scans: [done({ criticalCount: 2 })] }), target, withAi: false });
  assert.throws(() => assertCriticalPolicy(result, readInputs(env).failOnCritical), /2 critical/);
  assert.doesNotThrow(() => assertCriticalPolicy(result, false));
});

test('a missing critical count or missing full report is a failure, not a clean scan', async () => {
  await assert.rejects(runScan({ client: fixture({ scans: [done({ criticalCount: undefined })] }), target }), /incomplete scan summary/);
  await assert.rejects(runScan({ client: fixture({ fullReport: null }), target }), /complete report/);
});

test('interruption cancels the exact created scan once, without creating another scan', async () => {
  const controller = new AbortController();
  const client = fixture({ scans: [{ id, status: 'running' }] });
  await assert.rejects(runScan({
    client, target, signal: controller.signal,
    wait: async () => { controller.abort(new Error('test interruption')); },
  }), /test interruption/);
  assert.deepEqual(client.calls.filter(c => c[0] === 'cancel'), [['cancel', id]]);
  assert.equal(client.calls.filter(c => c[0] === 'create').length, 1);
});

test('the HTTP adapter uses the published API contract, never URL credentials or implicit AI', async () => {
  const requests = [];
  const client = new GuaritaClient('gsk_fixture', {
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options });
      return new Response(JSON.stringify({ id, status: 'queued' }), { status: 202 });
    },
  });
  await client.createScan(target, false);
  assert.equal(requests[0].url, 'https://api.guarita.dev/v1/public/scans');
  assert.equal(requests[0].headers.Authorization, 'Bearer gsk_fixture');
  assert.equal(requests[0].headers['Content-Type'], 'application/json');
  assert.equal(requests[0].redirect, 'error');
  assert.deepEqual(JSON.parse(requests[0].body), {
    target, ai: false, infra: true, authenticated: false, aggressive: false,
  });
});

test('failed creation is not retried and response bodies cannot leak a credential into errors', async () => {
  let requests = 0;
  const client = new GuaritaClient('gsk_fixture', {
    fetchImpl: async () => {
      requests++;
      return new Response(JSON.stringify({ error: 'internal', message: 'secret: gsk_fixture' }), { status: 503 });
    },
  });
  await assert.rejects(client.createScan(target, false), error =>
    error.message.includes('503') && !error.message.includes('gsk_fixture'));
  assert.equal(requests, 1);
});

test('invalid credentials, timeout, AI value or target credentials fail before a scan can be created', () => {
  for (const overrides of [
    { 'INPUT_API-KEY': '' }, { 'INPUT_TIMEOUT-SECONDS': '0' },
    { 'INPUT_WITH-AI': 'yes' }, { 'INPUT_TARGET-URL': 'https://user:secret@app.example.com' },
  ]) {
    assert.throws(() => readInputs({ ...env, ...overrides }));
  }
});
