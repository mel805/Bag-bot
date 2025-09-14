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
  const { fetchAll, configs, meta, fetchMeta, saveLogs, saveAutoKickRole, saveCurrency, saveConfess, saveTd, saveLevels, saveAutoThread, saveCounting, saveDisboard, saveAutoKickAdvanced, saveLogsAdvanced, saveConfessAdvanced, saveLevelsAdvanced, saveCurrencySymbol } = useApi();
  useEffect(() => { fetchAll(); fetchMeta(); }, []);

  const title = TITLES[cat] || cat;
  const [logChannelMsgs, setLogChannelMsgs] = useState('');
  const [logsEnabled, setLogsEnabled] = useState(false);
  const [logsPseudo, setLogsPseudo] = useState(false);
  const [logsEmoji, setLogsEmoji] = useState('📝');
  const [logChannels, setLogChannels] = useState<{[k:string]:string}>({});
  const [logCats, setLogCats] = useState<{[k:string]:boolean}>({});
  const [autoKickRole, setAutoKickRole] = useState('');
  const [autoKickEnabled, setAutoKickEnabled] = useState(false);
  const [autoKickDelay, setAutoKickDelay] = useState(0);
  const [currencyName, setCurrencyName] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [confessAllowReplies, setConfessAllowReplies] = useState(false);
  const [confessLogChannel, setConfessLogChannel] = useState('');
  const [confessThreadNaming, setConfessThreadNaming] = useState<'normal'|'nsfw'>('normal');
  const [confessSfw, setConfessSfw] = useState<string[]>([]);
  const [confessNsfw, setConfessNsfw] = useState<string[]>([]);
  const [tdSfw, setTdSfw] = useState<string[]>([]);
  const [tdNsfw, setTdNsfw] = useState<string[]>([]);
  const [xpMsg, setXpMsg] = useState(15);
  const [xpVoice, setXpVoice] = useState(2);
  const [levelBase, setLevelBase] = useState(100);
  const [levelFactor, setLevelFactor] = useState(1.25);
  const [autoThreadChannels, setAutoThreadChannels] = useState<string[]>([]);
  const [autoThreadPolicy, setAutoThreadPolicy] = useState('new_messages');
  const [autoThreadArchive, setAutoThreadArchive] = useState('1d');
  const [countingChannels, setCountingChannels] = useState<string[]>([]);
  const [disboardReminders, setDisboardReminders] = useState(false);
  const [disboardChannel, setDisboardChannel] = useState('');
  useEffect(()=>{
    if (!configs) return;
    setLogChannelMsgs(String(configs.logs?.channels?.messages || ''));
    setLogsEnabled(Boolean(configs.logs?.enabled));
    setLogsPseudo(Boolean(configs.logs?.pseudo));
    setLogsEmoji(String(configs.logs?.emoji || '📝'));
    setLogChannels({ ...(configs.logs?.channels || {}) });
    setLogCats({ ...(configs.logs?.categories || {}) });
    setAutoKickRole(String(configs.autokick?.roleId || ''));
    setAutoKickEnabled(Boolean(configs.autokick?.enabled));
    setAutoKickDelay(Number(configs.autokick?.delayMs || 0));
    setCurrencyName(String(configs.economy?.currency?.name || ''));
    setCurrencySymbol(String(configs.economy?.currency?.symbol || ''));
    setConfessAllowReplies(Boolean(configs.confess?.allowReplies));
    setConfessSfw(Array.isArray(configs.confess?.sfw?.channels) ? configs.confess.sfw.channels : []);
    setConfessNsfw(Array.isArray(configs.confess?.nsfw?.channels) ? configs.confess.nsfw.channels : []);
    setConfessLogChannel(String(configs.confess?.logChannelId || ''));
    setConfessThreadNaming((configs.confess?.threadNaming === 'nsfw' ? 'nsfw' : 'normal'));
    setTdSfw(Array.isArray(configs.truthdare?.sfw?.channels) ? configs.truthdare.sfw.channels : []);
    setTdNsfw(Array.isArray(configs.truthdare?.nsfw?.channels) ? configs.truthdare.nsfw.channels : []);
    setXpMsg(Number(configs.levels?.xpPerMessage ?? 15));
    setXpVoice(Number(configs.levels?.xpPerVoiceMinute ?? 2));
    setLevelBase(Number(configs.levels?.levelCurve?.base ?? 100));
    setLevelFactor(Number(configs.levels?.levelCurve?.factor ?? 1.25));
    setAutoThreadChannels(Array.isArray(configs.autothread?.channels) ? configs.autothread.channels : []);
    setAutoThreadPolicy(String(configs.autothread?.policy || 'new_messages'));
    setAutoThreadArchive(String(configs.autothread?.archivePolicy || '1d'));
    setCountingChannels(Array.isArray(configs.counting?.channels) ? configs.counting.channels : []);
    setDisboardReminders(Boolean(configs.disboard?.remindersEnabled));
    setDisboardChannel(String(configs.disboard?.remindChannelId || ''));
  }, [configs]);

  const channels = useMemo(()=> meta?.channels || [], [meta]);
  const roles = useMemo(()=> meta?.roles || [], [meta]);

  return (
    <div className="space-y-4">
      <div className="bg-card/80 rounded-xl border border-white/10 p-4">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">{title} — {view}</h3>
        {cat==='logs' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={logsEnabled} onChange={e=>setLogsEnabled(e.target.checked)} /> Activé</label>
              <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={logsPseudo} onChange={e=>setLogsPseudo(e.target.checked)} /> Pseudo</label>
              <label className="text-white/70">Emoji
                <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={logsEmoji} onChange={e=>setLogsEmoji(e.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['joinleave','messages','threads','backup'].map(k => (
                <div key={k} className="space-y-2">
                  <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={Boolean(logCats[k])} onChange={e=>setLogCats(prev=>({ ...prev, [k]: e.target.checked }))} /> {k}</label>
                  <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={String(logChannels[k]||'')} onChange={e=>setLogChannels(prev=>({ ...prev, [k]: e.target.value }))}>
                    <option value="">—</option>
                    {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLogsAdvanced(logsEnabled, logsPseudo, logsEmoji); }}>Enregistrer régalges</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLogs(logCats, logChannels); }}>Enregistrer catégories/salons</button>
            </div>
          </div>
        )}
        {cat==='moderation' && (
          <div className="space-y-3">
            <div className="text-white/70">AutoKick: Rôle requis</div>
            <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={autoKickRole} onChange={e=>setAutoKickRole(e.target.value)}>
              <option value="">—</option>
              {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={autoKickEnabled} onChange={e=>setAutoKickEnabled(e.target.checked)} /> Activé</label>
              <label className="text-white/70">Délai (ms)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={autoKickDelay} onChange={e=>setAutoKickDelay(Number(e.target.value))} />
              </label>
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveAutoKickRole(autoKickRole); }}>Enregistrer rôle</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveAutoKickAdvanced(autoKickEnabled, autoKickDelay); }}>Enregistrer réglages</button>
            </div>
          </div>
        )}
        {cat==='economie' && (
          <div className="space-y-3">
            <div className="text-white/70">Nom de la monnaie</div>
            <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={currencyName} onChange={e=>setCurrencyName(e.target.value)} />
            <div className="text-white/70">Symbole</div>
            <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-32" value={currencySymbol} onChange={e=>setCurrencySymbol(e.target.value)} />
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveCurrency(currencyName); }}>Enregistrer nom</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveCurrencySymbol(currencySymbol); }}>Enregistrer symbole</button>
            </div>
          </div>
        )}
        {cat==='confessions' && (
          <div className="space-y-3">
            <div className="text-white/70">Autoriser les réponses</div>
            <label className="flex items-center gap-2 text-white/70">
              <input type="checkbox" checked={confessAllowReplies} onChange={e=>setConfessAllowReplies(e.target.checked)} /> Autoriser
            </label>
            <div className="text-white/70">SFW: Salons</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={confessSfw} onChange={e=>setConfessSfw(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <div className="text-white/70">NSFW: Salons</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={confessNsfw} onChange={e=>setConfessNsfw(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-white/70">Salon de logs
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={confessLogChannel} onChange={e=>setConfessLogChannel(e.target.value)}>
                  <option value="">—</option>
                  {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
              </label>
              <label className="text-white/70">Nom de thread
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={confessThreadNaming} onChange={e=>setConfessThreadNaming(e.target.value as any)}>
                  <option value="normal">Normal</option>
                  <option value="nsfw">NSFW</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveConfess(confessAllowReplies); }}>Enregistrer Réponses</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveConfessAdvanced(confessLogChannel, confessThreadNaming); }}>Enregistrer Avancé</button>
            </div>
          </div>
        )}
        {cat==='action-verite' && (
          <div className="space-y-3">
            <div className="text-white/70">SFW: Salons autorisés</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={tdSfw} onChange={e=>setTdSfw(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <div className="text-white/70">NSFW: Salons autorisés</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={tdNsfw} onChange={e=>setTdNsfw(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveTd(tdSfw, tdNsfw); }}>Enregistrer</button>
          </div>
        )}
        {cat==='levels' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-white/70">XP par message<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={xpMsg} onChange={e=>setXpMsg(Number(e.target.value))} /></label>
              <label className="text-white/70">XP par min vocal<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={xpVoice} onChange={e=>setXpVoice(Number(e.target.value))} /></label>
              <label className="text-white/70">Courbe base<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={levelBase} onChange={e=>setLevelBase(Number(e.target.value))} /></label>
              <label className="text-white/70">Courbe facteur<input type="number" step="0.01" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={levelFactor} onChange={e=>setLevelFactor(Number(e.target.value))} /></label>
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLevels(xpMsg, xpVoice, levelBase, levelFactor); }}>Enregistrer</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLevelsAdvanced(true, {}); }}>Activer</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLevelsAdvanced(false, {}); }}>Désactiver</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-white/70">Salon annonces niveau
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" onChange={async e=>{ await saveLevelsAdvanced(true, { levelUp: { channelId: e.target.value } }); }}>
                  <option value="">—</option>
                  {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
              </label>
              <label className="text-white/70">Salon annonces rôle
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" onChange={async e=>{ await saveLevelsAdvanced(true, { roleAward: { channelId: e.target.value } }); }}>
                  <option value="">—</option>
                  {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
              </label>
            </div>
          </div>
        )}
        {cat==='autothread' && (
          <div className="space-y-3">
            <div className="text-white/70">Salons</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={autoThreadChannels} onChange={e=>setAutoThreadChannels(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-white/70">Politique
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={autoThreadPolicy} onChange={e=>setAutoThreadPolicy(e.target.value)}>
                  <option value="new_messages">Nouveaux messages</option>
                  <option value="manual">Manuel</option>
                </select>
              </label>
              <label className="text-white/70">Archivage
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={autoThreadArchive} onChange={e=>setAutoThreadArchive(e.target.value)}>
                  <option value="1h">1 heure</option>
                  <option value="1d">1 jour</option>
                  <option value="3d">3 jours</option>
                  <option value="1w">1 semaine</option>
                </select>
              </label>
            </div>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveAutoThread(autoThreadChannels, autoThreadPolicy, autoThreadArchive); }}>Enregistrer</button>
          </div>
        )}
        {cat==='counting' && (
          <div className="space-y-3">
            <div className="text-white/70">Salons activés</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={countingChannels} onChange={e=>setCountingChannels(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveCounting(countingChannels); }}>Enregistrer</button>
          </div>
        )}
        {cat==='disboard' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-white/70">
              <input type="checkbox" checked={disboardReminders} onChange={e=>setDisboardReminders(e.target.checked)} /> Rappels activés
            </label>
            <div className="text-white/70">Salon de rappel</div>
            <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={disboardChannel} onChange={e=>setDisboardChannel(e.target.value)}>
              <option value="">—</option>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveDisboard(disboardReminders, disboardChannel); }}>Enregistrer</button>
          </div>
        )}
      </div>
    </div>
  );
}

