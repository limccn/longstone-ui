import { Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { LandingView } from './ui/LandingView';
import { LoginView } from './ui/LoginView';
import { PrivacyView } from './ui/PrivacyView';
import { TermsView } from './ui/TermsView';
import { MenhirView } from './ui/MenhirView';
import { HisaishiView } from './ui/HisaishiView';
import { TimelineView } from './ui/TimelineView';
import { VerifyView } from './ui/VerifyView';
import { DetailView } from './ui/DetailView';
import { AclView } from './ui/AclView';
import { RetractView } from './ui/RetractView';
import { SettingsView } from './ui/SettingsView';
import { StagingView } from './ui/StagingView';
import { AboutView } from './ui/AboutView';

/**
 * Route tree. The landing facade, the policy pages and the component pages
 * sit outside the app shell (no header, no wallet bar); every workspace route
 * renders inside it.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingView />} />
      <Route path="/privacy" element={<PrivacyView />} />
      <Route path="/terms" element={<TermsView />} />
      <Route path="/menhir" element={<MenhirView />} />
      <Route path="/hisaishi" element={<HisaishiView />} />
      <Route element={<AppShell />}>
        <Route path="/login" element={<LoginView />} />
        <Route path="/workspaces" element={<TimelineView />} />
        <Route path="/verify" element={<VerifyView />} />
        <Route path="/commitment/:commitmentHash" element={<DetailView />} />
        <Route path="/acl" element={<AclView />} />
        <Route path="/retract" element={<RetractView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/staging" element={<StagingView />} />
        <Route path="/about" element={<AboutView />} />
        <Route path="*" element={<p className="empty">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
