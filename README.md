# Bloxology AI Smart Contract Auditor

Bloxology AI Smart Contract Auditor is a Next.js application for reviewing verified Solidity smart contracts with an AI-powered audit workflow. Users enter a contract address, choose a supported network, and receive a formatted security report covering vulnerabilities, best-practice issues, and gas-efficiency concerns.

> **Important:** AI-generated reports are a starting point for review, not a replacement for a professional manual audit. Always validate findings before deploying or interacting with contracts that secure real value.

## Features

- **Multi-chain contract lookup:** Supports Ethereum, Base, Polygon, and KAVA from the web UI.
- **Verified source retrieval:** Pulls contract source from block explorer APIs, with Sourcify and Blockscout fallbacks where available.
- **Proxy-aware audits:** Resolves one implementation level for proxy contracts when explorer metadata provides an implementation address.
- **AI audit reports:** Sends sanitized verified source code to the configured ConsoleXAI-compatible audit endpoint.
- **Base payment gate:** Requires a configured ERC-20 payment receipt for Base network audits.
- **Readable report rendering:** Displays markdown-style headings, tables, code blocks, lists, and severity badges in the browser.
- **Deployment verification support:** Optional site-verification meta tag configuration for providers such as Google Search Console or Base App verification.

## Tech Stack

- [Next.js](https://nextjs.org/) pages router and API routes
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- ConsoleXAI-compatible AI audit API
- Etherscan/Basescan/Polygonscan/Kavascan, Sourcify, and Blockscout source lookups

## Prerequisites

- Node.js 18 or newer
- npm
- API credentials for any block explorers you want to use
- A ConsoleXAI API key
- Optional Base RPC endpoint and payment-token configuration for Base audits

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/NSB1974/https---github.com-NSB1974-Launch-a-B20-token.git
   cd https---github.com-NSB1974-Launch-a-B20-token
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

   If `.env.example` is not present, create `.env.local` and add the variables listed in [Environment Variables](#environment-variables).

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) and submit a verified smart contract address.

## Environment Variables

### Required

| Variable | Used by | Description |
| --- | --- | --- |
| `CONSOLEXAI_API_KEY` | Server | API key used by `/api/audit` to call the AI audit service. |

### Recommended explorer keys

| Variable | Used by | Description |
| --- | --- | --- |
| `ETHERSCAN_API_KEY` | Server | Etherscan API key. Also used for Etherscan v2 multi-chain requests for Ethereum, Base, and Polygon. |
| `BASESCAN_API_KEY` | Server | Basescan API key fallback for Base source lookups. |
| `POLYGONSCAN_API_KEY` | Server | Polygonscan API key fallback for Polygon source lookups. |
| `KAVASCAN_API_KEY` | Server | Kavascan API key for KAVA source lookups. |

### Base audit payment configuration

Base audits are payment-gated. Configure both server-side and public client-side values so the wallet payment and server verification agree.

| Variable | Used by | Description |
| --- | --- | --- |
| `BLOXOLOGY_TOKEN_ADDRESS` | Server | ERC-20 token contract accepted for Base audit payments. |
| `AUDIT_TREASURY_ADDRESS` | Server | Treasury wallet that must receive the ERC-20 transfer. |
| `AUDIT_REQUIRED_TOKEN_AMOUNT` | Server | Required token amount in the token's smallest unit. |
| `BASE_RPC_URL` | Server | Base mainnet JSON-RPC endpoint used to verify payment transactions. |
| `NEXT_PUBLIC_BLOXOLOGY_TOKEN_ADDRESS` | Client | Same ERC-20 token address exposed to the browser for wallet transactions. |
| `NEXT_PUBLIC_AUDIT_TREASURY_ADDRESS` | Client | Same treasury address exposed to the browser for wallet transactions. |
| `NEXT_PUBLIC_AUDIT_REQUIRED_TOKEN_AMOUNT` | Client | Same required amount exposed to the browser for wallet transactions. |

### Optional deployment verification

| Variable | Used by | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_BASE_APP_ID` | Client/server | Base App ID rendered in document metadata and reported by `/api/verification`. |
| `NEXT_PUBLIC_SITE_VERIFICATION_NAME` | Client/server | Verification meta tag name, such as `google-site-verification`. |
| `NEXT_PUBLIC_SITE_VERIFICATION_CONTENT` | Client/server | Verification token content. |

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the local Next.js development server. |
| `npm run build` | Creates a production build. |
| `npm run start` | Starts the production server after a successful build. |
| `npm run lint` | Runs the configured Next.js lint command. |

## API Routes

### `POST /api/audit`

Audits a verified smart contract.

Request body:

```json
{
  "message": "0x0000000000000000000000000000000000000000",
  "network": "ethereum"
}
```

For Base audits, include the `paymentReceipt` returned by the client-side wallet payment flow:

```json
{
  "message": "0x0000000000000000000000000000000000000000",
  "network": "base",
  "paymentReceipt": {
    "txHash": "0x...",
    "payer": "0x...",
    "amount": "1000000000000000000",
    "token": "0x...",
    "network": "base",
    "chainId": 8453
  }
}
```

Response body:

```json
{
  "message": "# Audit Report\n..."
}
```

### `GET /api/health`

Returns a lightweight health response and indicates which explorer keys are configured.

### `GET /api/verification`

Returns deployment-verification configuration state for debugging site-verification setup.

## Usage Notes

- The submitted address must be a valid EVM address.
- The target contract must have verified Solidity source code on a supported explorer or public fallback source provider.
- Ethereum, Polygon, and KAVA audits call the audit API directly after source retrieval.
- Base audits require the connected wallet to be on Base mainnet and complete the configured ERC-20 transfer first.
- The app blocks selected known test or excluded addresses from audit submission.

## Deployment

The project can be deployed to Vercel or any platform that supports Next.js applications.

1. Add the required environment variables to your hosting provider.
2. Run `npm run build` during deployment.
3. Confirm `/api/health` reports the expected configured services.
4. If using verification metadata, set `NEXT_PUBLIC_SITE_VERIFICATION_NAME` and `NEXT_PUBLIC_SITE_VERIFICATION_CONTENT`, then verify that the rendered page contains the generated meta tag.

## Security Considerations

- Keep server-side API keys out of client bundles. Do not prefix secret keys with `NEXT_PUBLIC_`.
- Use a trusted Base RPC provider for payment verification.
- Treat AI audit output as advisory and review findings manually.
- Rotate explorer and AI API keys if they are exposed or committed accidentally.
- Review payment-token decimals before setting `AUDIT_REQUIRED_TOKEN_AMOUNT`.

## Project Structure

```text
components/          React UI components, including the audit form and navbar
pages/               Next.js pages and API routes
pages/api/audit.js   Contract source lookup, payment verification, and AI audit handler
public/              Static assets such as the Bloxology logo and fonts
styles/              Global and module CSS
```

## License

No license file is currently included. Add a license before distributing or accepting external contributions.
