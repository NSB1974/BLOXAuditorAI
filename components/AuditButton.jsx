import React, { useRef, useState } from 'react';
import Image from 'next/image';

const NETWORKS = [
  { id: 'ethereum', label: 'Ethereum', color: '#627EEA', bg: 'rgba(98,126,234,0.15)', border: '#627EEA' },
  { id: 'base',     label: 'Base',     color: '#0052FF', bg: 'rgba(0,82,255,0.15)',   border: '#0052FF' },
  { id: 'polygon',  label: 'Polygon',  color: '#8247E5', bg: 'rgba(130,71,229,0.15)', border: '#8247E5' },
  { id: 'kava',     label: 'KAVA',     color: '#FF564F', bg: 'rgba(255,86,79,0.15)',  border: '#FF564F' },
];

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const BASE_MAINNET_CHAIN_ID = 8453n;

// Addresses excluded from auditing (e.g. well-known test tokens)
const BLOCKED_ADDRESSES = new Set([
  '0x514910771AF9Ca656af840dff83E8264EcF986CA',
]);

async function fetchAuditWithRetry(payload, attempts = 2) {
  let lastError;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      return response;
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError || new Error('Failed to contact audit API');
}

async function getBasePaymentConfig() {
  const tokenAddress = process.env.NEXT_PUBLIC_BLOXOLOGY_TOKEN_ADDRESS;
  const treasuryAddress = process.env.NEXT_PUBLIC_AUDIT_TREASURY_ADDRESS;
  const amount = process.env.NEXT_PUBLIC_AUDIT_REQUIRED_TOKEN_AMOUNT;

  if (tokenAddress && treasuryAddress && amount) {
    return { tokenAddress, treasuryAddress, amount };
  }

  const response = await fetch('/api/payment-config', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'Payment is not configured. Missing token, treasury, or amount environment variables.';
    const err = new Error(message);
    err.code = payload?.error?.code || 'PAYMENT_CONFIG_MISSING';
    throw err;
  }

  if (!payload?.tokenAddress || !payload?.treasuryAddress || !payload?.amount) {
    const err = new Error('Payment is not configured. Missing token, treasury, or amount environment variables.');
    err.code = 'PAYMENT_CONFIG_MISSING';
    throw err;
  }

  return payload;
}

async function payForBaseAudit() {
  if (typeof window === 'undefined' || !window.ethereum) {
    const err = new Error('Wallet not found. Please install MetaMask (or another EVM wallet) to pay on Base.');
    err.code = 'WALLET_NOT_FOUND';
    throw err;
  }

  const { tokenAddress, treasuryAddress, amount } = await getBasePaymentConfig();

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const payer = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
  if (!payer) {
    const err = new Error('Wallet connection failed. Please unlock your wallet and try again.');
    err.code = 'WALLET_NOT_FOUND';
    throw err;
  }

  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
  const chainId = BigInt(chainIdHex);
  if (chainId !== BASE_MAINNET_CHAIN_ID) {
    const err = new Error('Wrong network. Please switch your wallet to Base Mainnet (chain ID 8453).');
    err.code = 'WRONG_NETWORK';
    throw err;
  }

  const amountHex = BigInt(amount).toString(16).padStart(64, '0');
  const treasuryNoPrefix = treasuryAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const transferCallData = `0xa9059cbb${treasuryNoPrefix}${amountHex}`;

  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: payer,
      to: tokenAddress,
      data: transferCallData,
    }],
  });

  let minedReceipt = null;
  for (let i = 0; i < 60; i += 1) {
    minedReceipt = await window.ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });
    if (minedReceipt?.status === '0x1') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!minedReceipt || minedReceipt.status !== '0x1') {
    const err = new Error('Payment transaction was not confirmed. Please wait for confirmation and retry.');
    err.code = 'PAYMENT_NOT_CONFIRMED';
    throw err;
  }

  return {
    txHash,
    payer,
    amount,
    token: tokenAddress,
    network: 'base',
    chainId: Number(chainId),
  };
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function getSeverityClass(word) {
  const w = word.toLowerCase();
  if (w === 'critical' || w === 'high')          return 'bg-red-900 text-red-300 border border-red-700';
  if (w === 'medium')                             return 'bg-yellow-900 text-yellow-300 border border-yellow-700';
  if (w === 'low')                                return 'bg-blue-900 text-blue-300 border border-blue-700';
  if (w === 'informational' || w === 'info')      return 'bg-gray-800 text-gray-300 border border-gray-600';
  return null;
}

