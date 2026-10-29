/**
 * Short terms of use for the hosted web app.
 *
 * OWNER REVIEW: confirm the effective date and the wording before this page is
 * published. The only owner-review marker is this code comment; the visible
 * text must read as final.
 */
const EFFECTIVE_DATE = '2026-10-29';

export function TermsView() {
  return (
    <section className="doc" data-testid="terms">
      <h1>Terms of use</h1>
      <p className="hint">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        These terms cover your use of the longstone web app at{' '}
        <a href="https://longstone.app">https://longstone.app</a> (and its
        deployment at{' '}
        <a href="https://longstone-ui.pages.dev">
          https://longstone-ui.pages.dev
        </a>
        ). By using the app, you accept them.
      </p>

      <h2>The service</h2>
      <p>
        The app is a static, server-less browser for MemoryOverEth, an on-chain
        memory registry on the Base Sepolia test network. It is provided free of
        charge, as is, with no account and no service-level commitment. Test
        networks carry no real value and may be reset.
      </p>

      <h2>License</h2>
      <p>
        The app&apos;s source code is licensed under the Apache License, Version
        2.0. That license governs the code; these terms govern your use of the
        hosted site.
      </p>

      <h2>No warranty</h2>
      <p>
        The app is provided &ldquo;AS IS&rdquo;, without warranties or
        conditions of any kind, express or implied, including merchantability,
        fitness for a particular purpose, and non-infringement. Verify every
        commitment and transaction before relying on it.
      </p>

      <h2>Your wallet, your keys</h2>
      <p>
        You are solely responsible for your wallet, your keys, and every
        transaction you sign. The app never holds or requests your keys and
        cannot recover them. Network fees are your responsibility.
      </p>

      <h2>On-chain operations are irreversible</h2>
      <p>
        Memory commitments and signer changes are recorded on a public
        blockchain and cannot be edited or deleted. &ldquo;Retract&rdquo; writes
        a tombstone; it does not erase history, and retracting the same
        commitment twice is a no-op. Nothing in this app can undo a confirmed
        transaction.
      </p>

      <h2>Third-party services</h2>
      <p>
        The app reads data through endpoints you configure (JSON-RPC, IPFS, an
        optional hisaishi gateway) and links to third-party sites such as
        Blockscout. Those services are not operated by the maintainers, and
        their availability and terms are their own.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the maintainers are not liable
        for any indirect, incidental, special, consequential, or punitive
        damages, or for any loss of data, keys, or funds arising from your use
        of the app.
      </p>

      <h2>Changes and contact</h2>
      <p>
        This page is the authoritative copy of these terms. Material changes
        will be reflected here. Questions or requests:{' '}
        <a href="mailto:support@longstone.app">support@longstone.app</a> or the
        project&apos;s GitHub issues.
      </p>
    </section>
  );
}
