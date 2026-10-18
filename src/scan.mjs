import { setTimeout as delay } from 'node:timers/promises';

export function assertCriticalPolicy(result, failOnCritical) {
  if (failOnCritical && result.criticalCount > 0) {
    throw new Error('Guarita found ' + result.criticalCount + ' critical finding(s). Review the report.');
  }
}

// The workflow depends on a client port. HTTP, credentials and API payloads stay in client.mjs.
export async function runScan({
  client, target, withAi, signal, onCreated = async () => {},
  wait = () => delay(10000, undefined, { signal }),
}) {
  let id;
  let terminal = false;
  try {
    signal?.throwIfAborted();
    const created = await client.createScan(target, withAi);
    if (typeof created?.id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(created.id)) {
      throw new Error('Guarita did not return a valid scan identifier.');
    }
    id = created.id;
    await onCreated(id);
    for (;;) {
      signal?.throwIfAborted();
      const scan = await client.getScan(id);
      if (scan?.id !== id) throw new Error('Guarita returned a mismatched scan.');
      if (scan.status === 'failed' || scan.status === 'canceled') {
        terminal = true;
        throw new Error('Guarita scan finished as ' + scan.status + '.');
      }
      if (scan.status === 'done') {
        terminal = true;
        const summary = scan.summary;
        if (!summary || !Number.isSafeInteger(summary.criticalCount) || summary.criticalCount < 0
          || !Number.isFinite(summary.score) || summary.score < 0 || summary.score > 100) {
          throw new Error('Guarita returned an incomplete scan summary.');
        }
        // The summary omits partial-coverage flags, so inspect the complete report as well.
        const report = await client.getReport(id);
        if (report?.scan?.id !== id || report.scan.status !== 'done'
          || !Number.isSafeInteger(report.scan.modulesRun) || report.scan.modulesRun < 1) {
          throw new Error('Guarita did not return a complete report for this scan.');
        }
        if (summary.blocked || report.scan.blocked || report.scan.incomplete || report.scan.passive) {
          throw new Error('Guarita could not complete the authorized assessment. Review coverage in the report.');
        }
        return { id, criticalCount: summary.criticalCount, riskScore: summary.score };
      }
      if (!['queued', 'running', 'analyzing'].includes(scan.status)) {
        throw new Error('Guarita returned an unknown scan status.');
      }
      await wait();
    }
  } catch (error) {
    if (id && !terminal) {
      try { await client.cancelScan(id); } catch { /* Keep the original failure; cancellation is best effort. */ }
    }
    throw error;
  }
}
