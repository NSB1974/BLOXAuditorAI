import Head from 'next/head'
import { AuditButton, Navbar } from '@/components'

export default function Home() {
  return (
    <>
      <div>
        <Head>
          <title>Bloxology — Audit Readiness Reviews</title>
          <meta name="description" content="Evidence-led AI-assisted smart contract reviews that help token teams remediate risks and demonstrate audit readiness." />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/bloxology-logo.svg" />
        </Head>

        <div className="h-fit">
          <Navbar />
          <AuditButton />
        </div>
      </div>
    </>
  )
}
