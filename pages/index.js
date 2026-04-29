import Head from 'next/head'
import { AuditButton, Navbar } from '@/components'

export default function Home() {
  return (
    <>
      <div>
        <Head>
          <title>Bloxology — AI Smart Contract Auditor</title>
          <meta name="description" content="Bloxology AI smart contract auditor. Paste a contract address to detect vulnerabilities and generate a full audit report." />
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
