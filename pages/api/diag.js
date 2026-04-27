const DEFAULT_TIMEOUT_MS = 8000;

const DIAG_TARGETS = [
  { name: 'etherscan-v2', url: 'https://api.etherscan.io/v2/api?module=stats&action=ethprice' },
  { name: 'basescan-v1', url: 'https://api.basescan.org/api?module=stats&action=ethprice' },
  { name: 'sourcify', url: 'https://sourcify.dev/server/health' },
  { name: 'audit-upstream', url: 'https://api.0x0.ai/message' },
];

function maskBoolean(value) {
  return value ? 'configured' : 'missing';
}

async function fetchHeadOrGet(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: 'GET', signal: controller.signal });
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function checkTarget(target) {
  const startedAt = Date.now();
  try {
    const response = await fetchHeadOrGet(target.url);
    return {
      name: target.name,
      url: target.url,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name: target.name,
      url: target.url,
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: error?.cause?.code || error?.name || 'UNKNOWN_ERROR',
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const keyStatus = {
    etherscanApiKey: maskBoolean(!!process.env.ETHERSCAN_API_KEY),
    basescanApiKey: maskBoolean(!!process.env.BASESCAN_API_KEY),
    polygonscanApiKey: maskBoolean(!!process.env.POLYGONSCAN_API_KEY),
    kavascanApiKey: maskBoolean(!!process.env.KAVASCAN_API_KEY),
  };

  const checks = await Promise.all(DIAG_TARGETS.map(checkTarget));
  const reachableCount = checks.filter((item) => item.ok).length;

  return res.status(200).json({
    status: reachableCount > 0 ? 'partial_or_better' : 'downstream_unreachable',
    timestamp: new Date().toISOString(),
    runtime: {
      node: process.version,
      uptimeSeconds: process.uptime(),
    },
    keys: keyStatus,
    checks,
  });
}
