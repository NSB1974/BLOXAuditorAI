export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const tokenAddress = process.env.BLOXOLOGY_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_BLOXOLOGY_TOKEN_ADDRESS;
  const treasuryAddress = process.env.AUDIT_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_AUDIT_TREASURY_ADDRESS;
  const amount = process.env.AUDIT_REQUIRED_TOKEN_AMOUNT || process.env.NEXT_PUBLIC_AUDIT_REQUIRED_TOKEN_AMOUNT;

  if (!tokenAddress || !treasuryAddress || !amount) {
    return res.status(500).json({
      error: {
        code: 'PAYMENT_CONFIG_MISSING',
        message: 'Base payment configuration is missing on the server.',
      },
    });
  }

  return res.status(200).json({
    tokenAddress,
    treasuryAddress,
    amount,
  });
}
