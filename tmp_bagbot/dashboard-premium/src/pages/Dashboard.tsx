import React, { useEffect, useMemo, useRef, useState } from 'react';
import AreaCard from '../components/charts/AreaCard';
import { useApi } from '../store/api';

export default function Dashboard() {
  const { stats, fetchAll } = useApi();
  useEffect(() => { fetchAll(); }, []);
  const [points, setPoints] = useState<{x:string;y:number}[]>([]);
  const [members, setMembers] = useState<{x:string;y:number}[]>([]);
  const timerRef = useRef<number|undefined>(undefined);
  useEffect(()=>{
    const tick = async () => {
      try {
        const s = await fetch('/api/stats').then(r=>r.json()).catch(()=>null);
        if (s && Array.isArray(s.dailyMessages) && s.dailyMessages.length) {
          const next = s.dailyMessages.map((d: any) => ({ x: d.date?.slice(5) || '', y: Number(d.count||0) }));
          setPoints(next);
        }
        if (s && Array.isArray(s.dailyMembers) && s.dailyMembers.length) {
          const nextM = s.dailyMembers.map((d: any) => ({ x: d.date?.slice(5) || '', y: Number(d.count||0) }));
          setMembers(nextM);
        }
      } catch {}
      timerRef.current = window.setTimeout(tick, 5000);
    };
    tick();
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []);
  const data = useMemo(()=> points.length ? points : Array.from({length: 30}, (_,i)=>({ x: `J${i+1}`, y: 0 })), [points]);
  const membersData = useMemo(()=> members.length ? members : Array.from({length: 30}, (_,i)=>({ x: `J${i+1}`, y: 0 })), [members]);
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <div className=""><AreaCard title="Messages / mois" data={data} /></div>
      <div className=""><AreaCard title="Membres / mois" data={membersData} /></div>
      <div className="bg-transparent rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Temps réel</h3>
        <div className="text-white/80">Serveur: {stats?.guildName || '—'}</div>
        <div className="text-white/60 text-sm">
          Membres: {stats?.memberCount ?? '—'} • Salons: {stats?.channels ?? '—'}
          {stats?.textChannelsCount !== undefined && (
            <> — Texte: {stats.textChannelsCount} • Vocaux: {stats?.voiceChannelsCount ?? 0} • Catégories: {stats?.categoryCount ?? 0}</>
          )}
        </div>
      </div>
    </div>
  );
}
