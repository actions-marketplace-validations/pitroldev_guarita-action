export function readInputs(env) {
  const read = (name, fallback = '') => (env['INPUT_' + name.toUpperCase()] ?? fallback).trim();
  const boolean = (name, fallback) => {
    const value = read(name, fallback);
    if (value !== 'true' && value !== 'false') throw new Error(name + ' must be true or false.');
    return value === 'true';
  };
  const apiKey = read('api-key');
  if (!/^gsk_[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('A valid Guarita API key is required.');
  let target;
  try { target = new URL(read('target-url')); }
  catch { throw new Error('target-url must be a public HTTPS URL verified in Guarita.'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.hash) {
    throw new Error('target-url must use HTTPS without embedded credentials or a fragment.');
  }
  const rawTimeout = read('timeout-seconds', '2100');
  if (!/^\d+$/.test(rawTimeout) || Number(rawTimeout) < 60 || Number(rawTimeout) > 3600) {
    throw new Error('timeout-seconds must be an integer from 60 to 3600.');
  }
  return {
    apiKey, target: target.href, timeoutSeconds: Number(rawTimeout),
    withAi: boolean('with-ai', 'false'),
    failOnCritical: boolean('fail-on-critical', 'true'),
  };
}
