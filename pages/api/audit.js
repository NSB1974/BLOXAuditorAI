const EXPLORER_CONFIG = {
  ethereum: {
    name: 'Etherscan',
    apiBase: 'https://api.etherscan.io/api',
    apiKeyEnv: 'ETHERSCAN_API_KEY',
  },
  base: {
    name: 'Basescan',
    apiBase: 'https://api.basescan.org/api',
    apiKeyEnv: 'BASESCAN_API_KEY',
  },
  polygon: {
    name: 'Polygonscan',
    apiBase: 'https://api.polygonscan.com/api',
    apiKeyEnv: 'POLYGONSCAN_API_KEY',
  },
  kava: {
    name: 'Kavascan',
    apiBase: 'https://api.kavascan.com/api',
    apiKeyEnv: 'KAVASCAN_API_KEY',
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

async function getContractSource(address, network = 'ethereum') {
  const explorer = EXPLORER_CONFIG[network] || EXPLORER_CONFIG.ethereum;
  const apiKey = process.env[explorer.apiKeyEnv];

  if (!apiKey) {
    throw new Error(`Missing required API key: ${explorer.apiKeyEnv}`);
  }

  const url = `${explorer.apiBase}?module=contract&action=getsourcecode&address=${encodeURIComponent(address)}&apikey=${apiKey}`;
  const response = await fetchWithTimeout(url, {}, 10000);

  if (!response.ok) {
    throw new Error(`${explorer.name} returned HTTP ${response.status}`);
  }

  const json = await response.json();

  if (json.status !== '1') {
    // Distinguish API-level errors (rate limit, bad key, …) from "contract not found"
    if (typeof json.result === 'string') {
      const resultMsg = json.result.toLowerCase();
      if (resultMsg.includes('rate limit')) {
        const err = new Error(`${explorer.name} API rate limit reached. Please try again later.`);
        err.code = 'RATE_LIMITED';
        throw err;
      }
      if (resultMsg.includes('invalid api key') || resultMsg.includes('invalid apikey')) {
        const err = new Error(`${explorer.name} API key is invalid or misconfigured.`);
        err.code = 'INVALID_API_KEY';
        throw err;
      }
    }
    return null;
  }

  if (!Array.isArray(json.result) || json.result.length === 0) {
    return null;
  }

  const { SourceCode, ContractName } = json.result[0];

  if (!SourceCode) {
    return null;
  }

  return { sourceCode: SourceCode, contractName: ContractName || 'Unknown' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const address = req.body && req.body.message;

  if (!address) {
    return res.status(400).json({ error: 'Missing contract address in request body' });
  }
  const message = req.body && req.body.message;
  const networkRaw = req.body && req.body.network;
  const VALID_NETWORKS = ['ethereum', 'base', 'polygon', 'kava'];
  const network = VALID_NETWORKS.includes(networkRaw) ? networkRaw : 'ethereum';

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
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
      30000
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
    if (e.code === 'INVALID_API_KEY' || (typeof e.message === 'string' && e.message.includes('Missing required API key:'))) {
      return res.status(500).json({ error: 'Server configuration error: the block explorer API key is missing or invalid.' });
    }
    return res.status(502).json({ error: e.message || 'Failed to process audit request' });
  }
}