function parseInline(text, keyPrefix) {
  const segments = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    const boldIdx  = remaining.indexOf('**');
    const codeIdx  = remaining.indexOf('`');

    const earliest = [
      boldIdx  >= 0 ? { type: 'bold', pos: boldIdx  } : null,
      codeIdx  >= 0 ? { type: 'code', pos: codeIdx  } : null,
    ]
      .filter(Boolean)
      .sort((a, b) => a.pos - b.pos)[0];

    if (!earliest) {
      segments.push(<span key={`${keyPrefix}-t${idx++}`}>{remaining}</span>);
      break;
    }

    if (earliest.pos > 0) {
      segments.push(<span key={`${keyPrefix}-t${idx++}`}>{remaining.slice(0, earliest.pos)}</span>);
    }

    if (earliest.type === 'bold') {
      const end = remaining.indexOf('**', earliest.pos + 2);
      if (end === -1) {
        segments.push(<span key={`${keyPrefix}-t${idx++}`}>{remaining}</span>);
        break;
      }
      const inner = remaining.slice(earliest.pos + 2, end);
      const sevClass = getSeverityClass(inner.trim());
      segments.push(
        sevClass
          ? <span key={`${keyPrefix}-b${idx++}`} className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${sevClass}`}>{inner}</span>
          : <strong key={`${keyPrefix}-b${idx++}`} className="font-bold text-white">{inner}</strong>
      );
      remaining = remaining.slice(end + 2);
    } else {
      const end = remaining.indexOf('`', earliest.pos + 1);
      if (end === -1) {
        segments.push(<span key={`${keyPrefix}-t${idx++}`}>{remaining}</span>);
        break;
      }
      const inner = remaining.slice(earliest.pos + 1, end);
      segments.push(
        <code key={`${keyPrefix}-c${idx++}`} className="bg-blue-950 border border-blue-800 rounded px-1 font-mono text-xs text-blue-200">{inner}</code>
      );
      remaining = remaining.slice(end + 1);
    }
  }

  return segments;
}

