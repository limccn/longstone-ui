/**
 * Privacy policy for the longstone web app (`longstone.app` /
 * `longstone-ui.pages.dev`) and the `longstone-ext` browser extension.
 *
 * Covers the web app (adapted from `longstone-ext/store/PRIVACY.md` and
 * extended for wallet connection, third-party RPC/IPFS/gateway endpoints,
 * local storage, and the absence of telemetry, servers and accounts) and the
 * browser extension, whose store listings use this page as their privacy-policy
 * URL.
 *
 * OWNER REVIEW: confirm the effective date before this page is published.
 */
const EFFECTIVE_DATE = '2026-10-29';

export function PrivacyView() {
  return (
    <section className="doc" data-testid="privacy">
      <h1>Privacy policy</h1>
      <p className="hint">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        This policy covers the longstone web app, served at{' '}
        <a href="https://longstone.app">https://longstone.app</a> and{' '}
        <a href="https://longstone-ui.pages.dev">
          https://longstone-ui.pages.dev
        </a>
        , and the &ldquo;longstone memory viewer&rdquo; browser extension
        (<span className="mono">longstone-ext</span>), whose store listings use
        this page as their privacy-policy URL. The web app is a static,
        server-less viewer for MemoryOverEth memories on the Base Sepolia test
        network; the extension adds a local, encrypted wallet.
      </p>

      <h2>Summary</h2>
      <ul>
        <li>No account, sign-in, or user profile.</li>
        <li>
          No telemetry, analytics, crash reporting, advertising, or tracking.
        </li>
        <li>
          No collection, sale, sharing, or transfer of personal data by the app
          or its developer.
        </li>
        <li>
          Your wallet keys never reach this app. The app receives only the
          public address and network that your wallet chooses to share, and
          every signature happens inside your wallet.
        </li>
        <li>
          Settings and the scan cache live in your browser. The app does not
          store memory content bytes.
        </li>
        <li>
          The browser extension behaves the same way: its wallet exists only as
          encrypted records in the browser&apos;s extension storage, the password
          is never stored, and nothing is uploaded or synced.
        </li>
      </ul>

      <h2>Data the app reads and where it goes</h2>
      <p>
        The app reads public blockchain data (the configured MemoryRegistry
        contract and its event logs) and, when you verify a commitment, the
        memory content bytes it points to. Every endpoint is editable in
        Settings; the live deployment ships with defaults.
      </p>
      <p>Network requests go only to:</p>
      <ul>
        <li>
          the JSON-RPC endpoint configured in Settings (default{' '}
          <span className="mono">https://sepolia.base.org</span>) for public
          chain reads: registry events, commitments, and signer roles;
        </li>
        <li>
          the IPFS gateway configured in Settings for memory content bytes when
          you verify a commitment;
        </li>
        <li>
          the hisaishi memory gateway configured in Settings — the
          operator&apos;s gateway, which serves{' '}
          <span className="mono">https://api.longstone.app</span> and keeps its
          workers.dev host as a fallback — for optional staged-memory and digest
          lookups; leaving it blank disables those features;
        </li>
        <li>
          <span className="mono">https://base-sepolia.blockscout.com</span>,
          only when you click a transaction or contract link;
        </li>
        <li>
          the GitHub link in the landing footer, only when you click it. (The
          component pages at <span className="mono">/menhir</span> and{' '}
          <span className="mono">/hisaishi</span> are routes of this static
          app, so opening them makes no network request.)
        </li>
      </ul>
      <p>
        As with any network request, those servers can see your IP address and
        request metadata. The developer does not receive or collect that data.
        The endpoints are operated by third parties or by you, and their own
        privacy policies apply. The static host (Cloudflare Pages or Vercel)
        may process request logs under its own policy.
      </p>
      <p>
        When the deployment enables the optional Reown AppKit wallet modal, it
        may also contact WalletConnect/Reown relay infrastructure to establish
        the wallet connection, subject to Reown&apos;s privacy policy. As of
        this policy&apos;s effective date, the production build does not enable
        it.
      </p>

      <h2>Wallet connection and write actions</h2>
      <p>
        The app never asks for, reads, stores, or transmits a private key,
        recovery phrase, or password. Connecting a wallet shares only the
        public address and network. The two write actions — granting or
        revoking agent signer roles, and retracting a commitment — are
        transactions that your wallet signs and broadcasts; the app only
        prepares the call. The app never signs on your behalf.
      </p>
      <p>
        On-chain transactions are public and irreversible. Their contents,
        including addresses and commitment hashes, are permanently visible to
        anyone with access to the chain.
      </p>

      <h2>Local storage</h2>
      <p>
        Settings (RPC URL, registry address, IPFS gateway, optional hisaishi
        URL, and scan-window settings) and the scanned registry cache (public
        event metadata such as commitment hashes, owners, tags, and block
        numbers) are stored in your browser&apos;s localStorage and IndexedDB.
        No cookies are used for tracking, and this data is not synced or
        uploaded anywhere. Clearing your browser&apos;s site data removes it.
      </p>

      <h2>Browser extension (longstone memory viewer)</h2>
      <p>
        The extension is this viewer with a local, encrypted wallet for the Base
        Sepolia test network. It has no account and no telemetry, and it ships
        no remote code: every script and style is bundled in the package, and
        the build audit rejects eval, remote scripts, wallet signing entry
        points, and unlisted key material.
      </p>
      <p>
        Settings (RPC, registry, IPFS gateway, hisaishi URL, an optional default
        owner, and scan-window values) and the scan cache (public event metadata
        only) are stored in the browser&apos;s extension storage on your
        machine. The wallet is stored there as encrypted records — the Argon2id
        salt and parameters, an AES-GCM IV, and the encrypted payload, plus a
        short-lived record while a password change completes.
        The password, recovery phrase, private keys, account labels, and account
        list are inside the ciphertext; the password itself is never stored.
        The decrypted wallet and its key exist only in memory while unlocked and
        are dropped when the panel locks. Nothing is synced to a browser account
        or uploaded, there is no password recovery, and the extension does not
        store memory content bytes.
      </p>
      <p>
        The extension declares only the <code>sidePanel</code> and{' '}
        <code>storage</code> permissions, plus optional host permissions. Host
        access is requested only for the exact RPC, IPFS, and hisaishi origins
        you save in Settings, from your Save click; the manifest&apos;s{' '}
        <code>https://*/*</code> entry is only the ceiling that makes
        user-configured HTTPS endpoints possible, and the extension never
        requests <code>&lt;all_urls&gt;</code>, tabs, activeTab, scripting, or
        content scripts. Its network requests go only to those configured
        endpoints, to{' '}
        <span className="mono">https://longstone.app</span> when you open a deep
        link to this web app (older links use{' '}
        <span className="mono">https://longstone-ui.pages.dev</span>), and to{' '}
        <span className="mono">https://base-sepolia.blockscout.com</span> when
        you click a transaction or contract link. It does not sign transactions
        and does not connect to a wallet provider: retract, signer, and verify
        actions open this web app, where any wallet interaction is performed by
        you.
      </p>
      <p>
        Exporting a private key or recovery phrase requires the wallet password
        and an explicit reveal. The secret stays visible for at most 60 seconds,
        until you hide it, or until the panel is hidden; a copy may remain in
        your operating system&apos;s clipboard after you leave, which is the
        operating system&apos;s behaviour, not an upload by the extension.
        Resetting the wallet deletes the encrypted record; it cannot be
        recovered without the password or an exported recovery phrase or private
        key.
      </p>

      <h2>No server, no account</h2>
      <p>
        The app is a static bundle. There is no account system, no session, and
        no developer-operated backend that stores data from the app. Memory
        content lives on IPFS and the commitment registry lives on chain; the
        app fetches them per request and keeps only the cache described above.
      </p>

      <h2>Changes and contact</h2>
      <p>
        This page is the authoritative copy of the policy. Material changes
        will be reflected here. Questions or requests:{' '}
        <a href="mailto:support@longstone.app">support@longstone.app</a> or the
        project&apos;s GitHub issues.
      </p>
    </section>
  );
}
