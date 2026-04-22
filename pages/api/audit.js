export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const message = req.body && req.body.message;

  if (!message) {
    return res.status(400).json({ error: 'Missing message in request body' });
  }

  try {
    const upstream = await fetch('https://api.0x0.ai/message', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    let data;
    try {
      data = await upstream.json();
    } catch {
      return res.status(upstream.status).json({ error: `Upstream returned HTTP ${upstream.status}` });
    }

    return res.status(upstream.status).json(data);
  } catch (e) {
    console.error('Upstream audit request failed:', e);
    return res.status(502).json({ error: 'Failed to reach audit service' });
  }
}
