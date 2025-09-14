import React from 'react';

export default function Servers() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Serveur BAG</h3>
        <div className="text-white/70">Membres: 421</div>
      </div>
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Another Guild</h3>
        <div className="text-white/70">Membres: 88</div>
      </div>
    </div>
  );
}
