import React, { useEffect, useMemo, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { useApi } from '../store/api';

const TITLES: Record<string, string> = {
  moderation: 'Modération',
  levels: 'Niveaux',
  economie: 'Économie',
  'action-verite': 'Action / Vérité',
  logs: 'Journalisation',
  confessions: 'Confessions',
  autothread: 'Auto-threads',
  counting: 'Compteur',
  disboard: 'Disboard'
};

function RewardsEditor() {
  const { configs, fetchAll } = useApi();
  const { saveEconomyRewards } = useApi.getState() as any;
  const [msgMin, setMsgMin] = useState<number|''>('');
  const [msgMax, setMsgMax] = useState<number|''>('');
  const [vocMin, setVocMin] = useState<number|''>('');
  const [vocMax, setVocMax] = useState<number|''>('');
  useEffect(()=>{
    setMsgMin(Number.isFinite(configs?.economy?.rewards?.message?.min) ? configs.economy.rewards.message.min : '');
    setMsgMax(Number.isFinite(configs?.economy?.rewards?.message?.max) ? configs.economy.rewards.message.max : '');
    setVocMin(Number.isFinite(configs?.economy?.rewards?.voice?.min) ? configs.economy.rewards.voice.min : '');
    setVocMax(Number.isFinite(configs?.economy?.rewards?.voice?.max) ? configs.economy.rewards.voice.max : '');
  }, [configs]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-white/70">Argent texte min
          <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={msgMin as any} onChange={e=>setMsgMin(e.target.value===''?'':Number(e.target.value))} />
        </label>
        <label className="text-white/70">Argent texte max
          <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={msgMax as any} onChange={e=>setMsgMax(e.target.value===''?'':Number(e.target.value))} />
        </label>
        <label className="text-white/70">Argent vocal min
          <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={vocMin as any} onChange={e=>setVocMin(e.target.value===''?'':Number(e.target.value))} />
        </label>
        <label className="text-white/70">Argent vocal max
          <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={vocMax as any} onChange={e=>setVocMax(e.target.value===''?'':Number(e.target.value))} />
        </label>
      </div>
      <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
        if(!confirm('Confirmer la sauvegarde des récompenses ?')) return;
        const ok = await saveEconomyRewards(msgMin, msgMax, vocMin, vocMax);
        if (ok) await fetchAll();
      }}>Enregistrer récompenses</button>
    </div>
  );
}

function TdPromptsEditor({ mode }: { mode: 'sfw'|'nsfw' }) {
  const { configs, fetchAll, addTdPrompts, deleteTdPrompts, editTdPrompt } = useApi();
  const prompts = useMemo(() => (configs?.truthdare?.[mode]?.prompts || []), [configs, mode]);
  const [newType, setNewType] = useState<'action'|'verite'>('action');
  const [newLines, setNewLines] = useState('');
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [editMap, setEditMap] = useState<Record<number, string>>({});
  useEffect(()=>{ setSelected({}); setEditMap({}); }, [mode]);
  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-end">
        <label className="flex-1 text-white/70">Nouveaux prompts ({mode.toUpperCase()}) — 1 par ligne
          <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-32" value={newLines} onChange={e=>setNewLines(e.target.value)} />
        </label>
        <label className="text-white/70">Type
          <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={newType} onChange={e=>setNewType(e.target.value as any)}>
            <option value="action">Action</option>
            <option value="verite">Vérité</option>
          </select>
        </label>
        <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
          const lines = newLines.split('\n').map(s=>s.trim()).filter(Boolean);
          if (!lines.length) return;
          if(!confirm('Ajouter ces prompts ?')) return;
          const ok = await addTdPrompts(mode, newType, lines);
          if (ok) { setNewLines(''); await fetchAll(); }
        }}>Ajouter</button>
      </div>
      <div className="text-white/70">Prompts existants ({prompts.length})</div>
      <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
        {prompts.map((p:any)=>{
          const val = editMap[p.id] ?? p.text;
          return (
            <div key={p.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-1 text-white/60 text-sm">#{p.id}</div>
              <div className="col-span-2"><span className="inline-block text-xs px-2 py-1 rounded bg-white/10 text-white/70">{p.type}</span></div>
              <div className="col-span-7"><input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={val} onChange={e=>setEditMap(prev=>({ ...prev, [p.id]: e.target.value }))} /></div>
              <div className="col-span-1 flex justify-center"><input type="checkbox" checked={!!selected[p.id]} onChange={e=>setSelected(prev=>({ ...prev, [p.id]: e.target.checked }))} /></div>
              <div className="col-span-1"><button className="bg-white/5 border border-white/10 rounded-xl px-2 py-2 w-full" onClick={async()=>{
                const text = (editMap[p.id] ?? p.text).trim();
                if (!text || text === p.text) return;
                const ok = await editTdPrompt(mode, p.id, text);
                if (ok) await fetchAll();
              }}>💾</button></div>
            </div>
          );
        })}
      </div>
      <div>
        <button className="bg-red-600/20 border border-red-600/30 text-red-200 rounded-xl px-3 py-2" onClick={async()=>{
          const ids = Object.entries(selected).filter(([,v])=>v).map(([k])=>Number(k)).filter(n=>Number.isFinite(n));
          if (!ids.length) return;
          if(!confirm(`Supprimer ${ids.length} prompt(s) ?`)) return;
          const ok = await deleteTdPrompts(mode, ids);
          if (ok) await fetchAll();
        }}>Supprimer sélection</button>
      </div>
    </div>
  );
}

