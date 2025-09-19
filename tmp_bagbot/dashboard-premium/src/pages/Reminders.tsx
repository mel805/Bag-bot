import React from 'react';

export default function Reminders() {
  return (
    <div className="panel">
      <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Rappels</h3>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" placeholder="Message…" />
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" placeholder="CRON / toutes les X min…" />
          <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">Créer</button>
        </div>
        <div className="text-white/60 text-sm">Liste des rappels (mock).</div>
      </div>
    </div>
  );
}
