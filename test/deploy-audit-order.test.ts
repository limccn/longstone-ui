import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

describe('deploy workflow audit gates', () => {
  it('runs the bundle script (not pnpm built-in audit) after build', () => {
    const build = workflow.indexOf('pnpm --dir app build');
    const bundleAudit = workflow.indexOf('pnpm --dir app run audit');
    const dependencyAudit = workflow.indexOf('pnpm audit --prod');

    expect(bundleAudit).toBeGreaterThan(-1);
    expect(workflow).not.toMatch(/pnpm --dir app audit(?:\s|$)/);
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(bundleAudit);
    expect(bundleAudit).toBeLessThan(dependencyAudit);
  });

  it('does not mask either audit with a fallback', () => {
    expect(workflow).not.toMatch(/\|\|\s*true/);
    expect(workflow).not.toMatch(/continue-on-error/);
  });
});