export default function CategoryPage() {
  const { cat = '', view = '' } = useParams();
  const { fetchAll, configs, meta, fetchMeta, saveLogs, saveAutoKickRole, saveCurrency, saveConfess, saveTd, saveLevels, saveAutoThread, saveCounting, saveDisboard, saveAutoKickAdvanced, saveLogsAdvanced, saveConfessAdvanced, saveLevelsAdvanced, saveCurrencySymbol, saveLevelsExtra, uploadBase64, saveEconomyAction, saveEconomyRewards, resetLevels } = useApi();
  useEffect(() => { fetchAll(); fetchMeta(); }, []);

  const title = TITLES[cat] || cat;
  const [logChannelMsgs, setLogChannelMsgs] = useState('');
  const [logsEnabled, setLogsEnabled] = useState(false);
  const [logsPseudo, setLogsPseudo] = useState(false);
  const [logsEmoji, setLogsEmoji] = useState('📝');
  const [logChannels, setLogChannels] = useState<{[k:string]:string}>({});
  const [logCats, setLogCats] = useState<{[k:string]:boolean}>({});
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [autoKickRole, setAutoKickRole] = useState('');
  const [autoKickEnabled, setAutoKickEnabled] = useState(false);
  const [autoKickDelay, setAutoKickDelay] = useState(0);
  const autoKickHours = Math.round((autoKickDelay/3600000) * 100) / 100;
  const autoKickDays = Math.round((autoKickDelay/86400000) * 100) / 100;
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
  // Added advanced levels state
  const [xpMsgMin, setXpMsgMin] = useState<number|''>('');
  const [xpMsgMax, setXpMsgMax] = useState<number|''>('');
  const [xpVocMin, setXpVocMin] = useState<number|''>('');
  const [xpVocMax, setXpVocMax] = useState<number|''>('');
  const [msgCd, setMsgCd] = useState<number|''>('');
  const [vocCd, setVocCd] = useState<number|''>('');
  const [tplLevelUp, setTplLevelUp] = useState('');
  const [tplRole, setTplRole] = useState('');
  const [tplTitle, setTplTitle] = useState('');
  const [tplBaseline, setTplBaseline] = useState('');
  const [bgDefault, setBgDefault] = useState('');
  const [bgFemale, setBgFemale] = useState('');
  const [bgCertified, setBgCertified] = useState('');
  const [bgPrestigeBlue, setBgPrestigeBlue] = useState('');
  const [bgPrestigeRose, setBgPrestigeRose] = useState('');
  // Current (saved) backgrounds for preview comparison
  const [curBgDefault, setCurBgDefault] = useState('');
  const [curBgFemale, setCurBgFemale] = useState('');
  const [curBgCertified, setCurBgCertified] = useState('');
  const [curBgPrestigeBlue, setCurBgPrestigeBlue] = useState('');
  const [curBgPrestigeRose, setCurBgPrestigeRose] = useState('');
  const [cardKey, setCardKey] = useState<'default'|'female'|'certified'|'prestigeBlue'|'prestigeRose'>('default');
  const [autoThreadChannels, setAutoThreadChannels] = useState<string[]>([]);
  const [autoThreadPolicy, setAutoThreadPolicy] = useState('new_messages');
  const [autoThreadArchive, setAutoThreadArchive] = useState('1d');
  const [countingChannels, setCountingChannels] = useState<string[]>([]);
  const [disboardReminders, setDisboardReminders] = useState(false);
  const [disboardChannel, setDisboardChannel] = useState('');
  // Economy Actions state
  const [actKey, setActKey] = useState('work');
  const [actMoneyMin, setActMoneyMin] = useState<number|''>('');
  const [actMoneyMax, setActMoneyMax] = useState<number|''>('');
  const [actKarma, setActKarma] = useState<'none'|'charm'|'perversion'>('none');
  const [actKarmaDelta, setActKarmaDelta] = useState<number|''>('');
  const [actCooldown, setActCooldown] = useState<number|''>('');
  const [msgSuccess, setMsgSuccess] = useState('');
  const [msgFail, setMsgFail] = useState('');
  const [gifSuccess, setGifSuccess] = useState('');
  const [gifFail, setGifFail] = useState('');
  // New fields merged into Actions
  const [failKarmaDelta, setFailKarmaDelta] = useState<number|''>('');
  const [failMoneyMin, setFailMoneyMin] = useState<number|''>('');
  const [failMoneyMax, setFailMoneyMax] = useState<number|''>('');
  const [partnerMoneyShare, setPartnerMoneyShare] = useState<number|''>('');
  const [partnerKarmaShare, setPartnerKarmaShare] = useState<number|''>('');
  const [actZones, setActZones] = useState<string>('');
  const dashKey = useMemo(() => {
    try {
      const urlKey = new URLSearchParams(window.location.search).get('key');
      const lsKey = localStorage.getItem('DASHBOARD_KEY');
      const k = urlKey || lsKey || '';
      if (k) localStorage.setItem('DASHBOARD_KEY', k);
      return k;
    } catch { return ''; }
  }, []);
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
    // populate advanced levels (fallbacks to existing settings)
    const msgMin = configs.levels?.xpMessageMin;
    const msgMax = configs.levels?.xpMessageMax;
    const vocMin = configs.levels?.xpVoiceMin;
    const vocMax = configs.levels?.xpVoiceMax;
    const pm = Number(configs.levels?.xpPerMessage ?? 0) || 0;
    const pv = Number(configs.levels?.xpPerVoiceMinute ?? 0) || 0;
    setXpMsgMin((typeof msgMin === 'number') ? msgMin : (pm || ''));
    setXpMsgMax((typeof msgMax === 'number') ? msgMax : (pm || ''));
    setXpVocMin((typeof vocMin === 'number') ? vocMin : (pv || ''));
    setXpVocMax((typeof vocMax === 'number') ? vocMax : (pv || ''));
    setMsgCd(Number(configs.levels?.messageCooldownSec ?? '') as any);
    setVocCd(Number(configs.levels?.voiceCooldownSec ?? '') as any);
    setTplLevelUp(String(configs.levels?.announce?.levelUp?.template || ''));
    setTplRole(String(configs.levels?.announce?.roleAward?.template || ''));
    const bgs = configs.levels?.cards?.backgrounds || {};
    setBgDefault(String(bgs.default || ''));
    setBgFemale(String(bgs.female || ''));
    setBgCertified(String(bgs.certified || ''));
    setBgPrestigeBlue(String(bgs.prestigeBlue || ''));
    setBgPrestigeRose(String(bgs.prestigeRose || ''));
    // current saved versions
    setCurBgDefault(String(bgs.default || ''));
    setCurBgFemale(String(bgs.female || ''));
    setCurBgCertified(String(bgs.certified || ''));
    setCurBgPrestigeBlue(String(bgs.prestigeBlue || ''));
    setCurBgPrestigeRose(String(bgs.prestigeRose || ''));
    setAutoThreadChannels(Array.isArray(configs.autothread?.channels) ? configs.autothread.channels : []);
    setAutoThreadPolicy(String(configs.autothread?.policy || 'new_messages'));
    setAutoThreadArchive(String(configs.autothread?.archivePolicy || '1d'));
    setCountingChannels(Array.isArray(configs.counting?.channels) ? configs.counting.channels : []);
    setDisboardReminders(Boolean(configs.disboard?.remindersEnabled));
    setDisboardChannel(String(configs.disboard?.remindChannelId || ''));
  }, [configs]);
  // Prime action fields when action key changes
  useEffect(() => {
    if (!configs) return;
    try {
      const c = configs.economy?.actions?.config?.[actKey] || {};
      setActMoneyMin(Number.isFinite(c.moneyMin)?c.moneyMin:'');
      setActMoneyMax(Number.isFinite(c.moneyMax)?c.moneyMax:'');
      setActKarma(['none','charm','perversion'].includes(c.karma)?c.karma:'none');
      setActKarmaDelta(Number.isFinite(c.karmaDelta)?c.karmaDelta:'');
      setActCooldown(Number.isFinite(c.cooldown)?c.cooldown:'');
      setActZones(Array.isArray(c.zones) ? c.zones.join(', ') : '');
      const m = configs.economy?.actions?.messages?.[actKey] || { success: [], fail: [] };
      setMsgSuccess((m.success||[]).join('\n'));
      setMsgFail((m.fail||[]).join('\n'));
      const g = configs.economy?.actions?.gifs?.[actKey] || { success: [], fail: [] };
      setGifSuccess((g.success||[]).join('\n'));
      setGifFail((g.fail||[]).join('\n'));
      // New merged fields
      setFailKarmaDelta(Number.isFinite(c.failKarmaDelta)?c.failKarmaDelta:'');
      setFailMoneyMin(Number.isFinite(c.failMoneyMin)?c.failMoneyMin:'');
      setFailMoneyMax(Number.isFinite(c.failMoneyMax)?c.failMoneyMax:'');
      setPartnerMoneyShare(Number.isFinite(c.partnerMoneyShare)?c.partnerMoneyShare:'');
      setPartnerKarmaShare(Number.isFinite(c.partnerKarmaShare)?c.partnerKarmaShare:'');
      // Auto-prefill defaults (messages/zones) if missing
      const needMessages = (!Array.isArray(m.success) || m.success.length===0) || (!Array.isArray(m.fail) || m.fail.length===0);
      const needZones = (!Array.isArray(c.zones) || c.zones.length===0);
      if (needMessages || needZones) {
        const key = (()=>{ try { return new URLSearchParams(window.location.search).get('key') || localStorage.getItem('DASHBOARD_KEY') || ''; } catch { return ''; } })();
        const url = `/api/economy/action-defaults?action=${encodeURIComponent(actKey)}${key?`&key=${encodeURIComponent(key)}`:''}`;
        fetch(url).then(r=>r.json()).then((d)=>{
          try {
            if (needMessages) {
              if ((!m.success || m.success.length===0) && Array.isArray(d.success) && d.success.length) setMsgSuccess(d.success.join('\n'));
              if ((!m.fail || m.fail.length===0) && Array.isArray(d.fail) && d.fail.length) setMsgFail(d.fail.join('\n'));
            }
            if (needZones && Array.isArray(d.zones) && d.zones.length) setActZones(d.zones.join(', '));
          } catch {}
        }).catch(()=>{});
      }
    } catch {}
  }, [actKey, configs]);

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
              <label className="text-white/70">Emoji global
                <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={logsEmoji} onChange={e=>setLogsEmoji(e.target.value)} />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-white/70 mt-2">Catégories</div>
              <button className="text-white/60 text-sm underline" onClick={()=>setLogsCollapsed(v=>!v)}>{logsCollapsed ? 'Déployer' : 'Réduire'}</button>
            </div>
            <div className="space-y-2">
              {['joinleave','messages','threads','backup','moderation','economy','voice','boosts'].map((k)=>{
                const collapsed = logsCollapsed;
                const actionsOptions: Record<string,string[]> = {
                  joinleave: ['join','leave'],
                  messages: ['delete','edit'],
                  threads: ['create','delete'],
                  backup: ['backup','restore'],
                  moderation: ['ban','unban','kick','mute','unmute','warn','purge','massban','masskick'],
                  economy: ['work','fish','give','steal','shop','daily'],
                  voice: ['join','leave','move'],
                  boosts: ['boost','unboost']
                };
                const selectedActs = (configs?.logs?.actions?.[k] || []) as string[];
                return (
                  <div key={k} className={`grid ${collapsed ? 'md:grid-cols-2' : 'md:grid-cols-5'} gap-2 items-center`}>
                    <div className="text-white/70">{k}</div>
                    {!collapsed && (
                      <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={Boolean(logCats[k])} onChange={e=>setLogCats(prev=>({ ...prev, [k]: e.target.checked }))} /> ON</label>
                    )}
                    {!collapsed && (
                      <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={String(logChannels[k]||'')} onChange={e=>setLogChannels(prev=>({ ...prev, [k]: e.target.value }))}>
                        <option value="">—</option>
                        {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                      </select>
                    )}
                    <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" placeholder="Emoji (ex: 🔔)" value={(configs?.logs?.emojis?.[k] || '')} onChange={e=>{
                      const v = e.target.value; const next = { ...(configs?.logs?.emojis||{}) }; (next as any)[k] = v; (configs as any).logs = { ...(configs as any).logs, emojis: next }; setLogCats(prev=>({ ...prev })); }} />
                    {!collapsed && (
                      <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full min-h-[42px]" value={selectedActs} onChange={e=>{
                        const vals = Array.from(e.target.selectedOptions).map(o=>o.value);
                        const next = { ...(configs?.logs?.actions||{}) }; (next as any)[k] = vals; (configs as any).logs = { ...(configs as any).logs, actions: next }; setLogCats(prev=>({ ...prev }));
                      }}>
                        {(actionsOptions[k]||[]).map(a => (<option key={a} value={a}>{a}</option>))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer la sauvegarde des réglages de logs ?')) return; await saveLogsAdvanced(logsEnabled, logsPseudo, logsEmoji); }}>Enregistrer global</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const emojis:any = configs?.logs?.emojis || {};
                const actions:any = configs?.logs?.actions || {};
                if(!confirm('Confirmer la sauvegarde des catégories, salons, emojis et actions ?')) return;
                const ok = await (useApi.getState().saveLogsPerCat as any)(logCats, logChannels, emojis, actions);
                if (ok) await fetchAll();
              }}>Enregistrer</button>
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
              <label className="text-white/70">Délai (heures)
                <input type="number" step="0.25" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={autoKickHours} onChange={e=>{ const h = Number(e.target.value)||0; setAutoKickDelay(Math.max(0, Math.round(h*3600000))); }} />
              </label>
              <label className="text-white/70">Délai (jours)
                <input type="number" step="0.25" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={autoKickDays} onChange={e=>{ const d = Number(e.target.value)||0; setAutoKickDelay(Math.max(0, Math.round(d*86400000))); }} />
              </label>
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer le rôle AutoKick ?')) return; await saveAutoKickRole(autoKickRole); }}>Enregistrer rôle</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer les réglages AutoKick ?')) return; await saveAutoKickAdvanced(autoKickEnabled, autoKickDelay); }}>Enregistrer réglages</button>
            </div>
          </div>
        )}
        {cat==='economie' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <NavLink to="/config/economie/overview" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>Devise</NavLink>
              <NavLink to="/config/economie/actions" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>Actions</NavLink>
              <NavLink to="/config/economie/gifs" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>GIFs</NavLink>
            </div>
          </div>
        )}
        {cat==='economie' && (!view || view==='overview') && (
          <div className="space-y-3">
            <div className="text-white/70">Nom de la monnaie</div>
            <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={currencyName} onChange={e=>setCurrencyName(e.target.value)} />
            <div className="text-white/70">Symbole</div>
            <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-32" value={currencySymbol} onChange={e=>setCurrencySymbol(e.target.value)} />
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer le nom de la devise ?')) return; await saveCurrency(currencyName); }}>Enregistrer nom</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer le symbole de la devise ?')) return; await saveCurrencySymbol(currencySymbol); }}>Enregistrer symbole</button>
            </div>
            <div className="mt-4 text-white/70 font-medium">Récompenses argent</div>
            <RewardsEditor />
          </div>
        )}
        {cat==='economie' && view==='actions' && (
          <div className="space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <label className="text-white/70">Action
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKey} onChange={e=>setActKey(e.target.value)}>
                  {(Object.keys(configs?.economy?.actions?.config||{})).map(k => (<option key={k} value={k}>{k}</option>))}
                </select>
              </label>
              <label className="text-white/70">Argent min (succès)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actMoneyMin as any} onChange={e=>setActMoneyMin(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">Argent max (succès)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actMoneyMax as any} onChange={e=>setActMoneyMax(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">Karma (type)
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKarma} onChange={e=>setActKarma(e.target.value as any)}>
                  <option value="none">none</option>
                  <option value="charm">charm</option>
                  <option value="perversion">perversion</option>
                </select>
              </label>
              <label className="text-white/70">Δ Karma (succès)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKarmaDelta as any} onChange={e=>setActKarmaDelta(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">Cooldown (s)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actCooldown as any} onChange={e=>setActCooldown(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70 md:col-span-3">Zones (séparées par une virgule)
                <input type="text" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actZones} onChange={e=>setActZones(e.target.value)} placeholder="ex: cou, épaules, nuque" />
              </label>
              <label className="text-white/70">Δ Karma (échec)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={failKarmaDelta as any} onChange={e=>setFailKarmaDelta(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">Argent min (échec)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={failMoneyMin as any} onChange={e=>setFailMoneyMin(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">Argent max (échec)
                <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={failMoneyMax as any} onChange={e=>setFailMoneyMax(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">% gains partenaire (argent)
                <input type="number" step="0.1" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={partnerMoneyShare as any} onChange={e=>setPartnerMoneyShare(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">% karma partenaire
                <input type="number" step="0.1" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={partnerKarmaShare as any} onChange={e=>setPartnerKarmaShare(e.target.value===''?'':Number(e.target.value))} />
              </label>
            </div>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              <label className="text-white/70">Messages succès (1 par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-32" value={msgSuccess} onChange={e=>setMsgSuccess(e.target.value)} />
              </label>
              <label className="text-white/70">Messages échec (1 par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-32" value={msgFail} onChange={e=>setMsgFail(e.target.value)} />
              </label>
              <label className="text-white/70">GIF succès (1 URL par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-32" value={gifSuccess} onChange={e=>setGifSuccess(e.target.value)} />
              </label>
              <label className="text-white/70">GIF échec (1 URL par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-32" value={gifFail} onChange={e=>setGifFail(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const payload:any = { action: actKey, config: {}, messages: {}, gifs: {} };
                if (actMoneyMin !== '') payload.config.moneyMin = Number(actMoneyMin);
                if (actMoneyMax !== '') payload.config.moneyMax = Number(actMoneyMax);
                payload.config.karma = actKarma;
                if (actKarmaDelta !== '') payload.config.karmaDelta = Number(actKarmaDelta);
                if (actCooldown !== '') payload.config.cooldown = Number(actCooldown);
                // zones
                const z = actZones.split(',').map(s=>s.trim()).filter(Boolean);
                if (z.length) payload.config.zones = z;
                if (failKarmaDelta !== '') payload.config.failKarmaDelta = Number(failKarmaDelta);
                if (failMoneyMin !== '') payload.config.failMoneyMin = Number(failMoneyMin);
                if (failMoneyMax !== '') payload.config.failMoneyMax = Number(failMoneyMax);
                if (partnerMoneyShare !== '') payload.config.partnerMoneyShare = Number(partnerMoneyShare);
                if (partnerKarmaShare !== '') payload.config.partnerKarmaShare = Number(partnerKarmaShare);
                payload.messages.success = msgSuccess.split('\n').map(s=>s.trim()).filter(Boolean);
                payload.messages.fail = msgFail.split('\n').map(s=>s.trim()).filter(Boolean);
                payload.gifs.success = gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean);
                payload.gifs.fail = gifFail.split('\n').map(s=>s.trim()).filter(Boolean);
                if(!confirm('Confirmer la sauvegarde de cette action ?')) return;
                await saveEconomyAction(actKey, payload);
              }}>Enregistrer l'action</button>
            </div>
          </div>
        )}
        {cat==='economie' && view==='gifs' && (
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">Action
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKey} onChange={e=>setActKey(e.target.value)}>
                  {(Object.keys(configs?.economy?.actions?.config||{})).map(k => (<option key={k} value={k}>{k}</option>))}
                </select>
              </label>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">GIF succès (1 URL par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-40" value={gifSuccess} onChange={e=>setGifSuccess(e.target.value)} />
              </label>
              <label className="text-white/70">GIF échec (1 URL par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-40" value={gifFail} onChange={e=>setGifFail(e.target.value)} />
              </label>
            </div>
            <div className="text-white/70 font-medium mt-2">Aperçu GIFs — Succès</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,8).map((u,idx)=>(
                <GifPreview key={'gs'+idx} url={u} onDelete={()=>{
                  setGifSuccess(gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean).filter(x=>x!==u).join('\n'));
                }} />
              ))}
            </div>
            <div className="text-white/70 font-medium mt-2">Aperçu GIFs — Échec</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gifFail.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,8).map((u,idx)=>(
                <GifPreview key={'gf'+idx} url={u} onDelete={()=>{
                  setGifFail(gifFail.split('\n').map(s=>s.trim()).filter(Boolean).filter(x=>x!==u).join('\n'));
                }} />
              ))}
            </div>
            <div className="mt-3">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const payload:any = { action: actKey, gifs: {} };
                payload.gifs.success = gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean);
                payload.gifs.fail = gifFail.split('\n').map(s=>s.trim()).filter(Boolean);
                if(!confirm('Confirmer la sauvegarde des GIFs ?')) return;
                await saveEconomyAction(actKey, payload);
              }}>Enregistrer GIFs</button>
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
            <div className="flex gap-2">
              <NavLink to="/config/action-verite/overview" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>Salons</NavLink>
              <NavLink to="/config/action-verite/sfw" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>Prompts SFW</NavLink>
              <NavLink to="/config/action-verite/nsfw" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>Prompts NSFW</NavLink>
            </div>
            {(!view || view==='overview') && (
              <>
                <div className="text-white/70">SFW: Salons autorisés</div>
                <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={tdSfw} onChange={e=>setTdSfw(Array.from(e.target.selectedOptions).map(o=>o.value))}>
                  {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
                <div className="text-white/70 mt-2">NSFW: Salons autorisés</div>
                <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={tdNsfw} onChange={e=>setTdNsfw(Array.from(e.target.selectedOptions).map(o=>o.value))}>
                  {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
                <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 mt-2" onClick={async()=>{ if(!confirm('Confirmer la sauvegarde Action/Vérité ?')) return; await saveTd(tdSfw, tdNsfw); }}>Enregistrer</button>
              </>
            )}
            {view==='sfw' && (<TdPromptsEditor mode="sfw" />)}
            {view==='nsfw' && (<TdPromptsEditor mode="nsfw" />)}
          </div>
        )}
        {cat==='levels' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <NavLink to="/config/levels/overview" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>Level</NavLink>
              <NavLink to="/config/levels/cards" className={({isActive})=>`px-3 py-2 rounded-xl border ${isActive?'bg-white/10 border-white/20 text-white':'bg-white/5 border-white/10 text-white/70'}`}>Carte</NavLink>
            </div>
            {(!view || view==='overview') && (
            <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-white/70">Courbe base<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={levelBase} onChange={e=>setLevelBase(Number(e.target.value))} /></label>
              <label className="text-white/70">Courbe facteur<input type="number" step="0.01" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={levelFactor} onChange={e=>setLevelFactor(Number(e.target.value))} /></label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="text-white/70">Min/message<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={xpMsgMin as any} onChange={e=>setXpMsgMin(e.target.value===''?'':Number(e.target.value))} /></label>
              <label className="text-white/70">Max/message<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={xpMsgMax as any} onChange={e=>setXpMsgMax(e.target.value===''?'':Number(e.target.value))} /></label>
              <label className="text-white/70">Cooldown msg (s)<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={msgCd as any} onChange={e=>setMsgCd(e.target.value===''?'':Number(e.target.value))} /></label>
              <label className="text-white/70">Min/vocal<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={xpVocMin as any} onChange={e=>setXpVocMin(e.target.value===''?'':Number(e.target.value))} /></label>
              <label className="text-white/70">Max/vocal<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={xpVocMax as any} onChange={e=>setXpVocMax(e.target.value===''?'':Number(e.target.value))} /></label>
              <label className="text-white/70">Cooldown vocal (s)<input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={vocCd as any} onChange={e=>setVocCd(e.target.value===''?'':Number(e.target.value))} /></label>
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer la sauvegarde niveaux (base/facteur/xp) ?')) return; await saveLevels(xpMsg, xpVoice, levelBase, levelFactor); }}>Enregistrer</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const payload:any = {};
                if (xpMsgMin !== '') payload.xpMessageMin = Number(xpMsgMin);
                if (xpMsgMax !== '') payload.xpMessageMax = Number(xpMsgMax);
                if (xpVocMin !== '') payload.xpVoiceMin = Number(xpVocMin);
                if (xpVocMax !== '') payload.xpVoiceMax = Number(xpVocMax);
                if (msgCd !== '') payload.messageCooldownSec = Number(msgCd);
                if (vocCd !== '') payload.voiceCooldownSec = Number(vocCd);
                if(!confirm('Confirmer la sauvegarde des réglages avancés ?')) return;
                await saveLevelsExtra(payload);
              }}>Enregistrer avancé</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLevelsAdvanced(true, {}); }}>Activer</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLevelsAdvanced(false, {}); }}>Désactiver</button>
            </div>
            </>
            )}
            {view==='cards' && (
            <>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-4">
              <div className="text-white/70 font-medium">Carte actuelle vs prévisualisation</div>
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-sm">Carte:</span>
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={cardKey} onChange={e=>setCardKey(e.target.value as any)}>
                  <option value="default">Défaut</option>
                  <option value="female">Féminin</option>
                  <option value="certified">Certifié</option>
                  <option value="prestigeBlue">Prestige bleu</option>
                  <option value="prestigeRose">Prestige rose</option>
                  <option value="role_default">Rôle (Défaut)</option>
                  <option value="role_female">Rôle (Féminin)</option>
                  <option value="role_certified">Rôle (Certifié)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-white/60 text-sm mb-2">Actuelle</div>
                  {(() => {
                    const isRole = cardKey.startsWith('role_');
                    const baseKey = isRole ? cardKey.replace('role_','') : cardKey;
                    const variant = (baseKey==='certified') ? 'certified' : (baseKey==='female' || baseKey==='prestigeRose') ? 'rose' : 'blue';
                    const base = `/api/levels/preview?style=${encodeURIComponent(variant)}&memberName=${encodeURIComponent('Alyssa')}&level=${encodeURIComponent(38)}&roleName=${encodeURIComponent('Étoile du Serveur')}`;
                    const url = (dashKey ? (base + `&key=${encodeURIComponent(dashKey)}`) : base) + (isRole ? '&mode=role' : '');
                    return (
                      <div className="aspect-video w-full bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <img src={url} className="w-full h-full object-contain" />
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <div className="text-white/60 text-sm mb-2">Prévisualisation</div>
                  {(() => {
                    const isRole = cardKey.startsWith('role_');
                    const baseKey = isRole ? cardKey.replace('role_','') : cardKey;
                    const variant = (baseKey==='certified') ? 'certified' : (baseKey==='female' || baseKey==='prestigeRose') ? 'rose' : 'blue';
                    const params = new URLSearchParams();
                    params.set('style', variant);
                    params.set('memberName', 'Alyssa');
                    params.set('level', String(38));
                    params.set('roleName', 'Étoile du Serveur');
                    if (tplTitle) params.set('title', tplTitle);
                    if (tplLevelUp) params.set('subtitle', tplLevelUp);
                    if (tplRole) params.set('roleLine', tplRole);
                    if (tplBaseline) params.set('baseline', tplBaseline);
                    // Live background override
                    const map:any={default:bgDefault,female:bgFemale,certified:bgCertified,rose:bgPrestigeRose,blue:bgPrestigeBlue,prestigeBlue:bgPrestigeBlue,prestigeRose:bgPrestigeRose};
                    const bgUrl = map[baseKey] || map[variant];
                    if (bgUrl) params.set('bg', bgUrl);
                    if (dashKey) params.set('key', dashKey);
                    if (isRole) params.set('mode','role');
                    // cache-bust on state changes
                    params.set('ts', String(Date.now()));
                    const url = `/api/levels/preview?${params.toString()}`;
                    return (
                      <div className="aspect-video w-full bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <img src={url} className="w-full h-full object-contain" />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
              <div className="text-white/70 font-medium">Cartes (URL ou upload)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-white/70">Fond par défaut
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={bgDefault} onChange={e=>setBgDefault(e.target.value)} />
                  {bgDefault && (<img src={bgDefault.startsWith('http')?bgDefault:(bgDefault.startsWith('/')?window.location.origin+bgDefault:bgDefault)} className="mt-2 h-16 w-full object-cover rounded" />)}
                  <input type="file" accept="image/*" className="mt-2 text-white/70" onChange={async e=>{ const f=e.target.files?.[0]; if (!f) return; const fr=new FileReader(); fr.onloadend=async()=>{ const url=await uploadBase64(f.name, String(fr.result||'')); if (url) setBgDefault(url); }; fr.readAsDataURL(f); }} />
                </label>
                <label className="text-white/70">Fond féminin
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={bgFemale} onChange={e=>setBgFemale(e.target.value)} />
                  {bgFemale && (<img src={bgFemale.startsWith('http')?bgFemale:(bgFemale.startsWith('/')?window.location.origin+bgFemale:bgFemale)} className="mt-2 h-16 w-full object-cover rounded" />)}
                  <input type="file" accept="image/*" className="mt-2 text-white/70" onChange={async e=>{ const f=e.target.files?.[0]; if (!f) return; const fr=new FileReader(); fr.onloadend=async()=>{ const url=await uploadBase64(f.name, String(fr.result||'')); if (url) setBgFemale(url); }; fr.readAsDataURL(f); }} />
                </label>
                <label className="text-white/70">Fond certifié
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={bgCertified} onChange={e=>setBgCertified(e.target.value)} />
                  {bgCertified && (<img src={bgCertified.startsWith('http')?bgCertified:(bgCertified.startsWith('/')?window.location.origin+bgCertified:bgCertified)} className="mt-2 h-16 w-full object-cover rounded" />)}
                  <input type="file" accept="image/*" className="mt-2 text-white/70" onChange={async e=>{ const f=e.target.files?.[0]; if (!f) return; const fr=new FileReader(); fr.onloadend=async()=>{ const url=await uploadBase64(f.name, String(fr.result||'')); if (url) setBgCertified(url); }; fr.readAsDataURL(f); }} />
                </label>
                <label className="text-white/70">Prestige bleu
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={bgPrestigeBlue} onChange={e=>setBgPrestigeBlue(e.target.value)} />
                  {bgPrestigeBlue && (<img src={bgPrestigeBlue.startsWith('http')?bgPrestigeBlue:(bgPrestigeBlue.startsWith('/')?window.location.origin+bgPrestigeBlue:bgPrestigeBlue)} className="mt-2 h-16 w-full object-cover rounded" />)}
                  <input type="file" accept="image/*" className="mt-2 text-white/70" onChange={async e=>{ const f=e.target.files?.[0]; if (!f) return; const fr=new FileReader(); fr.onloadend=async()=>{ const url=await uploadBase64(f.name, String(fr.result||'')); if (url) setBgPrestigeBlue(url); }; fr.readAsDataURL(f); }} />
                </label>
                <label className="text-white/70">Prestige rose
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={bgPrestigeRose} onChange={e=>setBgPrestigeRose(e.target.value)} />
                  {bgPrestigeRose && (<img src={bgPrestigeRose.startsWith('http')?bgPrestigeRose:(bgPrestigeRose.startsWith('/')?window.location.origin+bgPrestigeRose:bgPrestigeRose)} className="mt-2 h-16 w-full object-cover rounded" />)}
                  <input type="file" accept="image/*" className="mt-2 text-white/70" onChange={async e=>{ const f=e.target.files?.[0]; if (!f) return; const fr=new FileReader(); fr.onloadend=async()=>{ const url=await uploadBase64(f.name, String(fr.result||'')); if (url) setBgPrestigeRose(url); }; fr.readAsDataURL(f); }} />
                </label>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
              <div className="text-white/70 font-medium">Templates de texte</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-white/70">Titre
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={tplTitle} onChange={e=>setTplTitle(e.target.value)} placeholder="ANNONCE DE PRESTIGE" />
                </label>
                <label className="text-white/70">Template Annonce Niveau
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={tplLevelUp} onChange={e=>setTplLevelUp(e.target.value)} placeholder="vient de franchir un nouveau cap !" />
                </label>
                <label className="text-white/70">Template Annonce Rôle
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={tplRole} onChange={e=>setTplRole(e.target.value)} placeholder="Rôle obtenu : {role}" />
                </label>
                <label className="text-white/70">Baseline
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={tplBaseline} onChange={e=>setTplBaseline(e.target.value)} placeholder="💎 CONTINUE TON ASCENSION… 💎" />
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="bg-brand-cyan/20 border border-brand-cyan/40 rounded-xl px-3 py-2" onClick={async()=>{
                const ok = confirm('Confirmer la sauvegarde des cartes et templates ?');
                if (!ok) return;
                const cards:any = { backgrounds: {} };
                if (bgDefault) cards.backgrounds.default = bgDefault;
                if (bgFemale) cards.backgrounds.female = bgFemale;
                if (bgCertified) cards.backgrounds.certified = bgCertified;
                if (bgPrestigeBlue) cards.backgrounds.prestigeBlue = bgPrestigeBlue;
                if (bgPrestigeRose) cards.backgrounds.prestigeRose = bgPrestigeRose;
                await saveLevelsExtra({ cards, announce: { levelUp: { template: tplLevelUp }, roleAward: { template: tplRole } } });
              }}>Confirmer et sauvegarder</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const ok = confirm('Réinitialiser les cartes (fonds et templates) sur le bot ?');
                if (!ok) return;
                const done = await resetLevels();
                if (done) {
                  await fetchAll();
                }
              }}>Réinitialiser</button>
            </div>
            </>
            )}
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
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer la sauvegarde Auto-threads ?')) return; await saveAutoThread(autoThreadChannels, autoThreadPolicy, autoThreadArchive); }}>Enregistrer</button>
          </div>
        )}
        {cat==='counting' && (
          <div className="space-y-3">
            <div className="text-white/70">Salons activés</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={countingChannels} onChange={e=>setCountingChannels(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer la sauvegarde Compteur ?')) return; await saveCounting(countingChannels); }}>Enregistrer</button>
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
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer la sauvegarde Disboard ?')) return; await saveDisboard(disboardReminders, disboardChannel); }}>Enregistrer</button>
          </div>
        )}
      </div>
    </div>
  );
}

function GifPreview({ url, onDelete }: { url: string; onDelete: () => void }) {
  const [meta, setMeta] = React.useState<{ url: string; contentType: string }|null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const key = (()=>{ try { return new URLSearchParams(window.location.search).get('key') || localStorage.getItem('DASHBOARD_KEY') || ''; } catch { return ''; } })();
        const res = await fetch(`/api/proxy?meta=1&url=${encodeURIComponent(url)}${key?`&key=${encodeURIComponent(key)}`:''}`);
        const j = await res.json();
        if (!alive) return;
        if (j && j.url) setMeta({ url: j.url, contentType: String(j.contentType||'') });
        else setMeta({ url, contentType: '' });
      } catch { setMeta({ url, contentType: '' }); }
    })();
    return () => { alive = false; };
  }, [url]);
  const isVideo = (meta?.contentType||'').startsWith('video/');
  const key = (()=>{ try { return new URLSearchParams(window.location.search).get('key') || localStorage.getItem('DASHBOARD_KEY') || ''; } catch { return ''; } })();
  const baseSrc = meta?.url ? `/api/proxy?url=${encodeURIComponent(meta.url)}` : `/api/proxy?url=${encodeURIComponent(url)}`;
  const src = `${baseSrc}${key?`&key=${encodeURIComponent(key)}`:''}`;
  return (
    <div className="relative group">
      {isVideo ? (
        <video src={src} className="w-full h-24 object-cover rounded border border-white/10" autoPlay loop muted playsInline />
      ) : (
        <img src={src} className="w-full h-24 object-cover rounded border border-white/10" onError={(e)=>{ (e.currentTarget as HTMLImageElement).style.opacity='0.3'; }} />
      )}
      <button className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100" onClick={onDelete}>Suppr</button>
    </div>
  );
}