function renderMarkdown(markdown) {
  const lines = markdown.split('\n');
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing ```
      elements.push(
        <pre key={key++} className="bg-blue-950 border border-blue-800 rounded-xl p-4 my-3 overflow-x-auto text-xs text-blue-200 font-mono whitespace-pre-wrap">
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // H4
    if (line.startsWith('#### ')) {
      const text = line.slice(5);
      elements.push(
        <h4 key={key++} className="text-indigo-300 font-semibold text-base mt-5 mb-1">
          {parseInline(text, `h4-${key}`)}
        </h4>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      const text = line.slice(4);
      elements.push(
        <h3 key={key++} className="text-blue-400 font-bold text-lg mt-7 mb-2 border-b border-blue-800 pb-1">
          {parseInline(text, `h3-${key}`)}
        </h3>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith('## ')) {
      const text = line.slice(3);
      elements.push(
        <h2 key={key++} className="text-blue-300 font-bold text-xl mt-8 mb-2 border-b border-blue-700 pb-1">
          {parseInline(text, `h2-${key}`)}
        </h2>
      );
      i++;
      continue;
    }

    // H1
    if (line.startsWith('# ')) {
      const text = line.slice(2);
      elements.push(
        <h1 key={key++} className="text-blue-200 font-extrabold text-2xl mt-8 mb-3">
          {parseInline(text, `h1-${key}`)}
        </h1>
      );
      i++;
      continue;
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const headerCells = tableLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const bodyRows = tableLines.slice(2).map(row =>
          row.split('|').filter(c => c.trim()).map(c => c.trim())
        );
        elements.push(
          <div key={key++} className="overflow-x-auto my-4 rounded-xl border border-blue-800">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-900 bg-opacity-70">
                  {headerCells.map((cell, ci) => (
                    <th key={ci} className="px-4 py-2 text-left text-blue-200 font-semibold border-b border-blue-700">
                      {parseInline(cell, `th-${key}-${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-blue-900 hover:bg-blue-900 hover:bg-opacity-20">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2 text-blue-100 border-r border-blue-900 last:border-r-0">
                        {parseInline(cell, `td-${key}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 ml-3 text-blue-100">
          {items.map((item, li) => (
            <li key={li}>{parseInline(item, `ul-${key}-${li}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="list-decimal list-inside space-y-1 my-2 ml-3 text-blue-100">
          {items.map((item, li) => (
            <li key={li}>{parseInline(item, `ol-${key}-${li}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={key++} className="border-blue-800 my-5" />);
      i++;
      continue;
    }

    // Non-empty paragraph
    if (line.trim()) {
      elements.push(
        <p key={key++} className="text-blue-100 leading-relaxed my-1.5">
          {parseInline(line, `p-${key}`)}
        </p>
      );
    }

    i++;
  }

  return elements;
}

// ── AuditReport display component ───────────────────────────────────────────

function AuditReport({ markdown, address, network, policy, disclaimer, disposition, report, onClear }) {
  const readinessApproved = disposition?.label?.startsWith('OK / Neutral');

  const downloadReport = () => {
    if (!report?.content || !report?.filename) return;

    const blob = new Blob([report.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-4 w-full max-w-3xl rounded-2xl overflow-hidden"
      style={{ border: '1.5px solid #3b82f6', boxShadow: '0 0 32px rgba(59,130,246,0.15)' }}>

      {/* Report header */}
      <div className="flex items-center gap-3 px-6 py-4"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', borderBottom: '1.5px solid #3b82f6' }}>
        <div className="relative w-9 h-9 flex-shrink-0">
          <Image
            src="/bloxology-logo.svg"
            alt="Bloxology"
            fill
            style={{ objectFit: 'contain' }}
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className="text-lg font-extrabold tracking-widest text-transparent bg-clip-text leading-tight"
            style={{ backgroundImage: 'linear-gradient(90deg, #60A5FA, #818CF8)' }}
          >
            AUDIT REPORT
          </span>
          <span className="font-mono text-xs text-blue-400 truncate">
            {address} &middot; {network.charAt(0).toUpperCase() + network.slice(1)}
          </span>
        </div>
      </div>

      {/* Report body */}
      <div className="px-6 py-5 bg-blue-950 bg-opacity-60 backdrop-blur-lg">
        <aside className={`mb-6 rounded-xl border p-4 text-sm ${readinessApproved ? 'border-emerald-600 bg-emerald-950/40 text-emerald-100' : 'border-amber-600 bg-amber-950/40 text-amber-100'}`}>
          <p className="font-semibold">Bloxology disposition: {disposition?.label || 'Action required — not ready for OK / Neutral'}</p>
          <p className="mt-1 leading-relaxed">{disposition?.basis || 'The report must meet the Audit Readiness Standard before an OK / Neutral result can be issued.'}</p>
        </aside>
        {renderMarkdown(markdown)}
        <aside className="mt-6 rounded-xl border border-indigo-700 bg-indigo-950/50 p-4 text-sm text-indigo-100">
          <p className="font-semibold text-indigo-300">Audit-readiness, not a paid reputation label</p>
          <p className="mt-1 leading-relaxed">{disclaimer || 'This review supports audit readiness only. It is not a reputation score, certification, investment recommendation, or guarantee.'}</p>
        </aside>
        {report?.sha256 && (
          <section className="mt-4 rounded-xl border border-blue-700 bg-slate-950/60 p-4 text-sm text-blue-100" aria-label="Report integrity">
            <p className="font-semibold text-blue-300">Report integrity</p>
            <p className="mt-1 text-xs leading-relaxed text-blue-200">SHA-256 of the downloadable Markdown report. Hash the downloaded file to verify it has not changed.</p>
            <code className="mt-2 block break-all rounded bg-black/30 p-2 text-xs text-cyan-200">{report.sha256}</code>
          </section>
        )}
      </div>

      {/* Report footer */}
      <div className="flex items-center justify-between px-6 py-3"
        style={{ background: '#0f172a', borderTop: '1px solid #1e3a5f' }}>
        <span className="text-xs text-blue-500">
          {policy || 'Bloxology Audit Readiness Standard v1'} · {new Date().toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          {report?.content && (
            <button
              onClick={downloadReport}
              className="text-xs font-semibold text-cyan-300 hover:text-white transition px-3 py-1 rounded-lg border border-cyan-700 hover:border-cyan-300 hover:bg-cyan-900"
            >
              Download .md
            </button>
          )}
          <button
            onClick={onClear}
            className="text-xs font-semibold text-indigo-400 hover:text-white transition px-3 py-1
              rounded-lg border border-indigo-700 hover:border-indigo-400 hover:bg-indigo-900"
          >
            Clear Report
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main AuditButton component ───────────────────────────────────────────────

function AuditButton() {
  const inputFieldRef = useRef(null);
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [auditReport, setAuditReport] = useState(null);   // { markdown, address, network }
  const [auditError, setAuditError] = useState(null);

  const clearInputField = () => {
    inputFieldRef.current.value = '';
  };

  const sendMessage = async () => {
    const inputField = inputFieldRef.current;
    const message = inputField.value.trim();

    setAuditError(null);

    if (!message || !ETH_ADDRESS_RE.test(message)) {
      setAuditError('Please enter a valid contract address for the selected network (0x followed by 40 hex characters).');
      return;
    }

    // Block known test / excluded tokens
    if (BLOCKED_ADDRESSES.has(message)) {
      setAuditError('This contract address is not available for auditing.');
      return;
    }

    setIsLoading(true);
    setAuditReport(null);

    try {
      let paymentReceipt = null;
      if (selectedNetwork.id === 'base') {
        paymentReceipt = await payForBaseAudit();
      }

      const response = await fetchAuditWithRetry({ message, network: selectedNetwork.id, paymentReceipt });

      if (!response.ok) {
        let apiError = null;
        try {
          const errData = await response.json();
          if (errData?.error) {
            apiError = typeof errData.error === 'string' ? errData.error : errData.error.message;
          }
        } catch { /* ignore parse errors */ }

        let errorText;
        if (apiError) {
          errorText = apiError;
        } else if (response.status === 429) {
          errorText = 'The block explorer API rate limit was reached. Please wait a moment and try again.';
        } else if (response.status === 502) {
          errorText = 'The audit service is temporarily unavailable (502). Please try again in a moment.';
        } else if (response.status === 503) {
          errorText = 'The server is currently unavailable (503). Please try again shortly.';
        } else if (response.status === 504) {
          errorText = 'The audit request timed out (504). The contract may be too large — please try again.';
        } else if (response.status >= 500) {
          errorText = `An internal server error occurred (${response.status}). Please try again.`;
        } else {
          errorText = `Request failed (HTTP ${response.status}).`;
        }

        setAuditError(errorText);
        return;
      }

      const data = await response.json();
      setAuditReport({
        markdown: data.message,
        address: message,
        network: selectedNetwork.id,
        policy: data.assessmentPolicy,
        disclaimer: data.reputationDisclaimer,
        disposition: data.disposition,
        report: data.report,
      });
    } catch (e) {
      console.error('Audit request failed:', e);
      let errorText = 'An unexpected error occurred while fetching the audit. Please try again.';
      if (e?.code === 'WALLET_NOT_FOUND') {
        errorText = e.message;
      } else if (e?.code === 'WRONG_NETWORK') {
        errorText = e.message;
      } else if (e?.code === 'PAYMENT_NOT_CONFIRMED') {
        errorText = e.message;
      } else if (e?.code === 'PAYMENT_CONFIG_MISSING') {
        errorText = 'Payment is temporarily unavailable. Please contact support.';
      } else if (e instanceof TypeError) {
        errorText = 'Could not reach the server. In Chrome, disable ad-block/privacy extensions for this site, then hard refresh and try again.';
      }
      setAuditError(errorText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div id="audit" className="my-10 mt-28 text-white mx-auto max-w-screen-md flex flex-col justify-center items-center px-4">

        {/* Hero section */}
        <div className="text-center gap-y-6 items-center justify-center flex flex-col mt-5">
          <div className="relative w-28 h-28 sm:w-40 sm:h-40 drop-shadow-[0_0_30px_rgba(96,165,250,0.6)]">
            <Image
              src="/bloxology-logo.svg"
              alt="Bloxology"
              fill
              style={{ objectFit: 'contain' }}
              className="animate-pulse"
            />
          </div>

          <h1
            className="text-3xl sm:text-5xl font-extrabold tracking-widest text-transparent bg-clip-text"
            style={{ backgroundImage: 'linear-gradient(90deg, #60A5FA, #818CF8, #60A5FA)' }}
          >
            BLOXOLOGY
          </h1>

          <p className="text-base sm:text-lg w-full max-w-lg text-blue-200 text-center leading-relaxed">
            Evidence-led smart-contract review for teams working toward an “OK / Neutral”
            audit-readiness outcome. Findings and remediation—not payment—determine the result.
          </p>
        </div>

        <section className="w-full max-w-3xl mt-8 grid gap-3 sm:grid-cols-3 text-left" aria-label="Audit readiness standard">
          <div className="rounded-xl border border-blue-800 bg-blue-950/40 p-4">
            <h2 className="text-sm font-bold text-blue-300">1. Evidence first</h2>
            <p className="mt-1 text-xs leading-relaxed text-blue-100">We identify the reviewed address, chain, source scope, and code-level evidence.</p>
          </div>
          <div className="rounded-xl border border-blue-800 bg-blue-950/40 p-4">
            <h2 className="text-sm font-bold text-blue-300">2. Remediate openly</h2>
            <p className="mt-1 text-xs leading-relaxed text-blue-100">Critical and High findings prevent an OK / Neutral readiness disposition until addressed.</p>
          </div>
          <div className="rounded-xl border border-blue-800 bg-blue-950/40 p-4">
            <h2 className="text-sm font-bold text-blue-300">3. Verify independently</h2>
            <p className="mt-1 text-xs leading-relaxed text-blue-100">AI review is triage—not certification. Human review and tests remain essential.</p>
          </div>
        </section>

        {/* Network selector */}
        <div className="w-full max-w-lg mt-12 relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(prev => !prev)}
            style={{
              border: `1.5px solid ${selectedNetwork.border}`,
              background: selectedNetwork.bg,
              color: selectedNetwork.color,
            }}
            className="w-full h-12 rounded-xl backdrop-blur-lg flex items-center justify-between
              px-4 font-semibold text-sm sm:text-base transition focus:outline-none"
          >
            <span className="flex items-center gap-2">
              <span
                style={{ background: selectedNetwork.color }}
                className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              />
              {selectedNetwork.label}
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <ul
              className="absolute z-20 mt-1 w-full rounded-xl overflow-hidden shadow-xl"
              style={{ background: '#0f172a', border: '1px solid #1e3a5f' }}
            >
              {NETWORKS.map(net => (
                <li key={net.id}>
                  <button
                    type="button"
                    onClick={() => { setSelectedNetwork(net); setDropdownOpen(false); }}
                    style={{ color: net.color }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm sm:text-base
                      font-semibold hover:bg-white/5 transition text-left"
                  >
                    <span
                      style={{ background: net.color }}
                      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    />
                    {net.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Input */}
        <div
          className="w-full max-w-lg mt-3 bg-blue-950 bg-opacity-40 backdrop-blur-lg rounded-2xl p-4"
          style={{ border: `1.5px solid ${selectedNetwork.border}` }}
        >
          <input
            type="text"
            id="question-input"
            ref={inputFieldRef}
            className="w-full h-12 sm:text-base text-center bg-transparent focus:outline-none
              placeholder-blue-600 transition"
            style={{ color: selectedNetwork.color, caretColor: selectedNetwork.color }}
            placeholder="Paste contract address (0x…)"
          />
        </div>

        {/* Buttons */}
        <div className="my-10 flex flex-row gap-6 justify-center items-center">
          <button
            id="submit-button"
            style={{ borderColor: selectedNetwork.border, color: selectedNetwork.color, background: selectedNetwork.bg }}
            className="w-24 h-11 sm:w-32 font-bold rounded-xl backdrop-blur-lg
              hover:brightness-125 transition disabled:opacity-50"
            onClick={sendMessage}
            disabled={isLoading}
          >
            {isLoading ? 'Auditing…' : 'Audit'}
          </button>

          <button
            id="clear-button"
            className="w-24 h-11 sm:w-32 font-bold rounded-xl border border-indigo-400
              text-indigo-300 bg-indigo-900 bg-opacity-40 backdrop-blur-lg
              hover:bg-indigo-700 hover:text-white transition"
            onClick={clearInputField}
          >
            Clear
          </button>
        </div>

        {/* Error message */}
        {auditError && (
          <p className="text-red-400 text-sm mb-4 text-center max-w-lg">{auditError}</p>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="my-4 w-full max-w-3xl rounded-2xl px-6 py-8 flex items-center justify-center gap-3"
            style={{ border: '1.5px solid #3b82f6', background: 'rgba(15,23,42,0.7)' }}>
            <svg className="animate-spin w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-blue-300 font-medium">Fetching and auditing contract source…</span>
          </div>
        )}

        {/* Audit report */}
        {auditReport && (
          <AuditReport
            markdown={auditReport.markdown}
            address={auditReport.address}
            network={auditReport.network}
            policy={auditReport.policy}
            disclaimer={auditReport.disclaimer}
            disposition={auditReport.disposition}
            report={auditReport.report}
            onClear={() => setAuditReport(null)}
          />
        )}

        <div className="p-10" />

        <footer>
          <p className="text-center font-semibold text-blue-400 text-sm pb-6">
            © {new Date().getFullYear()} Bloxology. All rights reserved.
          </p>
        </footer>
      </div>
    </>
  );
}

export default AuditButton;
