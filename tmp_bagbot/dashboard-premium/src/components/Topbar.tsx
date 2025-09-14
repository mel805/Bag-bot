import React from 'react';

export default function Topbar() {
  return (
    <header className="sticky top-0 z-10 bg-background/70 backdrop-blur border-b border-white/10 px-6 py-3 flex items-center gap-3">
      <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-cyan/50 flex-1" placeholder="Rechercher…" />
      <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">Thème</button>
      <button className="bg-transparent border border-white/10 rounded-xl px-3 py-2">Paramètres</button>
      <img src="https://i.pravatar.cc/100?img=65" className="w-9 h-9 rounded-full object-cover border border-white/10" />
    </header>
  );
}
