import { create } from 'zustand';

type Stats = {
  guildId: string;
  guildName: string | null;
  guildIconUrl?: string | null;
  memberCount: number;
  channels: number;
};

type Configs = any;

type ApiState = {
  stats: Stats | null;
  configs: Configs | null;
  meta: { channels: {id:string,name:string}[]; roles:{id:string,name:string}[]; guildIconUrl?: string|null } | null;
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  fetchMeta: () => Promise<void>;
  saveCurrency: (name: string) => Promise<boolean>;
  saveLogs: (categories: Record<string, boolean>, channels?: Record<string,string>) => Promise<boolean>;
  saveConfess: (allowReplies: boolean) => Promise<boolean>;
  saveTd: (sfw: string[], nsfw: string[]) => Promise<boolean>;
  saveLevels: (xpMsg: number, xpVoice: number, base: number, factor: number) => Promise<boolean>;
  saveAutoThread: (channels: string[], policy: string, archivePolicy: string) => Promise<boolean>;
  saveCounting: (channels: string[]) => Promise<boolean>;
  saveDisboard: (remindersEnabled: boolean, remindChannelId: string) => Promise<boolean>;
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
        fetch('/api/stats').then(r => r.json()),
        fetch('/api/configs').then(r => r.json()),
      ]);
      set({ stats: s, configs: c, loading: false });
    } catch (e: any) {
      set({ error: String(e?.message || e), loading: false });
    }
  },
  fetchMeta: async () => {
    try {
      const m = await fetch('/api/meta').then(r=>r.json());
      set({ meta: m });
    } catch {}
  },
  saveCurrency: async (name: string) => {
    try {
      const res = await fetch('/api/configs/economy', {
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
      const res = await fetch('/api/configs/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveConfess: async (allowReplies) => {
    try {
      const res = await fetch('/api/configs/confess', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ allowReplies }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveTd: async (sfw, nsfw) => {
    try {
      const res = await fetch('/api/configs/truthdare', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sfwChannels: sfw, nsfwChannels: nsfw }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveLevels: async (xpMsg, xpVoice, base, factor) => {
    try {
      const res = await fetch('/api/configs/levels', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ xpPerMessage: xpMsg, xpPerVoiceMinute: xpVoice, levelCurve:{ base, factor } }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveAutoThread: async (channels, policy, archivePolicy) => {
    try {
      const res = await fetch('/api/configs/autothread', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ channels, policy, archivePolicy }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveCounting: async (channels) => {
    try {
      const res = await fetch('/api/configs/counting', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ channels }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
  , saveDisboard: async (remindersEnabled, remindChannelId) => {
    try {
      const res = await fetch('/api/configs/disboard', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remindersEnabled, remindChannelId }) });
      if (!res.ok) return false; await get().fetchAll(); return true;
    } catch { return false; }
  }
}));

