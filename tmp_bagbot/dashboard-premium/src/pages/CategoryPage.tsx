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
  disboard: 'Disboard',
  tickets: 'Tickets',
  booster: 'Booster'
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
          <textarea className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full h-32" value={newLines} onChange={e=>setNewLines(e.target.value)} />
        </label>
        <label className="text-white/70">Type
          <select className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={newType} onChange={e=>setNewType(e.target.value as any)}>
            <option value="action">Action</option>
            <option value="verite">Vérité</option>
          </select>
        </label>
        <button className="bg-transparent border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
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
  const { fetchAll, configs, meta, fetchMeta, saveLogs, saveAutoKickRole, saveCurrency, saveConfess, saveTd, saveLevels, saveAutoThread, saveCounting, saveDisboard, saveAutoKickAdvanced, saveLogsAdvanced, saveConfessAdvanced, saveLevelsAdvanced, saveCurrencySymbol, saveLevelsExtra, uploadBase64, saveEconomyAction, saveEconomyRewards, resetLevels, saveTickets, saveBooster } = useApi();
  useEffect(() => { fetchAll(); fetchMeta(); }, []);

  const title = TITLES[cat] || cat;
  const [logChannelMsgs, setLogChannelMsgs] = useState('');
  const [logsEnabled, setLogsEnabled] = useState(false);
  const [logsPseudo, setLogsPseudo] = useState(false);
  const [logsEmoji, setLogsEmoji] = useState('📝');
  const [logChannels, setLogChannels] = useState<{[k:string]:string}>({});
  const [logCats, setLogCats] = useState<{[k:string]:boolean}>({});
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  // Logs filters & format
  const [logsIgnoreBots, setLogsIgnoreBots] = useState(false);
  const [logsIgnoreUsersText, setLogsIgnoreUsersText] = useState('');
  const [logsIgnoreChannels, setLogsIgnoreChannels] = useState<string[]>([]);
  const [logsIgnoreRoles, setLogsIgnoreRoles] = useState<string[]>([]);
  const [logsFormat, setLogsFormat] = useState<'compact'|'detailed'>('detailed');
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
  // Tickets state
  const [ticketsPanelTitle, setTicketsPanelTitle] = useState('');
  const [ticketsPanelText, setTicketsPanelText] = useState('');
  const [ticketsCategoryId, setTicketsCategoryId] = useState('');
  const [ticketsPanelChannelId, setTicketsPanelChannelId] = useState('');
  const [ticketsTranscriptChannelId, setTicketsTranscriptChannelId] = useState('');
  const [ticketsTranscriptStyle, setTicketsTranscriptStyle] = useState<'pro'|'premium'|'classic'>('pro');
  const [ticketsPingStaff, setTicketsPingStaff] = useState(false);
  const [ticketsNamingMode, setTicketsNamingMode] = useState<'ticket_num'|'member_num'|'category_num'|'custom'|'numeric'|'date_num'>('ticket_num');
  const [ticketsNamingPattern, setTicketsNamingPattern] = useState('');
  const [ticketsCertifiedRoleId, setTicketsCertifiedRoleId] = useState('');
  const [ticketCats, setTicketCats] = useState<any[]>([]);
  const [ticketsBannerUrl, setTicketsBannerUrl] = useState('');
  // Role search filters
  const [autoKickRoleFilter, setAutoKickRoleFilter] = useState('');
  const [boosterRoleFilter, setBoosterRoleFilter] = useState('');
  const [ticketsCertifiedRoleFilter, setTicketsCertifiedRoleFilter] = useState('');
  const [ticketRoleFilterMap, setTicketRoleFilterMap] = useState<Record<number,string>>({});
  // Booster state
  const [boosterEnabled, setBoosterEnabled] = useState(false);
  const [boosterTextXp, setBoosterTextXp] = useState<number|''>('');
  const [boosterVoiceXp, setBoosterVoiceXp] = useState<number|''>('');
  const [boosterCooldownMult, setBoosterCooldownMult] = useState<number|''>('');
  const [boosterShopMult, setBoosterShopMult] = useState<number|''>('');
  const [boosterRoleIds, setBoosterRoleIds] = useState<string[]>([]);
  // Economy Actions state
  const [actKey, setActKey] = useState('work');
  const [actMoneyMin, setActMoneyMin] = useState<number|''>('');
  const [actMoneyMax, setActMoneyMax] = useState<number|''>('');
  const [actKarma, setActKarma] = useState<'none'|'charm'|'perversion'>('none');
  const [actKarmaDelta, setActKarmaDelta] = useState<number|''>('');
  const [actCooldown, setActCooldown] = useState<number|''>('');
  const [actSuccessRate, setActSuccessRate] = useState<number|''>('');
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
    // Filters & format
    const f = configs.logs?.filters || {};
    setLogsIgnoreBots(Boolean(f.ignoreBots));
    setLogsIgnoreChannels(Array.isArray(f.ignoreChannels) ? f.ignoreChannels : []);
    setLogsIgnoreRoles(Array.isArray(f.ignoreRoles) ? f.ignoreRoles : []);
    setLogsIgnoreUsersText(Array.isArray(f.ignoreUsers) ? (f.ignoreUsers as string[]).join(', ') : '');
    setLogsFormat((f.format === 'compact') ? 'compact' : 'detailed');
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
    // Tickets populate
    try {
      const t = configs.tickets || {};
      setTicketsPanelTitle(String(t.panelTitle||''));
      setTicketsPanelText(String(t.panelText||''));
      setTicketsCategoryId(String(t.categoryId||''));
      setTicketsPanelChannelId(String(t.panelChannelId||''));
      setTicketsTranscriptChannelId(String(t.transcriptChannelId||''));
      setTicketsTranscriptStyle((t.transcript?.style==='premium'?'premium':(t.transcript?.style==='classic'?'classic':'pro')));
      setTicketsPingStaff(Boolean(t.pingStaffOnOpen));
      setTicketsNamingMode((['ticket_num','member_num','category_num','custom','numeric','date_num'].includes(t.naming?.mode)?t.naming.mode:'ticket_num'));
      setTicketsNamingPattern(String(t.naming?.customPattern||''));
      setTicketsCertifiedRoleId(String(t.certifiedRoleId||''));
      setTicketCats(Array.isArray(t.categories)?t.categories:[]);
      setTicketsBannerUrl(String(t.bannerUrl||''));
    } catch {}
    // Booster populate
    try {
      const b = configs.economy?.booster || {};
      setBoosterEnabled(Boolean(b.enabled));
      setBoosterTextXp(Number.isFinite(b.textXpMult)?b.textXpMult:'');
      setBoosterVoiceXp(Number.isFinite(b.voiceXpMult)?b.voiceXpMult:'');
      setBoosterCooldownMult(Number.isFinite(b.actionCooldownMult)?b.actionCooldownMult:'');
      setBoosterShopMult(Number.isFinite(b.shopPriceMult)?b.shopPriceMult:'');
      setBoosterRoleIds(Array.isArray(b.roles)?b.roles:[]);
    } catch {}
  }, [configs]);
  // Prime action fields when action key changes
  useEffect(() => {
    if (!configs) return;
    // pick first action if current key not present
    try {
      const a = (configs.economy?.actions)||{};
      const exists = (a.config && actKey in a.config) || (a.messages && actKey in a.messages) || (a.gifs && actKey in a.gifs);
      if (!exists) {
        const keys = Array.from(new Set([...(Object.keys(a.config||{})), ...(Object.keys(a.messages||{})), ...(Object.keys(a.gifs||{}))]));
        if (keys.length) setActKey(keys[0]);
      }
    } catch {}
    try {
      const c = configs.economy?.actions?.config?.[actKey] || {};
      setActMoneyMin(Number.isFinite(c.moneyMin)?c.moneyMin:'');
      setActMoneyMax(Number.isFinite(c.moneyMax)?c.moneyMax:'');
      setActKarma(['none','charm','perversion'].includes(c.karma)?c.karma:'none');
      setActKarmaDelta(Number.isFinite(c.karmaDelta)?c.karmaDelta:'');
      setActCooldown(Number.isFinite(c.cooldown)?c.cooldown:'');
      setActSuccessRate(Number.isFinite(c.successRate)?c.successRate:'');
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
      const uiMsgsEmpty = (!msgSuccess && !msgFail);
      const needMessages = uiMsgsEmpty || (!Array.isArray(m.success) || m.success.length===0) || (!Array.isArray(m.fail) || m.fail.length===0);
      const needZones = (!Array.isArray(c.zones) || c.zones.length===0) || !actZones;
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
  const actionsList = useMemo(()=>{
    const a = (configs?.economy?.actions)||{};
    const set = new Set<string>();
    Object.keys(a.config||{}).forEach(k=>set.add(k));
    Object.keys(a.messages||{}).forEach(k=>set.add(k));
    Object.keys(a.gifs||{}).forEach(k=>set.add(k));
    return Array.from(set).sort();
  }, [configs]);

  return (
    <div className="space-y-4">
      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">{title} — {view}</h3>
        {cat==='logs' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={logsEnabled} onChange={e=>setLogsEnabled(e.target.checked)} /> Activé</label>
              <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={logsPseudo} onChange={e=>setLogsPseudo(e.target.checked)} /> Pseudo</label>
              <label className="text-white/70">Emoji global
                <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={logsEmoji} onChange={e=>setLogsEmoji(e.target.value)} />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-white/70 mt-2">Catégories</div>
              <button className="text-white/60 text-sm underline" onClick={()=>setLogsCollapsed(v=>!v)}>{logsCollapsed ? 'Déployer' : 'Réduire'}</button>
            </div>
            <div className="space-y-2">
              {['joinleave','messages','threads','backup','moderation','economy','voice','boosts','channels','roles','emojis','members','invites'].map((k)=>{
                const collapsed = logsCollapsed;
                const actionsOptions: Record<string,string[]> = {
                  joinleave: ['join','leave'],
                  messages: ['delete','edit'],
                  threads: ['create','delete'],
                  backup: ['backup','restore'],
                  moderation: ['ban','unban','kick','mute','unmute','warn','purge','massban','masskick'],
                  economy: ['work','fish','give','steal','shop','daily'],
                  voice: ['join','leave','move'],
                  boosts: ['boost','unboost'],
                  channels: ['create','delete','update'],
                  roles: ['create','delete','update','member_role_add','member_role_remove'],
                  emojis: ['create','delete','update'],
                  members: ['nickname'],
                  invites: ['create','delete']
                };
                const selectedActs = (configs?.logs?.actions?.[k] || []) as string[];
                return (
                  <div key={k} className={`grid ${collapsed ? 'md:grid-cols-2' : 'md:grid-cols-5'} gap-2 items-center`}>
                    <div className="text-white/70">{k}</div>
                    {!collapsed && (
                      <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={Boolean(logCats[k])} onChange={e=>setLogCats(prev=>({ ...prev, [k]: e.target.checked }))} /> ON</label>
                    )}
                    {!collapsed && (
                      <select className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={String(logChannels[k]||'')} onChange={e=>setLogChannels(prev=>({ ...prev, [k]: e.target.value }))}>
                        <option value="">—</option>
                        {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                      </select>
                    )}
                    <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" placeholder="Emoji (ex: 🔔)" value={(configs?.logs?.emojis?.[k] || '')} onChange={e=>{
                      const v = e.target.value; const next = { ...(configs?.logs?.emojis||{}) }; (next as any)[k] = v; (configs as any).logs = { ...(configs as any).logs, emojis: next }; setLogCats(prev=>({ ...prev })); }} />
                    {!collapsed && (
                      <select multiple className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full min-h-[42px]" value={selectedActs} onChange={e=>{
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
            <div className="mt-4 space-y-3">
              <div className="text-white/70 font-medium">Filtres & format</div>
              <div className="grid md:grid-cols-3 gap-3">
                <label className="text-white/70 flex items-center gap-2">
                  <input type="checkbox" checked={logsIgnoreBots} onChange={e=>setLogsIgnoreBots(e.target.checked)} /> Ignorer les bots
                </label>
                <label className="text-white/70">Format
                  <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={logsFormat} onChange={e=>setLogsFormat(e.target.value as any)}>
                    <option value="detailed">détaillé</option>
                    <option value="compact">compact</option>
                  </select>
                </label>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <label className="text-white/70">Ignorer salons
                  <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full min-h-[42px]" value={logsIgnoreChannels} onChange={e=>setLogsIgnoreChannels(Array.from(e.target.selectedOptions).map(o=>o.value))}>
                    {channels.map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                  </select>
                </label>
                <label className="text-white/70">Ignorer rôles
                  <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full min-h-[42px]" value={logsIgnoreRoles} onChange={e=>setLogsIgnoreRoles(Array.from(e.target.selectedOptions).map(o=>o.value))}>
                    {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                  </select>
                </label>
                <label className="text-white/70">Ignorer utilisateurs (IDs séparés par , ou \n)
                  <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-20" value={logsIgnoreUsersText} onChange={e=>setLogsIgnoreUsersText(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ if(!confirm('Confirmer la sauvegarde des réglages de logs ?')) return; await saveLogsAdvanced(logsEnabled, logsPseudo, logsEmoji); }}>Enregistrer global</button>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const emojis:any = configs?.logs?.emojis || {};
                const actions:any = configs?.logs?.actions || {};
                if(!confirm('Confirmer la sauvegarde des catégories, salons, emojis et actions ?')) return;
                const ignoreUsers = logsIgnoreUsersText.split(/[,\n\s]+/g).map(s=>s.trim()).filter(Boolean);
                const filters = { ignoreBots: logsIgnoreBots, ignoreUsers, ignoreChannels: logsIgnoreChannels, ignoreRoles: logsIgnoreRoles, format: logsFormat };
                const ok = await (useApi.getState().saveLogsPerCat as any)(logCats, logChannels, emojis, actions, filters);
                if (ok) await fetchAll();
              }}>Enregistrer</button>
            </div>
          </div>
        )}
        {(cat==='economie' || cat==='economy') && view==='boutique' && (
          <div className="space-y-3">
            <div className="panel">
              <div className="panel-header"><span className="pill pill-primary">Suites privées</span></div>
              <div className="grid md:grid-cols-3 gap-2">
                <label className="text-white/70">Catégorie Discord
                  <select className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full">
                    {channels.filter((c:any)=>String(c.type)==='4').map((c:any)=>(<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </label>
                <label className="text-white/70">Tarif jour
                  <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" />
                </label>
                <label className="text-white/70">Tarif semaine
                  <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" />
                </label>
                <label className="text-white/70">Tarif mois
                  <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" />
                </label>
              </div>
              <div className="mt-3"><button className="bg-transparent border border-white/10 rounded-xl px-3 py-2">Enregistrer Suites</button></div>
            </div>
          </div>
        )}
        {cat==='moderation' && (
          <div className="space-y-3">
            <div className="text-white/70">AutoKick: Rôle requis</div>
            <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 mb-2" placeholder="Rechercher un rôle…" value={autoKickRoleFilter} onChange={e=>setAutoKickRoleFilter(e.target.value)} />
            <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={autoKickRole} onChange={e=>setAutoKickRole(e.target.value)}>
              <option value="">—</option>
              {roles.filter(r=>r.name.toLowerCase().includes(autoKickRoleFilter.toLowerCase())).map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
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
        {(cat==='economie' || cat==='economy') && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <NavLink to={`/config/${cat}/overview`} className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Devise</NavLink>
              <NavLink to={`/config/${cat}/actions`} className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Actions</NavLink>
              <NavLink to={`/config/${cat}/gifs`} className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>GIFs</NavLink>
              <NavLink to={`/config/${cat}/boutique`} className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Boutique</NavLink>
            </div>
          </div>
        )}
        {(cat==='economie' || cat==='economy') && (!view || view==='overview') && (
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
        {(cat==='economie' || cat==='economy') && view==='actions' && (
          <div className="space-y-3">
            <div className="panel">
              <div className="panel-header">
                <span className="pill pill-primary">Général</span>
              </div>
              <div className="panel-grid">
                <label className="text-white/70">Action
                  <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKey} onChange={e=>setActKey(e.target.value)}>
                    {actionsList.map(k => (<option key={k} value={k}>{k}</option>))}
                  </select>
                </label>
                <label className="text-white/70">Cooldown (s)
                  <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actCooldown as any} onChange={e=>setActCooldown(e.target.value===''?'':Number(e.target.value))} />
                </label>
                <label className="text-white/70">Taux de succès (0-1)
                  <input type="number" step="0.01" min="0" max="1" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actSuccessRate as any} onChange={e=>setActSuccessRate(e.target.value===''?'':Number(e.target.value))} />
                </label>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="panel">
                <div className="panel-header">
                  <span className="pill pill-accent">Argent</span>
                </div>
                <div className="panel-grid">
                  <label className="text-white/70">Argent min (succès)
                    <input type="number" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={actMoneyMin as any} onChange={e=>setActMoneyMin(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                  <label className="text-white/70">Argent max (succès)
                    <input type="number" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={actMoneyMax as any} onChange={e=>setActMoneyMax(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                  <label className="text-white/70">Argent min (échec)
                    <input type="number" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={failMoneyMin as any} onChange={e=>setFailMoneyMin(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                  <label className="text-white/70">Argent max (échec)
                    <input type="number" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={failMoneyMax as any} onChange={e=>setFailMoneyMax(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                  <label className="text-white/70">% gains partenaire (argent)
                    <input type="number" step="0.1" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={partnerMoneyShare as any} onChange={e=>setPartnerMoneyShare(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <span className="pill pill-primary">Karma</span>
                </div>
                <div className="panel-grid">
                  <label className="text-white/70">Karma (type)
                    <select className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={actKarma} onChange={e=>setActKarma(e.target.value as any)}>
                      <option value="none">none</option>
                      <option value="charm">charm</option>
                      <option value="perversion">perversion</option>
                    </select>
                  </label>
                  <label className="text-white/70">Δ Karma (succès)
                    <input type="number" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={actKarmaDelta as any} onChange={e=>setActKarmaDelta(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                  <label className="text-white/70">Δ Karma (échec)
                    <input type="number" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={failKarmaDelta as any} onChange={e=>setFailKarmaDelta(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                  <label className="text-white/70">% karma partenaire
                    <input type="number" step="0.1" className="bg-transparent border border-white/10 rounded-xl px-3 py-2 w-full" value={partnerKarmaShare as any} onChange={e=>setPartnerKarmaShare(e.target.value===''?'':Number(e.target.value))} />
                  </label>
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              {/* GIF URLs moved to GIFs tab; no inputs here */}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const payload:any = { action: actKey, config: {}, messages: {}, gifs: {} };
                if (actMoneyMin !== '') payload.config.moneyMin = Number(actMoneyMin);
                if (actMoneyMax !== '') payload.config.moneyMax = Number(actMoneyMax);
                payload.config.karma = actKarma;
                if (actKarmaDelta !== '') payload.config.karmaDelta = Number(actKarmaDelta);
                if (actCooldown !== '') payload.config.cooldown = Number(actCooldown);
                if (actSuccessRate !== '') payload.config.successRate = Math.max(0, Math.min(1, Number(actSuccessRate)));
                // zones
                const z = actZones.split(',').map(s=>s.trim()).filter(Boolean);
                if (z.length) payload.config.zones = z;
                if (failKarmaDelta !== '') payload.config.failKarmaDelta = Number(failKarmaDelta);
                if (failMoneyMin !== '') payload.config.failMoneyMin = Number(failMoneyMin);
                if (failMoneyMax !== '') payload.config.failMoneyMax = Number(failMoneyMax);
                if (partnerMoneyShare !== '') payload.config.partnerMoneyShare = Number(partnerMoneyShare);
                if (partnerKarmaShare !== '') payload.config.partnerKarmaShare = Number(partnerKarmaShare);
                // messages and gifs are managed in dedicated tabs
                if(!confirm('Confirmer la sauvegarde de cette action ?')) return;
                await saveEconomyAction(actKey, payload);
              }}>Enregistrer l'action</button>
            </div>
          </div>
        )}
        {(cat==='economie' || cat==='economy') && view==='gifs' && (
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">Action
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKey} onChange={e=>setActKey(e.target.value)}>
                  {actionsList.map(k => (<option key={k} value={k}>{k}</option>))}
                </select>
              </label>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">GIF succès (1 URL par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-40" value={gifSuccess} onChange={e=>setGifSuccess(e.target.value)} />
                <input type="file" accept="image/gif,video/*,image/*" className="mt-2 text-white/70" multiple onChange={async e=>{ const files=Array.from(e.target.files||[]); if(!files.length) return; let urls: string[] = []; for (const f of files) { const fr=new FileReader(); await new Promise<void>(res=>{ fr.onloadend=()=>res(); fr.readAsDataURL(f); }); const dataUrl=String(fr.result||''); if (!dataUrl.startsWith('data:')) { alert(`Fichier invalide: ${f.name}`); continue; } const url=await uploadBase64(f.name, dataUrl); if (url) urls.push(url); else alert(`Échec upload: ${f.name}`); } const merged = [...gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean), ...urls]; setGifSuccess(Array.from(new Set(merged)).join('\n')); const payload:any={ action: actKey, gifs: {} }; payload.gifs.success = Array.from(new Set(merged)); await saveEconomyAction(actKey, payload); }} />
              </label>
              <label className="text-white/70">GIF échec (1 URL par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-40" value={gifFail} onChange={e=>setGifFail(e.target.value)} />
                <input type="file" accept="image/gif,video/*,image/*" className="mt-2 text-white/70" multiple onChange={async e=>{ const files=Array.from(e.target.files||[]); if(!files.length) return; let urls: string[] = []; for (const f of files) { const fr=new FileReader(); await new Promise<void>(res=>{ fr.onloadend=()=>res(); fr.readAsDataURL(f); }); const dataUrl=String(fr.result||''); if (!dataUrl.startsWith('data:')) { alert(`Fichier invalide: ${f.name}`); continue; } const url=await uploadBase64(f.name, dataUrl); if (url) urls.push(url); else alert(`Échec upload: ${f.name}`); } const merged = [...gifFail.split('\n').map(s=>s.trim()).filter(Boolean), ...urls]; setGifFail(Array.from(new Set(merged)).join('\n')); const payload:any={ action: actKey, gifs: {} }; payload.gifs.fail = Array.from(new Set(merged)); await saveEconomyAction(actKey, payload); }} />
              </label>
            </div>
            <div className="text-white/70 font-medium mt-2">Aperçu GIFs — Succès</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,8).map((u,idx)=>(
                <GifPreview key={'gs'+idx} url={u} onDelete={()=>{
                  setGifSuccess(gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean).filter((x:string)=>x!==u).join('\n'));
                }} />
              ))}
            </div>
            <div className="text-white/70 font-medium mt-2">Aperçu GIFs — Échec</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gifFail.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,8).map((u,idx)=>(
                <GifPreview key={'gf'+idx} url={u} onDelete={()=>{
                  setGifFail(gifFail.split('\n').map(s=>s.trim()).filter(Boolean).filter((x:string)=>x!==u).join('\n'));
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
        {(cat==='economie' || cat==='economy') && view==='boutique' && (
          <ShopEditor />
        )}
        {/* Phrases zones tab removed */}
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
        {(cat==='action-verite') && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <NavLink to="/config/action-verite/overview" className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Salons</NavLink>
              <NavLink to="/config/action-verite/sfw" className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Prompts SFW</NavLink>
              <NavLink to="/config/action-verite/nsfw" className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Prompts NSFW</NavLink>
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
        {(cat==='tickets') && (
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">Titre panneau
                <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsPanelTitle} onChange={e=>setTicketsPanelTitle(e.target.value)} />
              </label>
              <label className="text-white/70">Texte panneau
                <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsPanelText} onChange={e=>setTicketsPanelText(e.target.value)} />
              </label>
              <label className="text-white/70">Catégorie de salons (Discord)
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsCategoryId} onChange={e=>setTicketsCategoryId(e.target.value)}>
                  <option value="">—</option>
                  {channels.filter(ch=>String(ch.type)==='4').map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
              </label>
              <label className="text-white/70">Salon panneau
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsPanelChannelId} onChange={e=>setTicketsPanelChannelId(e.target.value)}>
                  <option value="">—</option>
                  {channels.filter(ch=>String(ch.type)==='0'||String(ch.type)==='5').map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
              </label>
              <label className="text-white/70">Salon transcription
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsTranscriptChannelId} onChange={e=>setTicketsTranscriptChannelId(e.target.value)}>
                  <option value="">—</option>
                  {channels.filter(ch=>String(ch.type)==='0'||String(ch.type)==='5').map(ch => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
                </select>
              </label>
              <label className="text-white/70">Style transcription
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsTranscriptStyle} onChange={e=>setTicketsTranscriptStyle(e.target.value as any)}>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                  <option value="classic">Classic</option>
                </select>
              </label>
              <label className="text-white/70 flex items-center gap-2"><input type="checkbox" checked={ticketsPingStaff} onChange={e=>setTicketsPingStaff(e.target.checked)} /> Ping staff à l'ouverture</label>
              <label className="text-white/70">Nommage
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsNamingMode} onChange={e=>setTicketsNamingMode(e.target.value as any)}>
                  <option value="ticket_num">ticket + numéro</option>
                  <option value="member_num">membre + numéro</option>
                  <option value="category_num">catégorie + numéro</option>
                  <option value="numeric">numérique</option>
                  <option value="date_num">date + numéro</option>
                  <option value="custom">personnalisé</option>
                </select>
              </label>
              {ticketsNamingMode==='custom' && (
                <label className="text-white/70">Modèle personnalisé
                  <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" placeholder="{user}-{num}" value={ticketsNamingPattern} onChange={e=>setTicketsNamingPattern(e.target.value)} />
                </label>
              )}
              <label className="text-white/70">Rôle certifié (optionnel)
                <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={ticketsCertifiedRoleId} onChange={e=>setTicketsCertifiedRoleId(e.target.value)}>
                  <option value="">—</option>
                  {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </label>
            </div>
            <div className="text-white/70 font-medium mt-2">Catégories de tickets</div>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">Image en bas (URL)
                <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" placeholder="https://..." value={ticketsBannerUrl} onChange={e=>setTicketsBannerUrl(e.target.value)} />
                <input type="file" accept="image/*" className="mt-2 text-white/70" onChange={async e=>{ const f=e.target.files?.[0]; if (!f) return; const fr=new FileReader(); fr.onloadend=async()=>{ const dataUrl=String(fr.result||''); if (!dataUrl.startsWith('data:')) { alert('Fichier invalide.'); return; } const url=await uploadBase64(f.name, dataUrl); if (url) { setTicketsBannerUrl(url); /* auto-save banner */ const payload:any = { bannerUrl: url }; await saveTickets(payload); } else alert('Échec de l\'upload de l\'image.'); }; fr.readAsDataURL(f); }} />
              </label>
              <div className="text-white/70">Aperçu panneau</div>
              <div className="md:col-span-2 bg-transparent border border-white/10 rounded-xl p-3">
                <div className="text-white font-semibold mb-1">{ticketsPanelTitle || '🎫 Ouvrir un ticket'}</div>
                <div className="text-white/80 mb-2">{ticketsPanelText || 'Choisissez une catégorie pour créer un ticket. Un membre du staff vous assistera.'}</div>
                <div className="grid md:grid-cols-3 gap-2">
                  {ticketCats.slice(0,6).map((c,i)=>(
                    <div key={i} className="bg-white/5 border border-white/10 rounded p-2 text-white/80 truncate">{(c.emoji||'🎟️')+' '+(c.label||'Catégorie')}</div>
                  ))}
                </div>
                {ticketsBannerUrl && (
                  <div className="mt-3">
                    <img src={ticketsBannerUrl} className="w-full h-32 object-cover rounded border border-white/10" />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {ticketCats.map((c, idx)=> (
                <div key={idx} className="grid md:grid-cols-3 gap-2 items-end border border-white/10 rounded-lg p-2 bg-transparent">
                  <label className="text-white/70">Label
                    <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={c.label||''} onChange={e=>setTicketCats(prev=>{ const n=[...prev]; n[idx]={...n[idx],label:e.target.value}; return n; })} />
                  </label>
                  <label className="text-white/70">Emoji
                    <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={c.emoji||''} onChange={e=>setTicketCats(prev=>{ const n=[...prev]; n[idx]={...n[idx],emoji:e.target.value}; return n; })} />
                  </label>
                  <label className="text-white/70">Description
                    <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={c.description||''} onChange={e=>setTicketCats(prev=>{ const n=[...prev]; n[idx]={...n[idx],description:e.target.value}; return n; })} />
                  </label>
                  <label className="text-white/70">Image en bas (URL)
                    <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={c.bannerUrl||''} onChange={e=>setTicketCats(prev=>{ const n=[...prev]; n[idx]={...n[idx],bannerUrl:e.target.value}; return n; })} />
                    <input type="file" accept="image/*" className="mt-2 text-white/70" onChange={async e=>{ const f=e.target.files?.[0]; if (!f) return; const fr=new FileReader(); fr.onloadend=async()=>{ const dataUrl=String(fr.result||''); if (!dataUrl.startsWith('data:')) return; const url=await uploadBase64(f.name, dataUrl); if (url) { setTicketCats(prev=>{ const n=[...prev]; n[idx]={...n[idx],bannerUrl:url}; return n; }); /* autosave */ const payload:any = { categories: [...ticketCats.map((x,i)=> i===idx? { ...x, bannerUrl:url } : x)] }; await saveTickets(payload); } }; fr.readAsDataURL(f); }} />
                  </label>
                  <label className="text-white/70">Rôles staff à ping
                    <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full min-h-[42px]" value={c.staffPingRoleIds||[]} onChange={e=>{
                      const vals = Array.from(e.target.selectedOptions).map(o=>o.value);
                      setTicketCats(prev=>{ const n=[...prev]; n[idx]={...n[idx],staffPingRoleIds:vals}; return n; });
                    }}>
                      {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                  </label>
                  <label className="text-white/70">Rôles ayant accès
                    <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full min-h-[42px]" value={c.extraViewerRoleIds||[]} onChange={e=>{
                      const vals = Array.from(e.target.selectedOptions).map(o=>o.value);
                      setTicketCats(prev=>{ const n=[...prev]; n[idx]={...n[idx],extraViewerRoleIds:vals}; return n; });
                    }}>
                      {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl px-3 py-2" onClick={()=>setTicketCats(prev=>prev.filter((_,i)=>i!==idx))}>Supprimer</button>
                  </div>
                </div>
              ))}
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={()=>setTicketCats(prev=>[...prev,{ key: `cat_${Math.random().toString(36).slice(2,8)}`, label:'', emoji:'', description:'', staffPingRoleIds:[], extraViewerRoleIds:[], bannerUrl:'' }])}>Ajouter une catégorie</button>
            </div>
            <div>
              <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
                const payload:any = {
                  panelTitle: ticketsPanelTitle,
                  panelText: ticketsPanelText,
                  categoryId: ticketsCategoryId,
                  panelChannelId: ticketsPanelChannelId,
                  transcriptChannelId: ticketsTranscriptChannelId,
                  transcript: { style: ticketsTranscriptStyle },
                  pingStaffOnOpen: ticketsPingStaff,
                  naming: { mode: ticketsNamingMode, customPattern: ticketsNamingPattern },
                  certifiedRoleId: ticketsCertifiedRoleId,
                  categories: ticketCats
                };
                if (ticketsBannerUrl) payload.bannerUrl = ticketsBannerUrl;
                if (!confirm('Confirmer la sauvegarde des tickets ?')) return;
                const ok = await saveTickets(payload);
                if (ok) await fetchAll();
              }}>Enregistrer Tickets</button>
            </div>
          </div>
        )}
        {(cat==='booster') && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-white/70">
              <input type="checkbox" checked={boosterEnabled} onChange={e=>setBoosterEnabled(e.target.checked)} /> Activé
            </label>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">XP texte x
                <input type="number" step="0.1" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={boosterTextXp as any} onChange={e=>setBoosterTextXp(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">XP vocal x
                <input type="number" step="0.1" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={boosterVoiceXp as any} onChange={e=>setBoosterVoiceXp(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">Cooldown actions x
                <input type="number" step="0.1" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={boosterCooldownMult as any} onChange={e=>setBoosterCooldownMult(e.target.value===''?'':Number(e.target.value))} />
              </label>
              <label className="text-white/70">Prix boutique x
                <input type="number" step="0.1" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={boosterShopMult as any} onChange={e=>setBoosterShopMult(e.target.value===''?'':Number(e.target.value))} />
              </label>
            </div>
            <div className="text-white/70">Rôles Booster</div>
            <select multiple className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[120px]" value={boosterRoleIds} onChange={e=>setBoosterRoleIds(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
            </select>
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
              const payload:any = { enabled: boosterEnabled };
              if (boosterTextXp !== '') payload.textXpMult = Number(boosterTextXp);
              if (boosterVoiceXp !== '') payload.voiceXpMult = Number(boosterVoiceXp);
              if (boosterCooldownMult !== '') payload.actionCooldownMult = Number(boosterCooldownMult);
              if (boosterShopMult !== '') payload.shopPriceMult = Number(boosterShopMult);
              payload.roles = boosterRoleIds;
              if (!confirm('Confirmer la sauvegarde Booster ?')) return;
              const ok = await saveBooster(payload);
              if (ok) await fetchAll();
            }}>Enregistrer Booster</button>
          </div>
        )}
        {cat==='levels' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <NavLink to="/config/levels/overview" className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Level</NavLink>
              <NavLink to="/config/levels/cards" className={({isActive})=>`px-3 py-2 rounded-xl border tab-gold ${isActive?'bg-red-600/20 text-white':'bg-red-600/10 text-white/80'}`}>Carte</NavLink>
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
            <div className="bg-transparent border border-white/10 rounded-xl p-3 space-y-4">
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
                      <div className="aspect-video w-full bg-transparent border border-white/10 rounded-xl overflow-hidden">
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
                      <div className="aspect-video w-full bg-transparent border border-white/10 rounded-xl overflow-hidden">
                        <img src={url} className="w-full h-full object-contain" />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="bg-transparent border border-white/10 rounded-xl p-3 space-y-3">
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
            <div className="bg-transparent border border-white/10 rounded-xl p-3 space-y-3">
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

function ShopEditor() {
  const { configs, fetchAll } = useApi();
  const { saveEconomyAction } = (useApi.getState() as any);
  const [items, setItems] = React.useState<{ name: string; price: number }[]>([]);
  const [roles, setRoles] = React.useState<{ roleId: string; price: number; durationDays: number }[]>([]);
  const [newItem, setNewItem] = React.useState<{ name: string; price: string }>({ name: '', price: '' });
  const [newRole, setNewRole] = React.useState<{ roleId: string; price: string; durationDays: string }>({ roleId: '', price: '', durationDays: '' });
  const rolesMeta = useApi((s:any)=>s.meta?.roles||[]);
  React.useEffect(()=>{
    const eco = configs?.economy || {};
    setItems(Array.isArray(eco.shop?.items)? eco.shop.items.map((x:any)=>({ name:String(x.name||''), price:Number(x.price||0) })) : []);
    setRoles(Array.isArray(eco.shop?.roles)? eco.shop.roles : []);
  }, [configs]);
  const saveShop = async (nextItems: any[], nextRoles: any[]) => {
    // Le backend /api/configs/economy n'a pas encore un payload direct shop; on l'encode dans actions.config spécial "shop_config"
    const payload:any = { action: 'shop_config', config: { items: nextItems, roles: nextRoles } };
    await saveEconomyAction('shop_config', payload);
    await fetchAll();
  };
  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="panel-header"><span className="pill pill-primary">Articles</span></div>
        <div className="space-y-2">
          <div className="grid md:grid-cols-2 gap-2 subcard">
            <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" placeholder="Nom" value={newItem.name} onChange={e=>setNewItem(v=>({...v,name:e.target.value}))} />
            <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" placeholder="Prix" value={newItem.price} onChange={e=>setNewItem(v=>({...v,price:e.target.value}))} />
            <div className="md:col-span-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
              const name = newItem.name.trim(); const price = Number(newItem.price||0);
              if (!name) return;
              const next = [...items, { name, price: Math.max(0, price) }];
              setItems(next); await saveShop(next, roles);
              setNewItem({ name:'', price:'' });
            }}>Ajouter</button></div>
          </div>
          <div className="space-y-2">
            {items.map((it, idx)=> (
              <div key={idx} className="grid md:grid-cols-6 gap-2 items-center subcard">
                <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2 md:col-span-2" value={it.name} onChange={e=>{
                  const v = e.target.value; setItems(prev=>{ const n=[...prev]; n[idx]={...n[idx], name: v}; return n; });
                }} />
                <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={it.price} onChange={e=>{
                  const v = Number(e.target.value||0); setItems(prev=>{ const n=[...prev]; n[idx]={...n[idx], price: v}; return n; });
                }} />
                <div className="md:col-span-2"></div>
                <button className="bg-red-600/20 border border-red-600/30 text-red-200 rounded-xl px-3 py-2" onClick={async()=>{
                  const next = items.filter((_,i)=>i!==idx); setItems(next); await saveShop(next, roles);
                }}>Suppr</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header"><span className="pill pill-accent">Rôles</span></div>
        <div className="space-y-2">
          <div className="grid md:grid-cols-4 gap-2 subcard">
            <select className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={newRole.roleId} onChange={e=>setNewRole(v=>({...v,roleId:e.target.value}))}>
              <option value="">— Rôle —</option>
              {rolesMeta.map((r:any)=>(<option key={r.id} value={r.id}>{r.name}</option>))}
            </select>
            <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" placeholder="Prix" value={newRole.price} onChange={e=>setNewRole(v=>({...v,price:e.target.value}))} />
            <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" placeholder="Durée (jours, 0=permanent)" value={newRole.durationDays} onChange={e=>setNewRole(v=>({...v,durationDays:e.target.value}))} />
            <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
              const roleId = newRole.roleId.trim(); const price = Number(newRole.price||0); const durationDays = Math.max(0, Number(newRole.durationDays||0));
              if (!roleId) return;
              if (roles.some(r=>String(r.roleId)===roleId && Number(r.durationDays||0)===durationDays)) return alert('Déjà présent');
              const next = [...roles, { roleId, price: Math.max(0, price), durationDays }];
              setRoles(next); await saveShop(items, next);
              setNewRole({ roleId:'', price:'', durationDays:'' });
            }}>Ajouter</button>
          </div>
          <div className="space-y-2">
            {roles.map((r, idx)=> (
              <div key={r.roleId+':'+(r.durationDays||0)} className="grid md:grid-cols-6 gap-2 items-center subcard">
                <div className="text-white/80 md:col-span-2 truncate">{(rolesMeta.find((x:any)=>x.id===r.roleId)?.name)||r.roleId}</div>
                <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={r.price} onChange={e=>{
                  const v = Number(e.target.value||0); setRoles(prev=>{ const n=[...prev]; n[idx]={...n[idx], price: v}; return n; });
                }} />
                <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={r.durationDays} onChange={e=>{
                  const v = Math.max(0, Number(e.target.value||0)); setRoles(prev=>{ const n=[...prev]; n[idx]={...n[idx], durationDays: v}; return n; });
                }} />
                <div className="md:col-span-1"></div>
                <button className="bg-red-600/20 border border-red-600/30 text-red-200 rounded-xl px-3 py-2" onClick={async()=>{
                  const next = roles.filter((_,i)=>i!==idx); setRoles(next); await saveShop(items, next);
                }}>Suppr</button>
              </div>
            ))}
          </div>
        </div>
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
        // Local file served by our server: bypass proxy and infer content type by extension
        if (url.startsWith('/')) {
          const lower = url.toLowerCase();
          const isVid = ['.mp4','.webm','.ogv','.mov'].some(ext => lower.endsWith(ext));
          if (!alive) return;
          setMeta({ url, contentType: isVid ? 'video/*' : 'image/*' });
          return;
        }
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
  const isLocal = (meta?.url || url).startsWith('/');
  const src = isLocal ? (meta?.url || url) : `${meta?.url ? `/api/proxy?url=${encodeURIComponent(meta.url)}` : `/api/proxy?url=${encodeURIComponent(url)}`}${key?`&key=${encodeURIComponent(key)}`:''}`;
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

function PhrasesZonesEditor({ actKey, actionsList }: { actKey: string; actionsList: string[] }) {
  const { configs, fetchAll } = useApi();
  const { saveEconomyAction } = useApi.getState() as any;
  const [action, setAction] = React.useState<string>(actKey || 'caress');
  const [zones, setZones] = React.useState<string[]>([]);
  const [zoneMsgs, setZoneMsgs] = React.useState<Record<string, { success: string; fail: string }>>({});
  const [loading, setLoading] = React.useState(false);
  React.useEffect(()=>{ setAction(actKey); }, [actKey]);
  React.useEffect(()=>{
    (async () => {
      try {
        setLoading(true);
        const key = (()=>{ try { return new URLSearchParams(window.location.search).get('key') || localStorage.getItem('DASHBOARD_KEY') || ''; } catch { return ''; } })();
        const res = await fetch(`/api/economy/action-defaults?action=${encodeURIComponent(action)}${key?`&key=${encodeURIComponent(key)}`:''}`);
        const d = await res.json();
        const zs: string[] = Array.isArray(d.zones) ? d.zones : [];
        setZones(zs);
        const m = { success: Array.isArray(d.success)?d.success:[], fail: Array.isArray(d.fail)?d.fail:[] };
        const byZone: Record<string, { success: string; fail: string }> = {};
        for (const z of zs) {
          const allS = m.success;
          const allF = m.fail;
          const sFiltered = (allS as string[]).filter((x:string)=>x.includes('{zone}') || x.toLowerCase().includes(z.toLowerCase()));
          const fFiltered = (allF as string[]).filter((x:string)=>x.includes('{zone}') || x.toLowerCase().includes(z.toLowerCase()));
          const s = (sFiltered.length ? sFiltered : allS).join('\n');
          const f = (fFiltered.length ? fFiltered : allF).join('\n');
          byZone[z] = { success: s, fail: f };
        }
        if (!byZone['(général)']) byZone['(général)'] = { success: m.success.join('\n'), fail: m.fail.join('\n') };
        setZoneMsgs(byZone);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [action]);
  const addZone = () => {
    const name = prompt('Nom de la nouvelle zone (ex: nuque) ?')?.trim();
    if (!name) return;
    if (zones.includes(name)) return alert('Cette zone existe déjà.');
    setZones(prev=>[...prev, name]);
    setZoneMsgs(prev=>({ ...prev, [name]: { success: '', fail: '' } }));
  };
  const removeZone = (z: string) => {
    setZones(prev=>prev.filter((x:string)=>x!==z));
    setZoneMsgs(prev=>{ const c = { ...prev }; delete c[z]; return c; });
  };
  const saveAll = async () => {
    const general = zoneMsgs['(général)'] || { success: '', fail: '' };
    const success: string[] = general.success.split('\n').map(s=>s.trim()).filter(Boolean);
    const fail: string[] = general.fail.split('\n').map(s=>s.trim()).filter(Boolean);
    const messagesPerZone: any = {};
    for (const z of zones) {
      const b = zoneMsgs[z] || { success: '', fail: '' };
      const ssRaw = b.success.split('\n').map(s=>s.trim()).filter(Boolean);
      const ffRaw = b.fail.split('\n').map(s=>s.trim()).filter(Boolean);
      messagesPerZone[z.toLowerCase()] = { success: ssRaw, fail: ffRaw };
      const ss = ssRaw.map(s=>s.replace('{zone}', z));
      const ff = ffRaw.map(s=>s.replace('{zone}', z));
      success.push(...ss);
      fail.push(...ff);
    }
    const payload: any = { action, config: { zones }, messages: { success, fail }, messagesPerZone };
    if (!confirm('Enregistrer zones et phrases pour cette action ?')) return;
    const ok = await saveEconomyAction(action, payload);
    if (ok) await fetchAll();
  };
  // Fallback actions list if parent-provided list is empty
  const localActionsList = React.useMemo(()=>{
    if (actionsList && actionsList.length) return actionsList;
    try {
      const a = (configs?.economy?.actions)||{};
      const set = new Set<string>();
      Object.keys(a.config||{}).forEach(k=>set.add(k));
      Object.keys(a.messages||{}).forEach(k=>set.add(k));
      Object.keys(a.gifs||{}).forEach(k=>set.add(k));
      return Array.from(set).sort();
    } catch { return []; }
  }, [actionsList, configs]);
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <label className="text-white/70">Action
          <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={action} onChange={e=>setAction(e.target.value)}>
            {localActionsList.map(k => (<option key={k} value={k}>{k}</option>))}
          </select>
        </label>
        <div className="flex items-end"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={addZone}>Ajouter une zone</button></div>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
        {loading && (<div className="text-white/60 text-sm">Chargement…</div>)}
        {!zones.length && (
          <div className="text-white/60 text-sm">Aucune zone. Utilisez "Ajouter une zone".</div>
        )}
        {Object.keys(zoneMsgs).map((z)=> (
          <div key={z} className="border border-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-white/80 font-medium">{z}</div>
              {z !== '(général)' && (
                <button className="ml-auto text-red-300 bg-red-500/20 border border-red-500/30 rounded px-2 py-1 text-xs" onClick={()=>removeZone(z)}>Supprimer</button>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-white/70">Succès (1 par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-28" value={zoneMsgs[z]?.success||''} onChange={e=>setZoneMsgs(prev=>({ ...prev, [z]: { ...(prev[z]||{fail:''}), success: e.target.value } }))} />
              </label>
              <label className="text-white/70">Échec (1 par ligne)
                <textarea className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full h-28" value={zoneMsgs[z]?.fail||''} onChange={e=>setZoneMsgs(prev=>({ ...prev, [z]: { ...(prev[z]||{success:''}), fail: e.target.value } }))} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={saveAll}>Enregistrer</button></div>
    </div>
  );
}

