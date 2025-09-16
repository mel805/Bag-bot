import React, { useEffect, useMemo } from 'react';
import { useApi } from '../store/api';

export default function Servers() {
  const { stats, meta, configs, fetchAll, fetchMeta } = useApi();
  useEffect(()=>{ fetchAll(); fetchMeta(); }, []);
  const channelName = useMemo(() => {
    const map = new Map<string,string>();
    (meta?.channels||[]).forEach(c=>map.set(c.id, c.name));
    return (id?: string) => (id ? (map.get(id) || id) : '—');
  }, [meta]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-transparent rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">{stats?.guildName || 'Serveur'}</h3>
        <div className="text-white/70">Membres: {stats?.memberCount ?? '—'} • Salons: {stats?.channels ?? '—'}</div>
      </div>
      <div className="bg-transparent rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Paramètres serveur</h3>
        <div className="text-white/70 space-y-1">
          <div>AFK: {channelName(meta?.settings?.afkChannelId)} • {meta?.settings?.afkTimeout ?? '—'}s</div>
          <div>Règles: {channelName(meta?.settings?.rulesChannelId)}</div>
          <div>MAJ Publiques: {channelName(meta?.settings?.publicUpdatesChannelId)}</div>
          <div>Système: {channelName(meta?.settings?.systemChannelId)}</div>
          <div>Vérification: {meta?.settings?.verificationLevel ?? '—'}</div>
          <div>Filtre contenu explicite: {meta?.settings?.explicitContentFilter ?? '—'}</div>
          <div>Locale: {meta?.settings?.preferredLocale ?? '—'}</div>
        </div>
      </div>
      <div className="bg-transparent rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Auto-threads (bot)</h3>
        <div className="text-white/70 space-y-1">
          <div>Politique: {configs?.autothread?.policy || '—'}</div>
          <div>Archivage: {configs?.autothread?.archivePolicy || '—'}</div>
          <div>Salons: {(configs?.autothread?.channels||[]).map((id:string)=>channelName(id)).join(', ') || '—'}</div>
        </div>
      </div>
      <div className="bg-transparent rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Compteur (bot)</h3>
        <div className="text-white/70">Salons actifs: {(configs?.counting?.channels||[]).length || 0}</div>
      </div>
      <div className="bg-transparent rounded-xl border border-white/10 p-4 md:col-span-2">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Journalisation (bot)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-white/70">
          {['joinleave','messages','threads','backup'].map(k => (
            <div key={k} className="space-y-1">
              <div className="font-medium">{k}</div>
              <div>État: {configs?.logs?.categories?.[k] ? 'ON' : 'OFF'}</div>
              <div>Salon: {channelName(configs?.logs?.channels?.[k])}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
