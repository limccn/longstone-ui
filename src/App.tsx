import { NavLink, Route, Routes } from 'react-router-dom';
import { WalletBar } from './wallet/WalletBar';
import { TimelineView } from './ui/TimelineView';
import { VerifyView } from './ui/VerifyView';
import { DetailView } from './ui/DetailView';
import { AclView } from './ui/AclView';
import { RetractView } from './ui/RetractView';
import { SettingsView } from './ui/SettingsView';
import { StagingView } from './ui/StagingView';
import { AboutView } from './ui/AboutView';

const NAV = [
  { to: '/', label: 'Timeline', end: true },
  { to: '/verify', label: 'Verify' },
  { to: '/acl', label: 'Access control' },
  { to: '/retract', label: 'Retract' },
  { to: '/staging', label: 'Staging' },
  { to: '/settings', label: 'Settings' },
  { to: '/about', label: 'About' },
] as const;

export function App() {
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
              end={'end' in item ? item.end : false}
              className={({ isActive }) => (isActive ? 'nav-link on' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <WalletBar />
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<TimelineView />} />
          <Route path="/verify" element={<VerifyView />} />
          <Route path="/commitment/:commitmentHash" element={<DetailView />} />
          <Route path="/acl" element={<AclView />} />
          <Route path="/retract" element={<RetractView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/staging" element={<StagingView />} />
          <Route path="/about" element={<AboutView />} />
          <Route path="*" element={<p className="empty">Page not found.</p>} />
        </Routes>
      </main>
      <footer className="app-footer">
        <span>
          MemoryOverEth · Base Sepolia (84532) · static, no server, no account
        </span>
      </footer>
    </div>
  );
}
