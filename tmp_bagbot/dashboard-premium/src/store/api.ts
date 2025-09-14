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
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  saveCurrency: (name: string) => Promise<boolean>;
};

export const useApi = create<ApiState>((set, get) => ({
  stats: null,
  configs: null,
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
}));

