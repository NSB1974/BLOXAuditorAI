export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const baseAppId = process.env.NEXT_PUBLIC_BASE_APP_ID || '69f0c497be7ac0b217d53caa'
  const verificationMetaName = process.env.NEXT_PUBLIC_SITE_VERIFICATION_NAME
  const verificationMetaContent = process.env.NEXT_PUBLIC_SITE_VERIFICATION_CONTENT

  return res.status(200).json({
    baseAppId,
    hasBaseAppId: Boolean(baseAppId),
    configured: Boolean(verificationMetaName && verificationMetaContent),
    metaName: verificationMetaName || null,
  })
}
