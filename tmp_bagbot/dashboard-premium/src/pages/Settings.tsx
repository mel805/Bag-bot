import React, { useEffect, useState } from 'react';
import { useApi } from '../store/api';

export default function Settings() {
  const { configs, fetchAll, saveCurrency } = useApi();
  const [currency, setCurrency] = useState('');
  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { if (configs?.economy?.currency?.name) setCurrency(configs.economy.currency.name); }, [configs]);
  return (
    <div className="space-y-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Devise</h3>
        <div className="flex gap-2">
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={currency} onChange={e=>setCurrency(e.target.value)} />
          <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveCurrency(currency); }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
