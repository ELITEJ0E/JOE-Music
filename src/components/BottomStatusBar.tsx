import React from "react";

export const BottomStatusBar: React.FC = () => {
  return (
    <footer className="h-8 bg-[#0a0c0e] border-t border-[#191d24] px-6 hidden sm:flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0 z-20 select-none">
      {/* Left Hardware & Latency Status */}
      <div className="flex items-center space-x-4">
        <span>Input: <strong className="text-zinc-300">LAVA ME Play</strong></span>
        <span>•</span>
        <span>Latency: <strong className="text-[#00FF66]">9 ms</strong></span>
        <span>•</span>
        <span>Output: <strong className="text-zinc-300">Headphones</strong></span>
      </div>

      {/* Right Audio Engine & Support */}
      <div className="flex items-center space-x-4">
        <span>AUDIO ENGINE: <strong className="text-zinc-300">ASIO (WebAudio Core)</strong></span>
        <span>•</span>
        <button
          onClick={() => alert("Guitar Studio Help & Documentation")}
          className="hover:text-white transition-colors uppercase font-bold"
        >
          SUPPORT
        </button>
      </div>
    </footer>
  );
};
