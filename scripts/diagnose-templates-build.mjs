// Throwaway diagnostic (do not merge).
//
// Goal: attribute the ~37s that the `@nuxt/ui-templates` postinstall (`vite build`)
// spends on Windows CI *after* the build itself reports "built in ~1.4s".
//
// It runs the same build vite would run, then reports:
//   - when the build() promise resolves (work is done)
//   - what, if anything, still keeps the event loop alive (getActiveResourcesInfo)
//   - when `beforeExit` fires (event loop actually drains)
//   - `exit` timing
// The caller wraps this in Measure-Command, so the delta between build-resolved and
// total OS wall time is the true exit lag.
//
// Reading the result:
//   * resolved fast, active resources = [], beforeExit fast, but wall time +37s
//       -> the tail is *after* node's JS exit: native thread join (rolldown napi)
//          or Defender scanning node.exe on close. The Defender A/B step decides which.
//   * active resources non-empty (Timeout / ThreadPoolWork / ...) and beforeExit +37s
//       -> a plugin (Beasties / htmlnano) leaked a handle / libuv threadpool work.

import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const t0 = performance.now()
const s = () => `${((performance.now() - t0) / 1000).toFixed(2)}s`
let resolvedAt = null

process.on('beforeExit', () => {
  const lag = resolvedAt == null ? 'n/a' : `${((performance.now() - resolvedAt) / 1000).toFixed(2)}s`
  console.log(`[${s()}] beforeExit — event loop drained (lag since build resolved: ${lag})`)
})
process.on('exit', () => {
  console.log(`[${s()}] exit event fired`)
})

const here = dirname(fileURLToPath(import.meta.url))
const templatesDir = resolve(here, '..', 'packages', 'ui-templates')
process.chdir(templatesDir)

console.log(`[${s()}] starting vite build() in ${templatesDir}`)
const { build } = await import('vite')
await build({ root: templatesDir })
resolvedAt = performance.now()

console.log('::group::templates-build diagnostics')
console.log(`[${s()}] build() promise resolved`)
console.log(`[${s()}] active resources keeping the loop alive: ${JSON.stringify(process.getActiveResourcesInfo())}`)
console.log('::endgroup::')
