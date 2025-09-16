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

export default function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const [openServers, setOpenServers] = useState(true);
  const [openConfig, setOpenConfig] = useState(true);
  const openSidebar = () => {
    if (onToggle) onToggle();
    try { window.dispatchEvent(new Event('sidebar-open')); } catch (_) {}
  };
  return (
    <aside className={`bg-red-600/20 backdrop-blur border-r border-white/10 text-white ${collapsed ? 'px-2 py-3' : 'px-4 py-4'}`}>
      <div className="flex items-center gap-3 mb-4">
        <img
          src="https://cdn.discordapp.com/attachments/1408458115283812484/1408497858256179400/file_00000000d78861f4993dddd515f84845.png?ex=68c8f09a&is=68c79f1a&hm=5eb6483a9302bf1b12c608c5caf45d39d3f1b60883ef7e31180f35fdb70002e9&"
          alt="Logo"
          className={collapsed ? 'w-8 h-8 rounded-lg object-cover cursor-pointer' : 'w-9 h-9 rounded-lg object-cover cursor-pointer'}
          onClick={openSidebar}
        />
        {!collapsed && (
          <div>
            <div className="text-white font-semibold leading-tight">Dashboard</div>
            <div className="text-xs text-white/90">Premium</div>
          </div>
        )}
      </div>

      <nav className="space-y-2">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <NavLink to="/" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 ${isActive?'bg-white/20':''}`} title="Accueil">🏠</NavLink>
            <NavLink to="/reminders" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Rappels">🛎️</NavLink>
            <NavLink to="/stats" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Stats">📈</NavLink>
            <div className="h-px w-8 bg-white/30 my-1" />
            {/* Même emojis que les catégories visibles quand la sidebar est déployée */}
            <NavLink to="/config/moderation/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 ${isActive?'bg-white/20':''}`} title="Modération">🛡️</NavLink>
            <NavLink to="/config/levels/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Niveaux">🆙</NavLink>
            <NavLink to="/config/economie/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Économie">🪙</NavLink>
            <NavLink to="/config/booster/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Booster">🚀</NavLink>
            <NavLink to="/config/action-verite/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Action/Vérité">🎲</NavLink>
            <NavLink to="/config/tickets/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Tickets">🎫</NavLink>
            <NavLink to="/config/logs/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Journalisation">📜</NavLink>
            <NavLink to="/config/confessions/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Confessions">🕊️</NavLink>
            <NavLink to="/config/autothread/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Auto-threads">🧵</NavLink>
            <NavLink to="/config/counting/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Compteur">🔢</NavLink>
            <NavLink to="/config/disboard/overview" onClick={openSidebar} className={({isActive})=>`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 ${isActive?'bg-white/10':''}`} title="Disboard">📣</NavLink>
          </div>
        ) : (
          <>
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

            <div className="rounded-xl border border-white/10 overflow-hidden">
              <button className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2" onClick={()=>setOpenConfig(v=>!v)}>
                <span className="text-white/80">🧩 Configuration</span>
                <span className="ml-auto text-white/50">{openConfig ? '–' : '+'}</span>
              </button>
              <AnimatePresence initial={false}>
                {openConfig && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2}} className="px-3 py-2">
                    <div className="space-y-1">
                      <LinkItem to="/config/moderation/overview">🛡️ Modération</LinkItem>
                      <LinkItem to="/config/levels/overview">🆙 Niveaux</LinkItem>
                      <LinkItem to="/config/economie/overview">🪙 Économie</LinkItem>
                      <LinkItem to="/config/economie/actions">⚙️ Économie • Actions</LinkItem>
                      <LinkItem to="/config/economie/boutique">🛍️ Économie • Boutique</LinkItem>
                      <LinkItem to="/config/booster/overview">🚀 Booster</LinkItem>
                      <LinkItem to="/config/action-verite/overview">🎲 Action/Vérité</LinkItem>
                      <LinkItem to="/config/tickets/overview">🎫 Tickets</LinkItem>
                      <LinkItem to="/config/logs/overview">📜 Journalisation</LinkItem>
                      <LinkItem to="/config/confessions/overview">🕊️ Confessions</LinkItem>
                      <LinkItem to="/config/autothread/overview">🧵 Auto-threads</LinkItem>
                      <LinkItem to="/config/counting/overview">🔢 Compteur</LinkItem>
                      <LinkItem to="/config/disboard/overview">📣 Disboard</LinkItem>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
