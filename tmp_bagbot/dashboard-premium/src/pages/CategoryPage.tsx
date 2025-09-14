import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../store/api';

const TITLES: Record<string, string> = {
  moderation: 'Modération',
  levels: 'Levels',
  economie: 'Économie',
  'action-verite': 'Action / Vérité',
  logs: 'Logs',
  confessions: 'Confessions',
  autothread: 'AutoThread',
  counting: 'Comptage',
  disboard: 'Disboard'
};

export default function CategoryPage() {
  const { cat = '', view = '' } = useParams();
  const { fetchAll, configs, meta, fetchMeta, saveLogs, saveAutoKickRole } = useApi();
  useEffect(() => { fetchAll(); fetchMeta(); }, []);

  const title = TITLES[cat] || cat;
  const [logChannelMsgs, setLogChannelMsgs] = useState('');
  const [autoKickRole, setAutoKickRole] = useState('');
  useEffect(()=>{
    if (!configs) return;
    setLogChannelMsgs(String(configs.logs?.channels?.messages || ''));
    setAutoKickRole(String(configs.autokick?.roleId || ''));
  }, [configs]);

  const channels = useMemo(()=> meta?.channels || [], [meta]);
  const roles = useMemo(()=> meta?.roles || [], [meta]);

  return (
    <div className="space-y-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">{title} — {view}</h3>
        {cat==='logs' && (
          <div className="space-y-3">
            <div className="text-white/70">Sélectionner le salon pour Logs: Messages</div>
            <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={logChannelMsgs} onChange={e=>setLogChannelMsgs(e.target.value)}>
              <option value="">—</option>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
              await saveLogs({ messages: true }, { messages: logChannelMsgs });
            }}>Enregistrer</button>
          </div>
        )}
        {cat==='moderation' && (
          <div className="space-y-3">
            <div className="text-white/70">AutoKick: Rôle requis</div>
            <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={autoKickRole} onChange={e=>setAutoKickRole(e.target.value)}>
              <option value="">—</option>
              {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
            </select>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveAutoKickRole(autoKickRole); }}>Enregistrer</button>
          </div>
        )}
      </div>
    </div>
  );
}

