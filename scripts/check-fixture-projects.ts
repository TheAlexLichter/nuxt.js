/**
 * CI selects fixture-test projects by glob (`--project "fixtures:vite-built-*"`),
 * so a project added to the matrix under a new prefix silently runs nowhere:
 * vitest does not warn about projects no one selected and CI stays green.
 *
 * This fails if any project in `test/fixture-projects.ts` is not matched by at
 * least one `--project` pattern in `.github/workflows/ci.yml`.
 *
 * Two things it deliberately does not do:
 * - it only reads double-quoted `--project "..."` patterns, so a job written
 *   with single quotes reads as no coverage and fails here rather than passing
 *   silently — keep the double-quoted form when adding jobs;
 * - it ignores when a job runs. A project selected only by a merge-queue job
 *   counts as covered, even though it does not run on pull requests.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { consola } from 'consola'

import { fixtureMatrix, fixtureProjectName } from '../test/fixture-projects.ts'

const workflow = readFileSync(fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)), 'utf-8')

const patterns = [...workflow.matchAll(/--project "([^"]+)"/g)].map(match => match[1]!)

if (!patterns.length) {
  consola.error('No `--project` patterns found in ci.yml — has the fixture matrix moved?')
  process.exit(1)
}

const matchers = patterns.map(pattern => new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.*')}$`))

const uncovered = fixtureMatrix
  .map(entry => fixtureProjectName(entry))
  .filter(name => !matchers.some(matcher => matcher.test(name)))

if (uncovered.length) {
  consola.error(`These fixture projects are not selected by any job in ci.yml, so they never run:\n${uncovered.map(name => `  - ${name}`).join('\n')}`)
  consola.error(`\nci.yml selects: ${patterns.join(', ')}`)
  process.exit(1)
}

consola.success(`All ${fixtureMatrix.length} fixture projects are selected by at least one job in ci.yml (some of which only run in the merge queue).`)
