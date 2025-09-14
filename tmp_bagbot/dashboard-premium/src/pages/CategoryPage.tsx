import React, { useEffect } from 'react';
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
  const { fetchAll, configs } = useApi();
  useEffect(() => { fetchAll(); }, []);

  const title = TITLES[cat] || cat;
  return (
    <div className="space-y-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">{title} — {view}</h3>
        <div className="text-white/70">
          Cette section affichera les formulaires et aperçus pour <b>{title}</b> (vue: <b>{view}</b>).<br/>
          Données chargées: {configs ? 'OK' : '…'}
        </div>
      </div>
    </div>
  );
}

