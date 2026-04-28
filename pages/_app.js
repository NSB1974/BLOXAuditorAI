import '@/styles/globals.css'
import Head from 'next/head'
import { Analytics } from '@vercel/analytics/react'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="base:app_id" content="69f0c497be7ac0b217d53caa" />
      </Head>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
