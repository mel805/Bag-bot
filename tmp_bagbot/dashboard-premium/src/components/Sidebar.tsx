import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

function LinkItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} className={({isActive}) => `px-3 py-2 rounded-xl block hover:bg-white/5 ${isActive?'bg-white/10':''}`}>
      {children}
    </NavLink>
  );
}

export default function Sidebar() {
  const [openServers, setOpenServers] = useState(true);
  return (
    <aside className="bg-background/95 border-r border-white/10 px-4 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-violet to-brand-cyan" />
        <div>
          <div className="text-white font-semibold leading-tight">Dashboard</div>
          <div className="text-xs text-white/60">Premium</div>
        </div>
      </div>

      <nav className="space-y-2">
        <LinkItem to="/">🏠 Tableau de bord</LinkItem>

        <div className="rounded-xl border border-white/10 overflow-hidden">
          <button className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2" onClick={()=>setOpenServers(v=>!v)}>
            <span className="text-white/80">🧭 Serveurs</span>
            <span className="ml-auto text-white/50">{openServers ? '–' : '+'}</span>
          </button>
          <AnimatePresence initial={false}>
            {openServers && (
              <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2}} className="px-3 py-2">
                <div className="space-y-1">
                  <LinkItem to="/servers">Vue d’ensemble</LinkItem>
                  <LinkItem to="/servers/123">Détails serveur #123</LinkItem>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <LinkItem to="/reminders">🛎️ Rappels</LinkItem>
        <LinkItem to="/stats">📈 Statistiques</LinkItem>
        <LinkItem to="/settings">⚙️ Paramètres</LinkItem>
      </nav>
    </aside>
  );
}
