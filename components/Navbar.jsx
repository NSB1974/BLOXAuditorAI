import React from 'react';
import Image from 'next/image';

function GlassmorphismNavbar() {
  return (
    <nav className="fixed top-3 left-0 min-w-full sm:w-full z-10 flex items-center justify-center
     flex-wrap bg-opacity-10 bg-blue-950 rounded-full backdrop-blur-md shadow-sm p-4">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="relative w-9 h-9">
          <Image
            src="/bloxology-logo.svg"
            alt="Bloxology Logo"
            fill
            style={{ objectFit: 'contain' }}
          />
        </div>
        <span
          className="text-xl font-bold tracking-widest text-transparent bg-clip-text"
          style={{ backgroundImage: 'linear-gradient(90deg, #60A5FA, #818CF8)' }}
        >
          BLOXOLOGY
        </span>
      </div>
    </nav>
  );
}

export default GlassmorphismNavbar;
