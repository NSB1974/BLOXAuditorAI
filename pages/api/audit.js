const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_PROXY_DEPTH = 1;
const DEFAULT_TIMEOUT_MS = 15000;

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

const NETWORK_CHAIN_IDS = {
  ethereum: '1',
  base: '8453',
  polygon: '137',
  kava: '2222',
};

const BLOCKSCOUT_V2_BASE = {
  ethereum: 'https://eth.blockscout.com/api/v2',
  base: 'https://base.blockscout.com/api/v2',
  polygon: 'https://polygon.blockscout.com/api/v2',
};

async function fetchSourceFromSourcify(address, network) {
  const chainId = NETWORK_CHAIN_IDS[network];
  if (!chainId) return null;

  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=all`;
  const response = await fetchWithTimeout(url, {}, 12000, 2);
  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const fileEntries = Array.isArray(json?.files) ? json.files : [];
  if (fileEntries.length === 0) {
    return null;
  }

  const sources = fileEntries
    .filter((file) => file?.name && file?.content && file.name.endsWith('.sol'))
    .map((file) => `// File: ${file.name}\n${file.content}`);

  if (sources.length === 0) {
    return null;
  }

  return {
    sourceCode: sources.join('\n\n'),
    contractName: json?.name || 'Unknown',
  };
}

async function fetchSourceFromBlockscout(address, network) {
  const apiBase = BLOCKSCOUT_V2_BASE[network];
  if (!apiBase) return null;

  const url = `${apiBase}/smart-contracts/${address}`;
  const response = await fetchWithTimeout(url, {}, 12000, 2);
  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const sourceCode = typeof json?.source_code === 'string' ? json.source_code : '';
  if (!sourceCode.trim()) {
    return null;
  }

  return {
    sourceCode,
    contractName: json?.name || 'Unknown',
  };
}

async function getSourceWithFallbacks(address, network, depth = 0) {
  try {
    const explorerData = await getContractSource(address, network, depth);
    if (explorerData) {
      return explorerData;
    }
  } catch (err) {
    // Continue into public-source fallbacks for read-only source retrieval.
    if (!['CHAIN_PLAN_RESTRICTED', 'INVALID_API_KEY'].includes(err?.code)) {
      throw err;
    }
  }

  try {
    const sourcifyData = await fetchSourceFromSourcify(address, network);
    if (sourcifyData) {
      return sourcifyData;
    }
  } catch {
    // Continue to Blockscout fallback.
  }

  try {
    const blockscoutData = await fetchSourceFromBlockscout(address, network);
    if (blockscoutData) {
      return blockscoutData;
    }
  } catch {
    // Ignore fallback failures and return null.
  }

  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, attempts = 2) {
  const normalizedAttempts = Math.max(1, Math.trunc(attempts) || 1);
  let lastError = null;

  for (let i = 0; i < normalizedAttempts; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      lastError = err;
      if (i < normalizedAttempts - 1) {
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Network request failed');
}


function getExplorerErrorDetail(json) {
  const rawResult = typeof json?.result === 'string' ? json.result : '';
  const rawMessage = typeof json?.message === 'string' ? json.message : '';
  return `${rawMessage} ${rawResult}`.toLowerCase();
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

async function getContractSource(address, network = 'ethereum', depth = 0) {
  const explorer = EXPLORER_CONFIG[network] || EXPLORER_CONFIG.ethereum;
  let json = null;
  let lastNetworkError = null;
  let lastApiError = null;

  for (const endpoint of explorer.endpoints) {
    const configuredKeys = endpoint.apiKeyEnvs
      .map((envName) => process.env[envName])
      .filter((value) => typeof value === 'string' && value.trim().length > 0);
    const apiKeysToTry = [...new Set([...configuredKeys, ''])];

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
        // Distinguish API-level errors (rate limit, bad key, deprecated endpoint, …) from "contract not found"
        const detailMsg = getExplorerErrorDetail(json);

        if (detailMsg.includes('rate limit')) {
          const err = new Error(`${explorer.name} API rate limit reached. Please try again later.`);
          err.code = 'RATE_LIMITED';
          throw err;
        }

        if (
          detailMsg.includes('invalid api key') ||
          detailMsg.includes('invalid apikey') ||
          detailMsg.includes('missing or invalid api key')
        ) {
          // Retry the same endpoint with any other configured key, then fall back to the next endpoint.
          lastApiError = new Error(`${explorer.name} API key is invalid or misconfigured.`);
          lastApiError.code = 'INVALID_API_KEY';
          continue;
        }

        if (
          detailMsg.includes('not supported for this chain') ||
          detailMsg.includes('not available on free tier') ||
          detailMsg.includes('please upgrade your api plan')
        ) {
          const isEtherscanV2Endpoint = endpoint.apiBase === 'https://api.etherscan.io/v2/api';
          const planRestrictionMessage = isEtherscanV2Endpoint
            ? `Access to the Etherscan v2 multi-chain API${endpoint.chainId ? ` for chain ${endpoint.chainId}` : ''} requires a paid API plan.`
            : `${explorer.name} API access via ${endpoint.apiBase} requires a paid API plan.`;
          const err = new Error(planRestrictionMessage);
          err.code = 'CHAIN_PLAN_RESTRICTED';
          throw err;
        }

        if (detailMsg.includes('deprecated') || detailMsg.includes('v2')) {
          // Endpoint-specific issue; try any remaining fallback endpoints.
          lastApiError = new Error(`${explorer.name} API endpoint is deprecated or misconfigured.`);
          lastApiError.code = 'EXPLORER_ENDPOINT_DEPRECATED';
          break;
        }

        // Treat non-fatal statuses as "not found" and stop trying alternate endpoints.
        return null;
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
      const reason = lastNetworkError?.cause?.code || lastNetworkError?.message || 'Network error';
      throw new Error(`${explorer.name} request failed: ${reason}`);
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
    const contractData = await getSourceWithFallbacks(address, network);

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

    const upstream = await fetchWithTimeout(
      'https://api.0x0.ai/message',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: prompt }),
      },
      30000,
      2
    );

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
    if (e.code === 'CHAIN_PLAN_RESTRICTED') {
      return res.status(403).json({ error: `${e.message} The selected network may require a paid or upgraded block explorer API plan for this request.` });
    }
    if (e.code === 'INVALID_API_KEY' || (typeof e.message === 'string' && e.message.includes('Missing required API key:'))) {
      return res.status(500).json({ error: 'Server configuration error: the block explorer API key is missing or invalid.' });
    }
    return res.status(502).json({ error: e.message || 'Failed to process audit request' });
  }
}
