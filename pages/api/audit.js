const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_PROXY_DEPTH = 1;

const EXPLORER_CONFIG = {
  ethereum: {
    name: 'Etherscan',
    endpoints: [
      { apiBase: 'https://api.etherscan.io/v2/api', apiKeyEnvs: ['ETHERSCAN_API_KEY'], chainId: '1' },
      { apiBase: 'https://api.etherscan.io/api', apiKeyEnvs: ['ETHERSCAN_API_KEY'] },
    ],
  },
  base: {
    name: 'Basescan',
    endpoints: [
      { apiBase: 'https://api.etherscan.io/v2/api', apiKeyEnvs: ['ETHERSCAN_API_KEY'], chainId: '8453' },
      { apiBase: 'https://api.basescan.org/api', apiKeyEnvs: ['BASESCAN_API_KEY', 'ETHERSCAN_API_KEY'] },
    ],
  },
  polygon: {
    name: 'Polygonscan',
    endpoints: [
      { apiBase: 'https://api.etherscan.io/v2/api', apiKeyEnvs: ['ETHERSCAN_API_KEY'], chainId: '137' },
      { apiBase: 'https://api.polygonscan.com/api', apiKeyEnvs: ['POLYGONSCAN_API_KEY', 'ETHERSCAN_API_KEY'] },
    ],
  },
  kava: {
    name: 'Kavascan',
    endpoints: [
      { apiBase: 'https://api.kavascan.com/api', apiKeyEnvs: ['KAVASCAN_API_KEY'] },
    ],
  },
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildExplorerUrl(endpoint, address, apiKey) {
  const params = new URLSearchParams({
    module: 'contract',
    action: 'getsourcecode',
    address,
  });

  if (apiKey) {
    params.set('apikey', apiKey);
  }

  if (endpoint.chainId) {
    params.set('chainid', endpoint.chainId);
  }

  return `${endpoint.apiBase}?${params.toString()}`;
}

function getErrorDetailString(err) {
  const messages = [
    err?.message,
    err?.cause?.message,
    err?.cause?.code,
    err?.code,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return messages.join(' | ');
}

function formatNetworkErrorMessage(serviceName, err) {
  const details = getErrorDetailString(err);

  if (details.includes('fetch failed') || details.includes('connect tunnel failed')) {
    return `${serviceName} request failed due to outbound network restrictions (proxy/firewall).`;
  }
  if (details.includes('enotfound') || details.includes('eai_again')) {
    return `${serviceName} request failed due to DNS/network resolution issues.`;
  }
  if (details.includes('timed out') || details.includes('abort')) {
    return `${serviceName} request timed out.`;
  }

  return `${serviceName} request failed: ${err?.message || 'Network error'}`;
}

function isNotFoundLikeExplorerResult(detailMsg) {
  return (
    detailMsg.includes('contract source code not verified') ||
    detailMsg.includes('source code not verified') ||
    detailMsg.includes('unable to locate contractcode at') ||
    detailMsg.includes('contract not found')
  );
}

function classifyExplorerApiError(rawMessage, rawResult) {
  const detailMsg = `${rawMessage || ''} ${rawResult || ''}`.toLowerCase();

  if (detailMsg.includes('rate limit')) {
    return {
      code: 'RATE_LIMITED',
      message: 'API rate limit reached. Please try again later.',
    };
  }

  if (
    detailMsg.includes('invalid api key') ||
    detailMsg.includes('invalid apikey') ||
    detailMsg.includes('missing or invalid api key')
  ) {
    return {
      code: 'INVALID_API_KEY',
      message: 'API key is invalid or misconfigured.',
    };
  }

  if (detailMsg.includes('deprecated')) {
    return {
      code: 'EXPLORER_ENDPOINT_DEPRECATED',
      message: 'API endpoint is deprecated or misconfigured.',
    };
  }

  if (isNotFoundLikeExplorerResult(detailMsg)) {
    return { code: 'NOT_FOUND' };
  }

  return {
    code: 'EXPLORER_API_ERROR',
    message: rawMessage || rawResult || 'Unknown error',
  };
}

async function getContractSource(address, network = 'ethereum', depth = 0) {
  const explorer = EXPLORER_CONFIG[network] || EXPLORER_CONFIG.ethereum;
  let json = null;
  let lastNetworkError = null;
  let lastApiError = null;

  for (const endpoint of explorer.endpoints) {
    const configuredKeys = endpoint.apiKeyEnvs
      .map((envName) => process.env[envName])
      .filter((value) => typeof value === 'string' && value.trim().length > 0);
    // If keys are configured, do not force a no-key retry because that can
    // produce misleading "invalid/missing api key" errors after a valid keyed request.
    const apiKeysToTry = configuredKeys.length > 0 ? [...new Set(configuredKeys)] : [''];

    for (const apiKey of apiKeysToTry) {
      const url = buildExplorerUrl(endpoint, address, apiKey);
      let response;
      try {
        response = await fetchWithTimeout(url, {}, 10000);
      } catch (err) {
        lastNetworkError = err;
        continue;
      }

      if (!response.ok) {
        lastApiError = new Error(`${explorer.name} returned HTTP ${response.status}`);
        continue;
      }

      try {
        json = await response.json();
      } catch {
        lastApiError = new Error(`${explorer.name} returned an invalid JSON response`);
        continue;
      }

      if (json.status !== '1') {
        const rawResult = typeof json.result === 'string' ? json.result : '';
        const rawMessage = typeof json.message === 'string' ? json.message : '';
        const classified = classifyExplorerApiError(rawMessage, rawResult);

        if (classified.code === 'RATE_LIMITED') {
          const err = new Error(`${explorer.name} ${classified.message}`);
          err.code = classified.code;
          throw err;
        }

        if (classified.code === 'NOT_FOUND') {
          return null;
        }

        lastApiError = new Error(`${explorer.name} ${classified.message}`);
        lastApiError.code = classified.code;

        // Endpoint-specific issue; try any remaining fallback endpoints.
        if (classified.code === 'EXPLORER_ENDPOINT_DEPRECATED') {
          break;
        }
        continue;
      }

      break;
    }

    if (json) {
      break;
    }
  }

  if (!json) {
    if (lastApiError) {
      throw lastApiError;
    }
    if (lastNetworkError) {
      const err = new Error(formatNetworkErrorMessage(explorer.name, lastNetworkError));
      err.code = 'NETWORK_ERROR';
      throw err;
    }
    throw new Error(`${explorer.name} request failed`);
  }

  if (!Array.isArray(json.result) || json.result.length === 0) {
    return null;
  }

  const { SourceCode, ContractName, Implementation } = json.result[0];

  // If this is a proxy contract with a known implementation address, resolve to the
  // implementation's source code (one level deep) so the audit covers the actual logic
  // rather than minimal proxy boilerplate. This also fixes the "not found" error for
  // EIP-1167 clone proxies whose own SourceCode field is empty.
  if (depth < MAX_PROXY_DEPTH && Implementation && ETH_ADDRESS_RE.test(Implementation)) {
    const implData = await getContractSource(Implementation, network, depth + 1);
    if (implData) {
      return implData;
    }
  }

  if (!SourceCode || !SourceCode.trim()) {
    return null;
  }

  return { sourceCode: SourceCode, contractName: ContractName || 'Unknown' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const address = req.body && typeof req.body.message === 'string' ? req.body.message.trim() : '';

  if (!address) {
    return res.status(400).json({ error: 'Missing contract address in request body' });
  }
  const networkRaw = req.body && req.body.network;
  const VALID_NETWORKS = ['ethereum', 'base', 'polygon', 'kava'];
  const network = VALID_NETWORKS.includes(networkRaw) ? networkRaw : 'ethereum';

  if (!ETH_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum contract address' });
  }

  try {
    // Step 1: Fetch contract source code from Etherscan
    const contractData = await getContractSource(address, network);

    if (!contractData) {
      const explorer = EXPLORER_CONFIG[network] || EXPLORER_CONFIG.ethereum;
      return res.status(404).json({ error: `Contract source code not found on ${explorer.name}. The contract may be unverified or not exist.` });
    }

    const { sourceCode, contractName } = contractData;

    // Sanitize Etherscan metadata to prevent prompt injection
    const safeName = contractName.replace(/[^\w\s.-]/g, '').slice(0, 100);
    const safeAddress = address; // already validated as /^0x[a-fA-F0-9]{40}$/

    // Step 2: Send source code to 0x0.ai for audit
    const prompt = `Perform a comprehensive smart contract security audit for the following ${network || 'Ethereum'} smart contract.\n\nContract Name: ${safeName}\nContract Address: ${safeAddress}\n\nSource Code:\n${sourceCode}\n\nPlease identify all vulnerabilities, security flaws, gas inefficiencies, and best-practice violations. Provide a detailed audit report.`;

    let upstream;
    try {
      upstream = await fetchWithTimeout(
        'https://api.0x0.ai/message',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: prompt }),
        },
        30000
      );
    } catch (err) {
      const networkErr = new Error(formatNetworkErrorMessage('Audit service', err));
      networkErr.code = 'NETWORK_ERROR';
      throw networkErr;
    }

    let data;
    try {
      data = await upstream.json();
    } catch {
      return res.status(upstream.status).json({ error: `Audit service returned HTTP ${upstream.status}` });
    }

    return res.status(upstream.status).json(data);
  } catch (e) {
    console.error('Audit request failed');
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Audit service timed out. Please try again.' });
    }
    if (e.code === 'RATE_LIMITED') {
      return res.status(429).json({ error: e.message });
    }
    if (e.code === 'EXPLORER_ENDPOINT_DEPRECATED') {
      return res.status(502).json({ error: `${e.message} Please contact support.` });
    }
    if (e.code === 'EXPLORER_API_ERROR') {
      return res.status(502).json({ error: e.message });
    }
    if (e.code === 'INVALID_API_KEY' || (typeof e.message === 'string' && e.message.includes('Missing required API key:'))) {
      return res.status(500).json({ error: 'Server configuration error: the block explorer API key is missing or invalid.' });
    }
    if (e.code === 'NETWORK_ERROR') {
      return res.status(503).json({ error: e.message });
    }
    return res.status(502).json({ error: e.message || 'Failed to process audit request' });
  }
}
