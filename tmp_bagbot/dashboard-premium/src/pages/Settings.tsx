import React, { useEffect, useState } from 'react';
import { useApi } from '../store/api';

export default function Settings() {
  const { configs, fetchAll, saveCurrency, saveLogs, saveConfess, saveTd, saveLevels, saveAutoThread, saveCounting, saveDisboard, saveEconomyAction } = useApi();
  const [currency, setCurrency] = useState('');
  const [logJoin, setLogJoin] = useState(false);
  const [logMsg, setLogMsg] = useState(false);
  const [logThr, setLogThr] = useState(false);
  const [logBkp, setLogBkp] = useState(false);
  const [confAllow, setConfAllow] = useState(false);
  const [tdSfw, setTdSfw] = useState('');
  const [tdNsfw, setTdNsfw] = useState('');
  const [xpMsg, setXpMsg] = useState<number>(0);
  const [xpVoice, setXpVoice] = useState<number>(0);
  const [lvlBase, setLvlBase] = useState<number>(100);
  const [lvlFactor, setLvlFactor] = useState<number>(1.2 as any);
  const [atChannels, setAtChannels] = useState('');
  const [atPolicy, setAtPolicy] = useState('');
  const [atArchive, setAtArchive] = useState('');
  const [countingChannels, setCountingChannels] = useState('');
  const [disRem, setDisRem] = useState(false);
  const [disCh, setDisCh] = useState('');
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
  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    if (!configs) return;
    if (configs.economy?.currency?.name) setCurrency(configs.economy.currency.name);
    setLogJoin(!!configs.logs?.categories?.joinleave);
    setLogMsg(!!configs.logs?.categories?.messages);
    setLogThr(!!configs.logs?.categories?.threads);
    setLogBkp(!!configs.logs?.categories?.backup);
    setConfAllow(!!configs.confess?.allowReplies);
    setTdSfw((configs.truthdare?.sfw?.channels || []).join(','));
    setTdNsfw((configs.truthdare?.nsfw?.channels || []).join(','));
    setXpMsg(Number(configs.levels?.xpPerMessage || 0));
    setXpVoice(Number(configs.levels?.xpPerVoiceMinute || 0));
    setLvlBase(Number(configs.levels?.levelCurve?.base || 100));
    setLvlFactor(Number(configs.levels?.levelCurve?.factor || 1.2));
    setAtChannels((configs.autothread?.channels || []).join(','));
    setAtPolicy(String(configs.autothread?.policy || ''));
    setAtArchive(String(configs.autothread?.archivePolicy || ''));
    setCountingChannels((configs.counting?.channels || []).join(','));
    setDisRem(!!configs.disboard?.remindersEnabled);
    setDisCh(String(configs.disboard?.remindChannelId || ''));
    // prime defaults for selected action
    try {
      const c = configs.economy?.actions?.config?.[actKey] || {};
      setActMoneyMin(Number.isFinite(c.moneyMin)?c.moneyMin:'');
      setActMoneyMax(Number.isFinite(c.moneyMax)?c.moneyMax:'');
      setActKarma(['none','charm','perversion'].includes(c.karma)?c.karma:'none');
      setActKarmaDelta(Number.isFinite(c.karmaDelta)?c.karmaDelta:'');
      setActCooldown(Number.isFinite(c.cooldown)?c.cooldown:'');
      const m = configs.economy?.actions?.messages?.[actKey] || { success: [], fail: [] };
      setMsgSuccess((m.success||[]).join('\n'));
      setMsgFail((m.fail||[]).join('\n'));
      const g = configs.economy?.actions?.gifs?.[actKey] || { success: [], fail: [] };
      setGifSuccess((g.success||[]).join('\n'));
      setGifFail((g.fail||[]).join('\n'));
    } catch {}
  }, [configs]);
  return (
    <div className="space-y-6">
      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Devise</h3>
        <div className="flex gap-2">
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={currency} onChange={e=>setCurrency(e.target.value)} />
          <button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveCurrency(currency); }}>Enregistrer</button>
        </div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Économie • Actions</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-white/70">Action
            <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKey} onChange={e=>{ setActKey(e.target.value); if (configs) { try { const c=configs.economy?.actions?.config?.[e.target.value]||{}; setActMoneyMin(Number.isFinite(c.moneyMin)?c.moneyMin:''); setActMoneyMax(Number.isFinite(c.moneyMax)?c.moneyMax:''); setActKarma(['none','charm','perversion'].includes(c.karma)?c.karma:'none'); setActKarmaDelta(Number.isFinite(c.karmaDelta)?c.karmaDelta:''); setActCooldown(Number.isFinite(c.cooldown)?c.cooldown:''); const m=configs.economy?.actions?.messages?.[e.target.value]||{success:[],fail:[]}; setMsgSuccess((m.success||[]).join('\n')); setMsgFail((m.fail||[]).join('\n')); const g=configs.economy?.actions?.gifs?.[e.target.value]||{success:[],fail:[]}; setGifSuccess((g.success||[]).join('\n')); setGifFail((g.fail||[]).join('\n')); } catch {} } }}>
              {(Object.keys(configs?.economy?.actions?.config||{})).map(k => (<option key={k} value={k}>{k}</option>))}
            </select>
          </label>
          <label className="text-white/70">Argent min
            <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actMoneyMin as any} onChange={e=>setActMoneyMin(e.target.value===''?'':Number(e.target.value))} />
          </label>
          <label className="text-white/70">Argent max
            <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actMoneyMax as any} onChange={e=>setActMoneyMax(e.target.value===''?'':Number(e.target.value))} />
          </label>
          <label className="text-white/70">Karma
            <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKarma} onChange={e=>setActKarma(e.target.value as any)}>
              <option value="none">none</option>
              <option value="charm">charm</option>
              <option value="perversion">perversion</option>
            </select>
          </label>
          <label className="text-white/70">Δ Karma
            <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actKarmaDelta as any} onChange={e=>setActKarmaDelta(e.target.value===''?'':Number(e.target.value))} />
          </label>
          <label className="text-white/70">Cooldown (s)
            <input type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 w-full" value={actCooldown as any} onChange={e=>setActCooldown(e.target.value===''?'':Number(e.target.value))} />
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
            payload.messages.success = msgSuccess.split('\n').map(s=>s.trim()).filter(Boolean);
            payload.messages.fail = msgFail.split('\n').map(s=>s.trim()).filter(Boolean);
            payload.gifs.success = gifSuccess.split('\n').map(s=>s.trim()).filter(Boolean);
            payload.gifs.fail = gifFail.split('\n').map(s=>s.trim()).filter(Boolean);
            await saveEconomyAction(actKey, payload);
          }}>Enregistrer l'action</button>
        </div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Logs</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={logJoin} onChange={e=>setLogJoin(e.target.checked)} /> Entrées/Sorties</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={logMsg} onChange={e=>setLogMsg(e.target.checked)} /> Messages</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={logThr} onChange={e=>setLogThr(e.target.checked)} /> Fils</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={logBkp} onChange={e=>setLogBkp(e.target.checked)} /> Backups</label>
        </div>
        <div className="mt-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{
          await saveLogs({ joinleave: logJoin, messages: logMsg, threads: logThr, backup: logBkp });
        }}>Enregistrer</button></div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Confessions</h3>
        <label className="flex items-center gap-2"><input type="checkbox" checked={confAllow} onChange={e=>setConfAllow(e.target.checked)} /> Autoriser réponses anonymes</label>
        <div className="mt-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveConfess(confAllow); }}>Enregistrer</button></div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Action/Vérité</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-white/70 text-sm mb-1">Salons SFW (IDs)</div>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={tdSfw} onChange={e=>setTdSfw(e.target.value)} />
          </div>
          <div>
            <div className="text-white/70 text-sm mb-1">Salons NSFW (IDs)</div>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={tdNsfw} onChange={e=>setTdNsfw(e.target.value)} />
          </div>
        </div>
        <div className="mt-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveTd(tdSfw.split(',').map(s=>s.trim()).filter(Boolean), tdNsfw.split(',').map(s=>s.trim()).filter(Boolean)); }}>Enregistrer</button></div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Levels</h3>
        <div className="grid md:grid-cols-4 gap-3">
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={xpMsg} onChange={e=>setXpMsg(Number(e.target.value||0))} placeholder="XP/msg" />
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={xpVoice} onChange={e=>setXpVoice(Number(e.target.value||0))} placeholder="XP/min" />
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={lvlBase} onChange={e=>setLvlBase(Number(e.target.value||100))} placeholder="Base" />
          <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" value={lvlFactor} onChange={e=>setLvlFactor(Number(e.target.value||1.2))} placeholder="Factor" />
        </div>
        <div className="mt-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveLevels(xpMsg, xpVoice, lvlBase, lvlFactor); }}>Enregistrer</button></div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">AutoThread</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={atChannels} onChange={e=>setAtChannels(e.target.value)} placeholder="IDs séparés par virgule" />
          <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={atPolicy} onChange={e=>setAtPolicy(e.target.value)} placeholder="Policy" />
          <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={atArchive} onChange={e=>setAtArchive(e.target.value)} placeholder="Archivage" />
        </div>
        <div className="mt-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveAutoThread(atChannels.split(',').map(s=>s.trim()).filter(Boolean), atPolicy, atArchive); }}>Enregistrer</button></div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Comptage</h3>
        <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={countingChannels} onChange={e=>setCountingChannels(e.target.value)} placeholder="IDs (virgules)" />
        <div className="mt-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveCounting(countingChannels.split(',').map(s=>s.trim()).filter(Boolean)); }}>Enregistrer</button></div>
      </div>

      <div className="panel">
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-2">Disboard</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={disRem} onChange={e=>setDisRem(e.target.checked)} /> Rappels automatiques</label>
          <input className="bg-transparent border border-white/10 rounded-xl px-3 py-2" value={disCh} onChange={e=>setDisCh(e.target.value)} placeholder="Salon rappel (ID)" />
        </div>
        <div className="mt-3"><button className="bg-white/5 border border-white/10 rounded-xl px-3 py-2" onClick={async()=>{ await saveDisboard(disRem, disCh); }}>Enregistrer</button></div>
      </div>
    </div>
  );
}
