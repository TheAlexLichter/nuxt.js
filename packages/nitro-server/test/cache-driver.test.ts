import { promises as fsp } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { renameHook } = vi.hoisted(() => ({
  renameHook: { impl: null as null | ((from: string, to: string) => Promise<unknown>) },
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    default: actual,
    rename: (from: string, to: string) => renameHook.impl ? renameHook.impl(from, to) : actual.rename(from, to),
  }
})

const cacheDriver = (await import('../src/runtime/utils/cache-driver.mjs')).default

describe('cache-driver', () => {
  let base: string

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'nuxt-cache-driver-'))
  })

  afterEach(async () => {
    renameHook.impl = null
    await rm(base, { recursive: true, force: true })
  })

  it('falls back to the on-disk store when the entry is not in the LRU', async () => {
    const writer = cacheDriver({ base })
    await writer.setItem!('/_payload.json', 'payload', {})

    const reader = cacheDriver({ base })
    expect(await reader.hasItem('/_payload.json', {})).toBe(true)
    expect(await reader.getItem('/_payload.json', {})).toBe('payload')
  })

  it('leaves no temporary files behind after writing', async () => {
    const driver = cacheDriver({ base })
    await driver.setItem!('/_payload.json', 'payload', {})
    await driver.setItem!('/_payload.json', 'updated', {})

    const files = await readdir(base)
    expect(files.some(file => file.endsWith('.tmp'))).toBe(false)
    expect(files).toHaveLength(1)

    const reader = cacheDriver({ base })
    expect(await reader.getItem('/_payload.json', {})).toBe('updated')
  })

  it('retries a rename that Windows rejects while the entry is still open', async () => {
    let attempts = 0
    renameHook.impl = (from, to) => {
      if (++attempts <= 2) {
        return Promise.reject(Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' }))
      }
      renameHook.impl = null
      return fsp.rename(from, to)
    }

    const driver = cacheDriver({ base })
    await driver.setItem!('/_payload.json', 'payload', {})

    expect(attempts).toBe(3)
    expect(await cacheDriver({ base }).getItem('/_payload.json', {})).toBe('payload')
    const files = await readdir(base)
    expect(files.some(file => file.endsWith('.tmp'))).toBe(false)
  })

  it('keeps rendering when the cache entry cannot be written at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renameHook.impl = () => Promise.reject(Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' }))

    const driver = cacheDriver({ base })
    await expect(driver.setItem!('/_payload.json', 'payload', {})).resolves.toBeUndefined()
    expect(await driver.getItem('/_payload.json', {})).toBe('payload')
    expect(warn).toHaveBeenCalledOnce()

    renameHook.impl = null
    vi.restoreAllMocks()
    const files = await readdir(base)
    expect(files.some(file => file.endsWith('.tmp'))).toBe(false)
  })

  it('never exposes a partially written payload to concurrent readers', async () => {
    const oldValue = 'old-complete-payload'
    const newValue = 'new-complete-payload'

    const writer = cacheDriver({ base })
    await writer.setItem!('/_payload.json', oldValue, {})

    const originalWriteFile = fsp.writeFile
    let releaseWrite!: () => void
    const writeStalled = new Promise<void>((resolve) => { releaseWrite = resolve })
    let partialWritten!: () => void
    const partialOnDisk = new Promise<void>((resolve) => { partialWritten = resolve })

    // simulate a nonatomic write interrupted midway
    const spy = vi.spyOn(fsp, 'writeFile').mockImplementation(async (path, data, options) => {
      await originalWriteFile.call(fsp, path, String(data).slice(0, Math.floor(String(data).length / 2)), options as never)
      partialWritten()
      await writeStalled
      return originalWriteFile.call(fsp, path, data, options as never)
    })

    try {
      const write = writer.setItem!('/_payload.json', newValue, {})
      await Promise.race([partialOnDisk, write])

      const reader = cacheDriver({ base })
      const observed = await reader.getItem('/_payload.json', {})
      expect([oldValue, newValue, null]).toContain(observed)

      releaseWrite()
      await write
    } finally {
      releaseWrite()
      spy.mockRestore()
    }
  })
})
