import { appendFile } from 'node:fs/promises';
import { GuaritaClient } from './src/client.mjs';
import { readInputs } from './src/inputs.mjs';
import { assertCriticalPolicy, runScan } from './src/scan.mjs';

const escapeCommand = (value) => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const shutdown = new AbortController();
const abort = () => shutdown.abort(new Error('The GitHub job was interrupted.'));
process.once('SIGINT', abort);
process.once('SIGTERM', abort);

async function output(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, name + '=' + value + '\n');
  }
}

try {
  const suppliedKey = process.env['INPUT_API-KEY'];
  if (suppliedKey) console.log('::add-mask::' + escapeCommand(suppliedKey));
  const config = readInputs(process.env);
  const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(config.timeoutSeconds * 1000)]);
  const client = new GuaritaClient(config.apiKey, { signal });
  const result = await runScan({
    client, signal, target: config.target, withAi: config.withAi,
    onCreated: async (id) => {
      await output('scan-id', id);
      await output('report-url', 'https://www.guarita.dev/scans/' + id);
      console.log('Guarita scan started: ' + id);
    },
  });
  await output('critical-count', result.criticalCount);
  await output('risk-score', result.riskScore);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      '### Guarita Security Scan\n\n'
      + '[Open the report](https://www.guarita.dev/scans/' + result.id + ')\n\n'
      + 'Critical findings: **' + result.criticalCount + '** · Risk score: **' + result.riskScore + '/100**\n\n'
      + 'This result applies to the tested scope at scan time.\n');
  }
  assertCriticalPolicy(result, config.failOnCritical);
  console.log('Guarita scan completed.');
} catch (error) {
  console.log('::error::' + escapeCommand(error instanceof Error ? error.message : 'Guarita scan failed.'));
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', abort);
  process.removeListener('SIGTERM', abort);
}
