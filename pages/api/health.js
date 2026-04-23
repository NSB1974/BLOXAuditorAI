export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const checks = {
    etherscanApiKey: !!process.env.ETHERSCAN_API_KEY,
    basescanApiKey: !!process.env.BASESCAN_API_KEY,
    polygonscanApiKey: !!process.env.POLYGONSCAN_API_KEY,
    kavascanApiKey: !!process.env.KAVASCAN_API_KEY,
  };

  const configuredNetworks = Object.entries(checks)
    .filter(([, configured]) => configured)
    .map(([key]) => key);
  const healthy = configuredNetworks.length > 0;

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    checks,
    configuredNetworks,
  });
}
