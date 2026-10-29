import { Link } from 'react-router-dom';

interface ComponentCard {
  name: string;
  description: string;
  href: string;
}

const COMPONENTS: readonly ComponentCard[] = [
  {
    name: 'Longstone',
    description:
      'This app — browse anchored memories, verify content bytes, and manage agent signers.',
    href: '/workspaces',
  },
  {
    name: 'menhir',
    description:
      'The immutable on-chain registry that anchors MemoryOverEth commitments.',
    href: '/menhir',
  },
  {
    name: 'hisaishi',
    description:
      'The keyless memory gateway: staging, pinning, and batch preparation.',
    href: '/hisaishi',
  },
];

function Card({ component }: { component: ComponentCard }) {
  return (
    <Link className="card" to={component.href}>
      <h3>{component.name}</h3>
      <p>{component.description}</p>
    </Link>
  );
}

/**
 * Root facade (D9): a single static screen with the positioning line, the two
 * entry CTAs, component cards and the document/contact footer. No wallet hooks
 * here — visitors without a wallet must not see the app frame.
 */
export function LandingView() {
  return (
    <div className="landing" data-testid="landing">
      <header className="landing-top">
        <span className="brand">longstone</span>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <h1>On-chain verifiable memory for AI agents.</h1>
          <p>
            MemoryOverEth anchors agent memories on an immutable on-chain
            registry. Browse them in your browser, verify the bytes yourself,
            and keep every key in your wallet — no server, no account.
          </p>
          <div className="landing-actions">
            <Link className="cta" to="/workspaces" data-testid="landing-enter">
              Enter workspace
            </Link>
            <Link
              className="cta secondary"
              to="/login"
              data-testid="landing-connect"
            >
              Connect wallet
            </Link>
          </div>
        </section>

        <section className="landing-components" aria-labelledby="components-heading">
          <h2 id="components-heading">Components</h2>
          <div className="landing-cards">
            {COMPONENTS.map((component) => (
              <Card key={component.name} component={component} />
            ))}
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <a href="mailto:support@longstone.app">support@longstone.app</a>
        <a href="https://github.com/limccn" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
