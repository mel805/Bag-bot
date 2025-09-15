import { create } from 'zustand';

// Helper to append auth key from URL/localStorage
const DASHBOARD_KEY = (() => {
  try {
    const urlKey = new URLSearchParams(window.location.search).get('key');
    const lsKey = localStorage.getItem('DASHBOARD_KEY');
    const k = urlKey || lsKey || '';
    if (k) localStorage.setItem('DASHBOARD_KEY', k);
    return k;
  } catch { return ''; }
})();
const withKey = (url: string) => {
  if (!DASHBOARD_KEY) return url;
  return url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(DASHBOARD_KEY);
};

type Stats = {
  guildId: string;
  guildName: string | null;
  guildIconUrl?: string | null;
  memberCount: number;
  channels: number;
  textChannelsCount?: number;
  voiceChannelsCount?: number;
  categoryCount?: number;
};

type Configs = any;

type ApiState = {
  stats: Stats | null;
  configs: Configs | null;
  meta: { channels: {id:string,name:string}[]; roles:{id:string,name:string}[]; guildIconUrl?: string|null; settings?: any } | null;
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  fetchMeta: () => Promise<void>;
  saveCurrency: (name: string) => Promise<boolean>;
  saveLogs: (categories: Record<string, boolean>, channels?: Record<string,string>) => Promise<boolean>;
  saveConfess: (allowReplies: boolean) => Promise<boolean>;
  saveTd: (sfw: string[], nsfw: string[]) => Promise<boolean>;
  saveLevels: (xpMsg: number, xpVoice: number, base: number, factor: number) => Promise<boolean>;
  saveLevelsExtra: (payload: Partial<{ xpMessageMin: number; xpMessageMax: number; xpVoiceMin: number; xpVoiceMax: number; messageCooldownSec: number; voiceCooldownSec: number; cards: { backgrounds?: Record<string,string> }; announce: { levelUp?: { template?: string }, roleAward?: { template?: string } } }>) => Promise<boolean>;
  uploadBase64: (filename: string, dataUrl: string) => Promise<string|null>;
  saveAutoThread: (channels: string[], policy: string, archivePolicy: string) => Promise<boolean>;
  saveCounting: (channels: string[]) => Promise<boolean>;
  saveDisboard: (remindersEnabled: boolean, remindChannelId: string) => Promise<boolean>;
  saveAutoKickRole: (roleId: string) => Promise<boolean>;
  saveAutoKickAdvanced: (enabled: boolean, delayMs: number) => Promise<boolean>;
  saveLogsAdvanced: (enabled: boolean, pseudo: boolean, emoji: string) => Promise<boolean>;
  saveConfessAdvanced: (logChannelId: string, threadNaming: 'normal'|'nsfw') => Promise<boolean>;
  saveLevelsAdvanced: (enabled: boolean, announce: { levelUp?: { enabled?: boolean; channelId?: string }; roleAward?: { enabled?: boolean; channelId?: string } }) => Promise<boolean>;
  saveCurrencySymbol: (symbol: string) => Promise<boolean>;
  saveEconomyAction: (action: string, payload: Partial<{ config: any; messages: { success?: string[]; fail?: string[] }; gifs: { success?: string[]; fail?: string[] } }>) => Promise<boolean>;
  saveEconomyRewards: (messageMin: number|'', messageMax: number|'', voiceMin: number|'', voiceMax: number|'') => Promise<boolean>;
  resetLevels: () => Promise<boolean>;
};

