import React, { useRef } from 'react';
import Image from 'next/image';

function AuditButton() {
  const chatBoxBodyRef = useRef(null);
  const inputFieldRef = useRef(null);
  const submitBtnRef = useRef(null);

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
      errorMessage.innerHTML = '<p>Please enter a valid Ethereum contract address (e.g., 0x followed by 40 hex characters).</p>';
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
        body: JSON.stringify({ message })
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

        {/* Input */}
        <div className="w-full max-w-lg mt-12 bg-blue-950 bg-opacity-40 border border-blue-500
          backdrop-blur-lg rounded-2xl p-4">
          <input
            type="text"
            id="question-input"
            ref={inputFieldRef}
            className="w-full h-12 sm:text-base text-center text-blue-300
              border border-blue-500 rounded-xl bg-transparent focus:outline-none
              focus:border-indigo-400 placeholder-blue-600 transition"
            placeholder="Paste contract address (0x…)"
          />
        </div>

        {/* Buttons */}
        <div className="my-10 flex flex-row gap-6 justify-center items-center">
          <button
            id="submit-button"
            className="w-24 h-11 sm:w-32 font-bold rounded-xl border border-blue-400
              text-blue-300 bg-blue-900 bg-opacity-40 backdrop-blur-lg
              hover:bg-blue-700 hover:text-white transition disabled:opacity-50"
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
