import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`min-h-screen grid ${open ? 'grid-cols-[260px_1fr]' : 'grid-cols-[64px_1fr]'} transition-[grid-template-columns] duration-200`}>
      <div onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} tabIndex={0}>
        <Sidebar collapsed={!open} onToggle={()=>setOpen(v=>!v)} />
      </div>
      <div className="min-h-screen flex flex-col">
        <Topbar />
        <main className="p-6 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