export const useApi = create<ApiState>((set, get) => ({
  stats: null,
  configs: null,
  meta: null,
  loading: false,
  error: null,
  fetchAll: async () => {
    try {
      set({ loading: true, error: null });
      const [s, c] = await Promise.all([
        fetch(withKey('/api/stats')).then(r => r.json()),
        fetch(withKey('/api/configs')).then(r => r.json()),
      ]);
      set({ stats: s, configs: c, loading: false });
    } catch (e: any) {
      set({ error: String(e?.message || e), loading: false });
    }
  },
  fetchMeta: async () => {
    try {
      const m = await fetch(withKey('/api/meta')).then(r=>r.json());
      set({ meta: m });
    } catch {}
  },
  saveCurrency: async (name: string) => {
    try {
      const res = await fetch(withKey('/api/configs/economy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: { name } })
      });
      if (!res.ok) return false;
      await get().fetchAll();
      return true;
    } catch {
      return false;
    }
  }
  , saveLogs: async (categories, channels) => {
    try {
      const payload: any = { categories };
      if (channels) payload.channels = channels;
      const res = await fetch(withKey('/api/configs/logs'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveLogsAdvanced: async (enabled, pseudo, emoji) => {
    try {
      const payload: any = { enabled, pseudo, emoji };
      const res = await fetch(withKey('/api/configs/logs'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveConfess: async (allowReplies) => {
    try {
      const res = await fetch(withKey('/api/configs/confess'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ allowReplies }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveConfessAdvanced: async (logChannelId, threadNaming) => {
    try {
      const res = await fetch(withKey('/api/configs/confess'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ logChannelId, threadNaming }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveTd: async (sfw, nsfw) => {
    try {
      const res = await fetch(withKey('/api/configs/truthdare'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sfwChannels: sfw, nsfwChannels: nsfw }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveLevels: async (xpMsg, xpVoice, base, factor) => {
    try {
      const res = await fetch(withKey('/api/configs/levels'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ xpPerMessage: xpMsg, xpPerVoiceMinute: xpVoice, levelCurve:{ base, factor } }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveLevelsExtra: async (payload) => {
    try {
      const res = await fetch(withKey('/api/configs/levels'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , uploadBase64: async (filename, dataUrl) => {
    try {
      const res = await fetch(withKey('/api/uploadBase64'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ filename, dataUrl }) });
      if (!res.ok) return null; const j = await res.json(); return j.url || null;
    } catch { return null; }
  }
  , saveLevelsAdvanced: async (enabled, announce) => {
    try {
      const res = await fetch(withKey('/api/configs/levels'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ enabled, announce }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveAutoThread: async (channels, policy, archivePolicy) => {
    try {
      const res = await fetch(withKey('/api/configs/autothread'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ channels, policy, archivePolicy }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveCounting: async (channels) => {
    try {
      const res = await fetch(withKey('/api/configs/counting'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ channels }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveDisboard: async (remindersEnabled, remindChannelId) => {
    try {
      const res = await fetch(withKey('/api/configs/disboard'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remindersEnabled, remindChannelId }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveAutoKickRole: async (roleId) => {
    try {
      const res = await fetch(withKey('/api/configs/autokick'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ roleId }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveAutoKickAdvanced: async (enabled, delayMs) => {
    try {
      const res = await fetch(withKey('/api/configs/autokick'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ enabled, delayMs }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveCurrencySymbol: async (symbol) => {
    try {
      const res = await fetch(withKey('/api/configs/economy'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ currency: { symbol } }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveEconomyAction: async (action, payload) => {
    try {
      const res = await fetch(withKey('/api/configs/economy'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, ...payload }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveEconomyRewards: async (messageMin, messageMax, voiceMin, voiceMax) => {
    try {
      const payload:any = { rewards: {} };
      payload.rewards.message = {};
      if (messageMin !== '') payload.rewards.message.min = Number(messageMin);
      if (messageMax !== '') payload.rewards.message.max = Number(messageMax);
      payload.rewards.voice = {};
      if (voiceMin !== '') payload.rewards.voice.min = Number(voiceMin);
      if (voiceMax !== '') payload.rewards.voice.max = Number(voiceMax);
      const res = await fetch(withKey('/api/configs/economy'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , resetLevels: async () => {
    try {
      const res = await fetch(withKey('/api/configs/levels/reset'), { method:'POST' });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
}));

