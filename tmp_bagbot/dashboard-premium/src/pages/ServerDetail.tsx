import React from 'react';
import { useParams } from 'react-router-dom';

export default function ServerDetail() {
  const { id } = useParams();
  return (
    <div className="space-y-4">
      <div className="bg-transparent rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Serveur #{id}</h3>
        <div className="text-white/70">Configuration des salons & membres (démo).</div>
      </div>
      <div className="bg-transparent rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Gestion des salons</h3>
        <div className="flex gap-2">
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" placeholder="Ajouter un salon (ID)" />
          <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">Ajouter</button>
        </div>
      </div>
    </div>
  );
}
