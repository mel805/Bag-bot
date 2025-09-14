import React, { useEffect, useMemo, useRef, useState } from 'react';
import AreaCard from '../components/charts/AreaCard';
import { useApi } from '../store/api';

export default function Dashboard() {
  const { stats, fetchAll } = useApi();
  useEffect(() => { fetchAll(); }, []);
  const [points, setPoints] = useState<{x:string;y:number}[]>([]);
  const timerRef = useRef<number|undefined>(undefined);
  useEffect(()=>{
    const tick = async () => {
      try {
        const s = await fetch('/api/stats').then(r=>r.json()).catch(()=>null);
        const value = s && typeof s.memberCount === 'number' ? s.memberCount : Math.round(50+Math.random()*100);
        setPoints(prev => {
          const next = [...prev, { x: new Date().toLocaleTimeString().slice(0,5), y: value }];
          return next.slice(-12);
        });
      } catch {}
      timerRef.current = window.setTimeout(tick, 5000);
    };
    tick();
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []);
  const data = useMemo(()=> points.length ? points : Array.from({length: 12}, (_,i)=>({ x: `T${i+1}`, y: 0 })), [points]);
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
      <div className="lg:col-span-2"><AreaCard title="Messages / mois" data={data} /></div>
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
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
