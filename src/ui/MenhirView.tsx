import { Link } from 'react-router-dom';

/**
 * menhir component page (`/menhir`). It used to be a standalone Pages portal
 * at `menhir.longstone.app`; the content now lives on the canonical host so
 * the component docs share one build, one deployment and one route table.
 */
export function MenhirView() {
  return (
    <section className="doc portal" data-testid="menhir">
      <h1>menhir</h1>
      <p className="portal-tagline">on-chain memory commitments</p>

      <p>
        The <code>MemoryRegistry</code> contracts and{' '}
        <code>@limccn/menhir-core</code>: canonicalization (JCS RFC 8785),
        digests, and commitment hashing for MemoryOverEth.
      </p>
      <p className="hint">
        One hashing implementation is shared by the contract, the browser, the
        gateway and the CLI, so a hash drift fails a test instead of producing a
        commitment that only looks valid on chain.
      </p>

      <Link className="portal-cta" to="/verify">
        Verify a commitment (longstone.app/verify)
      </Link>

      <ul className="portal-links">
        <li>
          <span className="label">Source</span>
          <a href="https://github.com/limccn/menhir" target="_blank" rel="noreferrer">
            github.com/limccn/menhir
          </a>
        </li>
        <li>
          <span className="label">Getting started</span>
          <a
            href="https://github.com/limccn/menhir/blob/main/Getting-Started.md"
            target="_blank"
            rel="noreferrer"
          >
            Getting-Started.md — endpoints, deployments, gas baseline
          </a>
        </li>
        <li>
          <span className="label">Package</span>
          <a
            href="https://www.npmjs.com/package/@limccn/menhir-core"
            target="_blank"
            rel="noreferrer"
          >
            @limccn/menhir-core on npm
          </a>
        </li>
        <li>
          <span className="label">Contract</span>
          <a
            href="https://github.com/limccn/menhir/tree/main/contracts"
            target="_blank"
            rel="noreferrer"
          >
            contracts/ — MemoryRegistry (Base Sepolia)
          </a>
        </li>
      </ul>

      <p className="portal-footer">
        Component page for menhir. Apache-2.0. <Link to="/">longstone.app</Link>
      </p>
    </section>
  );
}
