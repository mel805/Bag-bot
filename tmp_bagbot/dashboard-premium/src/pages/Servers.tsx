import React, { useEffect } from 'react';
import { useApi } from '../store/api';

export default function Servers() {
  const { stats, fetchAll } = useApi();
  useEffect(()=>{ fetchAll(); }, []);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">{stats?.guildName || 'Serveur'}</h3>
        <div className="text-white/70">Membres: {stats?.memberCount ?? '—'} • Salons: {stats?.channels ?? '—'}</div>
      </div>
    </div>
  );
}
