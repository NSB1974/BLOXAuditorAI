BloxAuditorAI

Contract Guardian AI is a Solidity Smart Contract Auditor powered by AI using 0X0-Api that analyzes and audits the code of smart contracts, detects errors and vulnerabilities, and generates through reports for safe and error-free smart contracts.

# Technologies Used:

0x Api

Next.js server-side API routes: The perfect solution for interacting with the  API, delivering lightning-fast results.

Next.js React components: The browser UI has never looked better, with beautiful, dynamic components to delight your senses.

Tailwind CSS: Framework for stunning, responsive designs that elevate your app to the next level.


# Installation

To install Metagoblins Scribble AI, follow these simple steps:

1. Clone this repository
2. Install the required dependencies using `npm install or yarn`.
3. Run the script using `yarn run dev.  

# USE YOUR OWN IMAGES #

# Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values before running locally.
For Vercel deployments, set these in **Project Settings → Environment Variables**.

| Variable | Required | Description |
|---|---|---|
| `ETHERSCAN_API_KEY` | Recommended | Etherscan API key for fetching Ethereum / Base / Polygon contract source. Get a free key at <https://etherscan.io/myapikey>. Without this key the app falls back to unauthenticated requests which are rate-limited. |
| `BASESCAN_API_KEY` | Optional | Basescan API key for Base contracts. Falls back to `ETHERSCAN_API_KEY` if unset. Get one at <https://basescan.org/myapikey>. |
| `POLYGONSCAN_API_KEY` | Optional | Polygonscan API key for Polygon contracts. Falls back to `ETHERSCAN_API_KEY` if unset. Get one at <https://polygonscan.com/myapikey>. |
| `KAVASCAN_API_KEY` | Optional | Kavascan API key for Kava contracts. Get one at <https://kavascan.com/myapikey>. |

> **Note:** The AI audit service (`https://api.0x0.ai/message`) requires no API key and is called server-side. No secrets are needed for it.








                                                                                                     
                                                                                                     
                                                                                                  
