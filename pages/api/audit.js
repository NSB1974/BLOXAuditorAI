const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getContractSource(address) {
  if (!ETHERSCAN_API_KEY) {
    throw new Error('ETHERSCAN_API_KEY environment variable is not set');
  }

  const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${encodeURIComponent(address)}&apikey=${ETHERSCAN_API_KEY}`;
  const response = await fetchWithTimeout(url, {}, 10000);

  if (!response.ok) {
    throw new Error(`Etherscan returned HTTP ${response.status}`);
  }

  const json = await response.json();

  if (json.status !== '1' || !Array.isArray(json.result) || json.result.length === 0) {
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
  const network = VALID_NETWORKS.includes(networkRaw) ? networkRaw : null;

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum contract address' });
  }

  try {
    // Step 1: Fetch contract source code from Etherscan
    const contractData = await getContractSource(address);

    if (!contractData) {
      return res.status(404).json({ error: 'Contract source code not found on Etherscan. The contract may be unverified or not exist.' });
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
    console.error('Audit request failed:', e);
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Audit service timed out. Please try again.' });
    }
    if (e.message.includes('ETHERSCAN_API_KEY')) {
      return res.status(500).json({ error: 'Server configuration error: Missing Etherscan API key' });
    }
    return res.status(502).json({ error: e.message || 'Failed to process audit request' });
  }
}
