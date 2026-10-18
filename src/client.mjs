const BASE = 'https://api.guarita.dev/v1/public';

export class GuaritaClient {
  constructor(apiKey, { fetchImpl = fetch, signal } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.signal = signal;
  }

  async request(method, path, body, { cleanup = false, expected = 200 } = {}) {
    const requestTimeout = AbortSignal.timeout(cleanup ? 5000 : 30000);
    const signal = !cleanup && this.signal
      ? AbortSignal.any([this.signal, requestTimeout]) : requestTimeout;
    let response;
    let data;
    try {
      response = await this.fetch(BASE + path, {
        method,
        redirect: 'error',
        headers: {
          Authorization: 'Bearer ' + this.apiKey,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
      data = await response.json();
    } catch {
      if (this.signal?.aborted && !cleanup) this.signal.throwIfAborted();
      throw new Error('Guarita request failed or returned an invalid response.');
    }
    if (response.status !== expected) {
      const code = typeof data?.error === 'string' && /^[a-z_]{1,64}$/.test(data.error)
        ? '; ' + data.error : '';
      throw new Error('Guarita API rejected the request (HTTP ' + response.status + code + ').');
    }
    return data;
  }

  createScan(target, withAi) {
    // Creation is never retried: the public API does not promise POST idempotency.
    return this.request('POST', '/scans', {
      target, ai: withAi, infra: true, authenticated: false, aggressive: false,
    }, { expected: 202 });
  }
  getScan(id) { return this.request('GET', '/scans/' + encodeURIComponent(id)); }
  getReport(id) { return this.request('GET', '/scans/' + encodeURIComponent(id) + '/report'); }
  cancelScan(id) {
    return this.request('POST', '/scans/' + encodeURIComponent(id) + '/cancel', undefined, { cleanup: true });
  }
}
