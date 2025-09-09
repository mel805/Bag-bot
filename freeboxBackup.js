"use strict";
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

class FreeboxBackup {
  constructor() {
    this.backupPaths = [
      "/var/data/backups",
      "/home/bagbot/Bag-bot/backups",
      (process.env.FREEBOX_BACKUP_PATH || "/workspace/data/backups")
    ];
    this.validBackupPath = null;
  }

  async findBackupPath() {
    if (this.validBackupPath) return this.validBackupPath;
    for (const p of this.backupPaths) {
      try {
        await fsp.access(p, fs.constants.R_OK);
        this.validBackupPath = p;
        return p;
      } catch (_) {}
    }
    throw new Error("Aucun chemin de sauvegarde Freebox accessible trouvé");
  }

  _displayName(meta, st, filename) {
    const ts = (meta && meta.timestamp)
      ? meta.timestamp
      : (st && st.mtime ? st.mtime.toISOString() : new Date(0).toISOString());
    const d = new Date(ts);
    const two = (n) => String(n).padStart(2, "0");
    let label = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
    if (meta && typeof meta.guilds_count === "number") label += ` (${meta.guilds_count})`;
    if (meta && meta.backup_type) label += ` [${meta.backup_type}]`;
    return label;
  }

  async listBackupFiles() {
    try {
      const p = await this.findBackupPath();
      const files = await fsp.readdir(p);
      const jsons = files.filter(f => f.endsWith(".json") && (f.startsWith("backup-") || f.startsWith("config-") || f.includes("bot-data")));
      const out = [];
      for (const f of jsons) {
        const fp = path.join(p, f);
        let st; try { st = await fsp.stat(fp); } catch (_) { continue; }
        let meta = null;
        try {
          const raw = await fsp.readFile(fp, "utf8");
          const data = JSON.parse(raw);
          if (data && typeof data === "object") {
            if (data.metadata) meta = data.metadata;
            else if (data.guilds) meta = {
              timestamp: (st.mtime || new Date()).toISOString(),
              backup_type: "direct",
              data_size: raw.length,
              guilds_count: Object.keys(data.guilds || {}).length
            };
          }
        } catch (_) {}
        out.push({
          filename: f,
          path: fp,
          size: (st && st.size) || 0,
          modified: (st && st.mtime ? st.mtime.toISOString() : new Date(0).toISOString()),
          created: (st && (st.birthtime || st.ctime) ? (st.birthtime || st.ctime).toISOString() : new Date(0).toISOString()),
          metadata: meta,
          displayName: this._displayName(meta, st, f)
        });
      }
      return out.filter(x => x.metadata).sort((a, b) => new Date(b.modified) - new Date(a.modified));
    } catch (e) {
      console.error("[FreeboxBackup] Liste fichiers:", e && e.message ? e.message : String(e));
      return [];
    }
  }

  async restoreFromFile(name) {
    const p = await this.findBackupPath();
    const fp = path.join(p, name);
    await fsp.access(fp, fs.constants.R_OK);
    const raw = await fsp.readFile(fp, "utf8");
    const data = JSON.parse(raw);
    let cfg = null, meta = null;
    if (data && data.data && data.metadata) { cfg = data.data; meta = data.metadata; }
    else if (data && data.guilds) { cfg = data; meta = { timestamp: new Date().toISOString(), backup_type: "local_file", source_file: name }; }
    else { throw new Error("Format de sauvegarde non reconnu"); }
    if (!cfg || typeof cfg !== "object" || !cfg.guilds) throw new Error("Données de configuration invalides");
    return { success: true, data: cfg, metadata: meta, source: "freebox_file", filename: name };
  }

  async saveBackupFile(cfg) {
    try {
      if (!cfg || typeof cfg !== "object") throw new Error("Données invalides");
      const p = await this.findBackupPath();
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const name = "bot-data-" + ts + ".json";
      const dest = path.join(p, name);
      const meta = { timestamp: new Date().toISOString(), backup_type: "complete", source: "freebox", data_size: JSON.stringify(cfg).length, guilds_count: Object.keys(cfg.guilds || {}).length };
      await fsp.writeFile(dest, JSON.stringify({ metadata: meta, data: cfg }, null, 2), "utf8");
      return { success: true, path: dest, filename: name, metadata: meta };
    } catch (e) {
      return { success: false, error: (e && e.message) || String(e) };
    }
  }

  async isAvailable() { try { await this.findBackupPath(); return true; } catch (_) { return false; } }

  async getInfo() {
    try {
      const p = await this.findBackupPath();
      const files = await this.listBackupFiles();
      return { available: true, path: p, files_count: files.length, latest_backup: files[0] || null };
    } catch (e) { return { available: false, error: (e && e.message) || String(e) }; }
  }
}

module.exports = FreeboxBackup;

