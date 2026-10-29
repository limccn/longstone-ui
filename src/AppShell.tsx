import { NavLink, Outlet } from 'react-router-dom';
import { WalletBar } from './wallet/WalletBar';

const NAV = [
  { to: '/workspaces', label: 'Workspaces' },
  { to: '/verify', label: 'Verify' },
  { to: '/acl', label: 'Access control' },
  { to: '/retract', label: 'Retract' },
  { to: '/staging', label: 'Staging' },
  { to: '/settings', label: 'Settings' },
  { to: '/about', label: 'About' },
] as const;

/**
 * Application frame: header, navigation, wallet bar and footer around the
 * routed workspace views. The landing page and the document pages
 * (`/privacy`, `/terms`) deliberately render outside this shell.
 */
export function AppShell() {
  return (
    <div className="app">
      <header className="app-header">
        <NavLink to="/" className="brand">
          longstone
        </NavLink>
        <nav className="app-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link on' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <WalletBar />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>
          MemoryOverEth · Base Sepolia (84532) · static, no server, no account
        </span>
      </footer>
    </div>
  );
}
