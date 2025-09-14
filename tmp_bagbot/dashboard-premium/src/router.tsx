import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import Reminders from './pages/Reminders';
import Stats from './pages/Stats';
import Settings from './pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'servers', element: <Servers /> },
      { path: 'servers/:id', element: <ServerDetail /> },
      { path: 'reminders', element: <Reminders /> },
      { path: 'stats', element: <Stats /> },
      { path: 'settings', element: <Settings /> }
    ]
  }
]);
