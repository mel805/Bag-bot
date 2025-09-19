import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

export default function App() {
  const [open, setOpen] = useState(false);
  useEffect(()=>{
    const handler = () => setOpen(true);
    // @ts-ignore
    window.addEventListener('sidebar-open', handler as any);
    return () => {
      // @ts-ignore
      window.removeEventListener('sidebar-open', handler as any);
    };
  }, []);
  return (
    <div className={`relative min-h-screen grid ${open ? 'grid-cols-[260px_1fr]' : 'grid-cols-[64px_1fr]'} transition-[grid-template-columns] duration-200`}>
      {!open && (
        <div
          className="absolute left-0 top-0 bottom-0 w-8 z-50"
          onMouseEnter={()=>setOpen(true)}
        />
      )}
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
