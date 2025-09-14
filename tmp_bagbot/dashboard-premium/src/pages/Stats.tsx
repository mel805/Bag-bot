import React from 'react';

export default function Stats() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Messages / heure</h3>
        <div className="text-white/70">Graphique (démo)</div>
      </div>
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Croissance</h3>
        <div className="text-white/70">Graphique (démo)</div>
      </div>
    </div>
  );
}
