import React, { useRef, useState } from 'react';
import Image from 'next/image';

const NETWORKS = [
  { id: 'ethereum', label: 'Ethereum', color: '#627EEA', bg: 'rgba(98,126,234,0.15)', border: '#627EEA' },
  { id: 'base',     label: 'Base',     color: '#0052FF', bg: 'rgba(0,82,255,0.15)',   border: '#0052FF' },
  { id: 'polygon',  label: 'Polygon',  color: '#8247E5', bg: 'rgba(130,71,229,0.15)', border: '#8247E5' },
  { id: 'kava',     label: 'KAVA',     color: '#FF564F', bg: 'rgba(255,86,79,0.15)',  border: '#FF564F' },
];

function AuditButton() {
  const chatBoxBodyRef = useRef(null);
  const inputFieldRef = useRef(null);
  const submitBtnRef = useRef(null);
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const clearInputField = () => {
    inputFieldRef.current.value = '';
    chatBoxBodyRef.current.innerHTML = '';
  };

  function clearChatContainer() {
    chatBoxBodyRef.current.innerHTML = '';
  }

  const sendMessage = async () => {
    const chatBoxBody = chatBoxBodyRef.current;
    const inputField = inputFieldRef.current;
    const submitBtn = submitBtnRef.current;

    const message = inputField.value.trim();

    // Remove previous error messages
    const previousError = chatBoxBody.querySelector('.error');
    if (previousError) {
      previousError.remove();
    }

    if (!message || !/^0x[a-fA-F0-9]{40}$/.test(message)) {
      const errorMessage = document.createElement('div');
      errorMessage.classList.add('error');
      errorMessage.style.color = '#F87171';
      errorMessage.innerHTML = '<p>Please enter a valid contract address for the selected network (0x followed by 40 hex characters).</p>';
      chatBoxBody.appendChild(errorMessage);
      chatBoxBody.scrollTop = chatBoxBody.scrollHeight;
      return;
    }

    submitBtn.innerHTML = 'Auditing…';
    submitBtn.disabled = true;

    // Remove previous response
    const previousResponse = chatBoxBody.querySelector('.response');
    if (previousResponse) {
      previousResponse.remove();
    }

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, network: selectedNetwork.id })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      submitBtn.innerHTML = 'Audit';
      submitBtn.disabled = false;
      chatBoxBody.classList.add('information');
      chatBoxBody.innerHTML = `<h3 style="color:#60A5FA;font-weight:700;font-size:1.1rem;margin-bottom:0.75rem;">Audit Report</h3><p style="line-height:1.7;">${data.message}</p>`;
      chatBoxBody.scrollTop = chatBoxBody.scrollHeight;
    } catch (e) {
      // TypeError usually means network/CORS; Error usually means explicit HTTP failure.
      console.error('Audit request failed:', e);
      submitBtn.innerHTML = 'Audit';
      submitBtn.disabled = false;
      chatBoxBody.innerHTML = '<p style="color:#F87171;">An error occurred while fetching the audit. Please check your connection or CORS settings.</p>';
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
            AI-powered smart contract auditor. Paste a contract address below to detect
            vulnerabilities, security flaws, and generate a comprehensive audit report.
          </p>
        </div>

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
            ref={submitBtnRef}
          >
            Audit
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

        {/* Report box */}
        <div
          id="chat-container"
          ref={chatBoxBodyRef}
          className="my-4 border border-blue-700 h-auto w-full max-w-3xl
            bg-blue-950 bg-opacity-60 backdrop-blur-lg rounded-2xl p-6 text-blue-100
            min-h-[3rem] leading-relaxed"
        ></div>

        <button
          id="clear-chat-button"
          className="w-40 h-10 my-4 font-semibold rounded-xl border border-indigo-500
            text-indigo-300 bg-indigo-950 bg-opacity-60 backdrop-blur-lg
            hover:bg-indigo-700 hover:text-white transition"
          onClick={clearChatContainer}
        >
          Clear Report
        </button>

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
