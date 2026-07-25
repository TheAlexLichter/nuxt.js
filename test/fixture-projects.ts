/**
 * The fixture-test matrix, shared by `vitest.config.ts` (which turns it into
 * vitest projects) and `scripts/check-fixture-projects.ts` (which verifies CI
 * actually selects every project).
 */
export interface FixtureMatrixEntry {
  env: 'dev' | 'built'
  builder: 'vite' | 'rspack' | 'webpack' | 'nitro-vite'
  context: 'async' | 'default'
  manifest: 'manifest-on' | 'manifest-off'
}

export const fixtureMatrix: FixtureMatrixEntry[] = [
  // vite: all combinations
  { env: 'dev', builder: 'vite', context: 'async', manifest: 'manifest-on' },
  { env: 'dev', builder: 'vite', context: 'async', manifest: 'manifest-off' },
  { env: 'dev', builder: 'vite', context: 'default', manifest: 'manifest-on' },
  { env: 'dev', builder: 'vite', context: 'default', manifest: 'manifest-off' },
  { env: 'built', builder: 'vite', context: 'async', manifest: 'manifest-on' },
  { env: 'built', builder: 'vite', context: 'async', manifest: 'manifest-off' },
  { env: 'built', builder: 'vite', context: 'default', manifest: 'manifest-on' },
  { env: 'built', builder: 'vite', context: 'default', manifest: 'manifest-off' },
  // nitro-vite: only default context + manifest-on
  { env: 'dev', builder: 'nitro-vite', context: 'default', manifest: 'manifest-on' },
  { env: 'built', builder: 'nitro-vite', context: 'default', manifest: 'manifest-on' },
  // rspack: only manifest-on
  { env: 'dev', builder: 'rspack', context: 'async', manifest: 'manifest-on' },
  { env: 'built', builder: 'rspack', context: 'async', manifest: 'manifest-on' },
  { env: 'built', builder: 'rspack', context: 'default', manifest: 'manifest-on' },
  // webpack: only manifest-on
  { env: 'dev', builder: 'webpack', context: 'async', manifest: 'manifest-on' },
  { env: 'built', builder: 'webpack', context: 'async', manifest: 'manifest-on' },
  { env: 'built', builder: 'webpack', context: 'default', manifest: 'manifest-on' },
]

export function fixtureProjectName (entry: FixtureMatrixEntry) {
  return `fixtures:${entry.builder}-${entry.env}-${entry.context}-${entry.manifest}`
}
