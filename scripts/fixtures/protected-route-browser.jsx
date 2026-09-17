import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedRoute from '../../src/components/ProtectedRoute.jsx';

// The bundle replaces only next/navigation and AuthContext with fixture hooks.
// ProtectedRoute and React run unmodified in a real browser DOM.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

window.runProtectedRouteCases = async (roles, routes) => {
  const results = [];
  const host = document.getElementById('root');
  let mounts = 0;
  let effects = 0;
  let queries = 0;

  function Child() {
    mounts++;
    useEffect(() => { effects++; queries++; }, []);
    return React.createElement('span', null, 'Protected child');
  }

  async function exercise({ role, path, allowedRoles, isLoading = false }) {
    const redirects = [];
    window.__guardFixture = {
      pathname: path,
      actor: { user: role === 'anonymous' ? null : { id: 'fixture' }, role: role === 'missing' ? null : role, isLoading },
      router: { replace: target => redirects.push(target) },
    };
    mounts = effects = queries = 0;
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(ProtectedRoute, { allowedRoles }, React.createElement(Child)));
    });
    const row = { role, path, mounts, effects, queries, redirects: [...redirects] };
    await act(async () => { root.unmount(); });
    return row;
  }

  for (const role of roles) for (const path of routes) results.push(await exercise({ role, path }));
  results.push({ ...await exercise({ role: 'admin', path: '/settings', allowedRoles: ['director'] }), explicit: true });
  results.push({ ...await exercise({ role: 'admin', path: '/dashboard', isLoading: true }), loading: true });
  return results;
};
