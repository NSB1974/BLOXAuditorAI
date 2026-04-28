import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  const verificationMetaName = process.env.NEXT_PUBLIC_SITE_VERIFICATION_NAME
  const verificationMetaContent = process.env.NEXT_PUBLIC_SITE_VERIFICATION_CONTENT

  return (
    <Html lang="en">
      <Head>
        <meta name="base:app_id" content="69f0c497be7ac0b217d53caa" />
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
