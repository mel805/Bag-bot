import React, { useEffect } from 'react';
import { useApi } from '../store/api';

export default function Stats() {
  const { stats, fetchAll } = useApi();
  useEffect(()=>{ fetchAll(); }, []);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">État du serveur</h3>
        <div className="text-white/80">{stats?.guildName || '—'}</div>
        <div className="text-white/70">Membres: {stats?.memberCount ?? '—'}</div>
        <div className="text-white/70">Salons: {stats?.channels ?? '—'}{stats?.textChannelsCount !== undefined && (<>
          {' '}— Texte: {stats.textChannelsCount} • Vocaux: {stats?.voiceChannelsCount ?? 0} • Catégories: {stats?.categoryCount ?? 0}
        </>)}</div>
        <div className="text-white/60 text-sm mt-2">Uptime: {stats ? `${Math.floor((stats.uptimeSec||0)/3600)}h` : '—'}</div>
      </div>
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Ressources</h3>
        <div className="text-white/70">Affichage en direct via API</div>
      </div>
    </div>
  );
}
