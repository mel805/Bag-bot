import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

export default function AreaCard({ title, data }:{title:string; data:{x:string;y:number}[]}) {
  const total = useMemo(()=> data.reduce((s,d)=>s + (Number(d.y)||0), 0), [data]);
  return (
    <div className="bg-transparent rounded-xl border border-white/10 p-4">
      <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">{title}</h3>
      <div className="relative h-48">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="x" stroke="#7c7c8a"/>
            <YAxis stroke="#7c7c8a"/>
            <Tooltip contentStyle={{ background:'#151526', border:'1px solid rgba(255,255,255,0.1)'}} />
            <Area type="monotone" dataKey="y" stroke="#8b5cf6" fill="url(#g)" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-white/80 text-lg font-semibold bg-black/20 rounded-full px-3 py-1">{total.toLocaleString('fr-FR')}</div>
        </div>
      </div>
    </div>
  );
}
