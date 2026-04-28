const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_PROXY_DEPTH = 1;
const BASE_CHAIN_ID = 8453;
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Addresses excluded from auditing (e.g. well-known test tokens)
const BLOCKED_ADDRESSES = new Set([
  '0x514910771AF9Ca656af840dff83E8264EcF986CA',
]);
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

function formatNetworkErrorMessage(explorerName, err) {
  const details = String(err?.message || '').toLowerCase();

  if (details.includes('fetch failed') || details.includes('connect tunnel failed')) {
    return `${explorerName} request failed due to outbound network restrictions (proxy/firewall).`;
  }
  if (details.includes('enotfound') || details.includes('eai_again')) {
    return `${explorerName} request failed due to DNS/network resolution issues.`;
  }
  if (details.includes('timed out') || details.includes('abort')) {
    return `${explorerName} request timed out.`;
  }

  return `${explorerName} request failed: ${err?.message || 'Network error'}`;
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
      const err = new Error(`${explorer.name} request failed: ${reason}`);
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

function paymentError(res, status, code, message, details = {}) {
  return res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

async function verifyBasePayment(paymentReceipt) {
  const tokenAddress = process.env.BLOXOLOGY_TOKEN_ADDRESS;
  const treasuryAddress = process.env.AUDIT_TREASURY_ADDRESS;
  const baseRpcUrl = process.env.BASE_RPC_URL;
  const requiredAmountRaw = process.env.AUDIT_REQUIRED_TOKEN_AMOUNT;

  if (!tokenAddress || !treasuryAddress || !baseRpcUrl || !requiredAmountRaw) {
    const err = new Error('Base payment verification is not configured on the server.');
    err.code = 'PAYMENT_CONFIG_MISSING';
    throw err;
  }

  if (!paymentReceipt || typeof paymentReceipt !== 'object') {
    return { ok: false, status: 402, code: 'PAYMENT_REQUIRED', message: 'Payment receipt is required for Base audits.' };
  }

  const { txHash, payer, amount, token, network } = paymentReceipt;
  if (!txHash || !payer || !amount || !token || network !== 'base') {
    return { ok: false, status: 402, code: 'PAYMENT_RECEIPT_INVALID', message: 'Payment receipt is missing required fields.' };
  }

  let rpcId = 1;
  const rpcCall = async (method, params = []) => {
    const response = await fetch(baseRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: rpcId++,
        method,
        params,
      }),
    });
    const json = await response.json();
    if (json?.error) {
      throw new Error(`Base RPC error (${method}): ${json.error.message || 'Unknown error'}`);
    }
    return json?.result;
  };

  const [tx, receipt, chainIdHex] = await Promise.all([
    rpcCall('eth_getTransactionByHash', [txHash]),
    rpcCall('eth_getTransactionReceipt', [txHash]),
    rpcCall('eth_chainId', []),
  ]);

  if (!tx || !receipt || receipt.status !== '0x1') {
    return { ok: false, status: 402, code: 'PAYMENT_NOT_CONFIRMED', message: 'Payment transaction is missing or not confirmed.' };
  }

  const chainId = Number.parseInt(chainIdHex, 16);
  if (chainId !== BASE_CHAIN_ID) {
    return { ok: false, status: 403, code: 'PAYMENT_NETWORK_INVALID', message: 'Server is not connected to Base mainnet.' };
  }

  if (tx.to?.toLowerCase() !== tokenAddress.toLowerCase()) {
    return { ok: false, status: 402, code: 'PAYMENT_TOKEN_MISMATCH', message: 'Payment transaction was not sent to the configured token contract.' };
  }

  const requiredAmount = BigInt(requiredAmountRaw);
  const clientAmount = BigInt(amount);
  if (clientAmount < requiredAmount) {
    return { ok: false, status: 402, code: 'PAYMENT_AMOUNT_TOO_LOW', message: 'Client-reported amount is below the required threshold.' };
  }

  const normalizedToken = String(token).toLowerCase();
  if (normalizedToken !== tokenAddress.toLowerCase()) {
    return { ok: false, status: 402, code: 'PAYMENT_TOKEN_INVALID', message: 'Client-reported token does not match configured payment token.' };
  }

  const payerLower = String(payer).toLowerCase();
  const treasuryLower = treasuryAddress.toLowerCase();
  const tokenLower = tokenAddress.toLowerCase();

  const matchingTransfer = (receipt.logs || []).find((log) => {
    if (String(log.address).toLowerCase() !== tokenLower) return false;
    if (!Array.isArray(log.topics) || log.topics.length < 3) return false;
    if (String(log.topics[0]).toLowerCase() !== TRANSFER_EVENT_TOPIC) return false;

    const from = `0x${String(log.topics[1]).slice(26)}`.toLowerCase();
    const to = `0x${String(log.topics[2]).slice(26)}`.toLowerCase();
    const value = BigInt(log.data || '0x0');
    return from === payerLower && to === treasuryLower && value >= requiredAmount;
  });

  if (!matchingTransfer) {
    return { ok: false, status: 402, code: 'PAYMENT_TRANSFER_NOT_FOUND', message: 'No matching ERC-20 transfer to treasury was found for the required amount.' };
  }

  return { ok: true };
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

  if (BLOCKED_ADDRESSES.has(address)) {
    return res.status(403).json({ error: 'This contract address is not available for auditing.' });
  }

  try {
    if (network === 'base') {
      const verification = await verifyBasePayment(req.body?.paymentReceipt);
      if (!verification.ok) {
        return paymentError(res, verification.status, verification.code, verification.message);
      }
    }

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

    // Step 2: Send source code to AI service for audit
    const xaiApiKey = process.env.CONSOLEXAI_API_KEY;
    if (!xaiApiKey) {
      return res.status(500).json({ error: 'Server configuration error: CONSOLEXAI_API_KEY is not set.' });
    }

    const prompt = `Perform a comprehensive smart contract security audit for the following ${network || 'Ethereum'} smart contract.\n\nContract Name: ${safeName}\nContract Address: ${safeAddress}\n\nSource Code:\n${sourceCode}\n\nPlease identify all vulnerabilities, security flaws, gas inefficiencies, and best-practice violations. Provide a detailed audit report.`;

    let upstream;
    try {
      upstream = await fetchWithTimeout(
        'https://api.0x0.ai/message',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${xaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: prompt,
          }),
        },
        55000,
        1
      );
    } catch (fetchErr) {
      const err = new Error('The AI audit service is currently unreachable. Please try again later.');
      err.code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }

    let xaiData;
    try {
      xaiData = await upstream.json();
    } catch {
      return res.status(upstream.status).json({ error: `Audit service returned HTTP ${upstream.status}` });
    }

    if (!upstream.ok) {
      const detail = xaiData?.error?.message || xaiData?.error || `HTTP ${upstream.status}`;
      if (upstream.status === 401 || upstream.status === 403) {
        return res.status(500).json({ error: 'Server configuration error: the AI API key is invalid or unauthorised.' });
      }
      return res.status(upstream.status).json({ error: `Audit service error: ${detail}` });
    }

    const auditText = xaiData?.message || xaiData?.choices?.[0]?.message?.content;
    if (!auditText) {
      return res.status(502).json({ error: 'Audit service returned an unexpected response format.' });
    }

    return res.status(200).json({ message: auditText });
  } catch (e) {
    console.error('Audit request failed:', e.message);
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Audit service timed out. The AI service may be experiencing high load. Please try again in a few moments.' });
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
    if (e.code === 'NETWORK_ERROR') {
      return res.status(503).json({ error: e.message });
    }
    if (e.code === 'UPSTREAM_UNREACHABLE') {
      return res.status(503).json({ error: e.message });
    }
    if (e.code === 'PAYMENT_CONFIG_MISSING') {
      return paymentError(res, 500, e.code, e.message);
    }
    const msg = typeof e.message === 'string' ? e.message : '';
    if (msg.toLowerCase().includes('fetch failed') || msg.toLowerCase().includes('enotfound') || msg.toLowerCase().includes('connect')) {
      return res.status(503).json({ error: 'Could not reach the AI service. Please try again in a moment.' });
    }
    return res.status(502).json({ error: msg || 'Failed to process audit request' });
  }
}
