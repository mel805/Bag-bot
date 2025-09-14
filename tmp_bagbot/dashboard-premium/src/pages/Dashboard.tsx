import React from 'react';
import AreaCard from '../components/charts/AreaCard';

export default function Dashboard() {
  const data = Array.from({length: 12}, (_,i)=>({ x: `M${i+1}`, y: Math.round(50+Math.random()*100) }));
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
      <div className="lg:col-span-2"><AreaCard title="Messages / mois" data={data} /></div>
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Temps réel</h3>
        <div className="text-white/80">Mock activité…</div>
      </div>
    </div>
  );
}
