import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

export default function App() {
  return (
    <div className="min-h-screen grid grid-cols-[280px_1fr]">
      <Sidebar />
      <div className="min-h-screen flex flex-col">
        <Topbar />
        <main className="p-6 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
