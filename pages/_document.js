import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  const baseAppId = process.env.NEXT_PUBLIC_BASE_APP_ID || '69f0c497be7ac0b217d53caa'
  const verificationMetaName = process.env.NEXT_PUBLIC_SITE_VERIFICATION_NAME
  const verificationMetaContent = process.env.NEXT_PUBLIC_SITE_VERIFICATION_CONTENT

  return (
    <Html lang="en">
      <Head>
        <meta name="base:app_id" content={baseAppId} />
        <meta property="base:app_id" content={baseAppId} />
        {verificationMetaName && verificationMetaContent ? (
          <meta name={verificationMetaName} content={verificationMetaContent} />
        ) : null}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
