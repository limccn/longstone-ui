import { Link } from 'react-router-dom';

/**
 * hisaishi component page (`/hisaishi`). It used to be a standalone Pages
 * portal at `hisaishi.longstone.app`; the content now lives on the canonical
 * host so the component docs share one build, one deployment and one route
 * table.
 */
export function HisaishiView() {
  return (
    <section className="doc portal" data-testid="hisaishi">
      <h1>hisaishi</h1>
      <p className="portal-tagline">keyless memory gateway</p>

      <p>
        The keyless staging, pinning and batch gateway for MemoryOverEth: it
        prepares memory commitments for signing and never holds a wallet key.
      </p>
      <p className="hint">
        Runs as a local Node + SQLite process or as a Cloudflare Worker, with
        one shared HTTP contract and one shared contract suite.
      </p>

      <a
        className="portal-cta"
        href="https://api.longstone.app/v1/health"
        target="_blank"
        rel="noreferrer"
      >
        Gateway health (api.longstone.app/v1/health)
      </a>

      <ul className="portal-links">
        <li>
          <span className="label">Source</span>
          <a href="https://github.com/limccn/hisaishi" target="_blank" rel="noreferrer">
            github.com/limccn/hisaishi
          </a>
        </li>
        <li>
          <span className="label">README</span>
          <a
            href="https://github.com/limccn/hisaishi/blob/main/README.md"
            target="_blank"
            rel="noreferrer"
          >
            README.md — routes, limits, deployment
          </a>
        </li>
        <li>
          <span className="label">Package</span>
          <a
            href="https://www.npmjs.com/package/@limccn/hisaishi-gateway"
            target="_blank"
            rel="noreferrer"
          >
            @limccn/hisaishi-gateway on npm
          </a>
        </li>
      </ul>

      <p className="portal-footer">
        Component page for the hisaishi gateway. Apache-2.0.{' '}
        <Link to="/">longstone.app</Link>
      </p>
    </section>
  );
}
