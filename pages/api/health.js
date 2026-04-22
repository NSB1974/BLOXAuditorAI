export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const checks = {
    etherscanApiKey: !!process.env.ETHERSCAN_API_KEY,
  };

  const healthy = Object.values(checks).every(Boolean);

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    checks,
  });
}
