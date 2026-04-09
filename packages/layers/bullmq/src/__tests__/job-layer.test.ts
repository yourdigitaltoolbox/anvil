/**
 * Tests for @ydtb/anvil-layer-bullmq (memory implementation).
 *
 * Proves the full JobLayer contract:
 * - enqueue returns a job ID
 * - registerHandler + enqueue triggers the handler
 * - getJob retrieves job state
 * - Job status transitions (waiting, completed, failed)
 * - Integration with createServer
 */

import { describe, it, expect, afterEach } from 'vitest'
import { defineApp, scope } from '@ydtb/anvil'
import { createServer, getLayer, provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import { memoryJobs } from '../memory.ts'

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  provideLayerResolver(null)
  provideHookSystem(null)
  provideContributions(null)
  provideLoggingLayerResolver(null)
})

// ---------------------------------------------------------------------------
// Unit: LayerConfig shape
// ---------------------------------------------------------------------------

describe('memoryJobs layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = memoryJobs()
    expect(config.id).toBe('jobs')
    expect(config._effectLayer).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Integration: full JobLayer contract via createServer
// ---------------------------------------------------------------------------

describe('job layer + createServer', () => {
  async function bootWithJobs() {
    const config = defineApp({
      brand: { name: 'Jobs Test' },
      layers: { jobs: memoryJobs() } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })
    const server = createServer({ config, tools: [] })
    await server.start()
    return server
  }

  it('enqueue returns a job ID', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    const id = await jobs.enqueue('test-job', { foo: 'bar' })
    expect(id).toBeDefined()
    expect(typeof id).toBe('string')

    await server.shutdown()
  })

  it('getJob retrieves enqueued job', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    const id = await jobs.enqueue('greet', { name: 'anvil' })
    const job = await jobs.getJob(id)

    expect(job).not.toBeNull()
    expect(job!.id).toBe(id)
    expect(job!.name).toBe('greet')
    expect(job!.data).toEqual({ name: 'anvil' })

    await server.shutdown()
  })

  it('getJob returns null for unknown ID', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    const job = await jobs.getJob('nonexistent')
    expect(job).toBeNull()

    await server.shutdown()
  })

  it('handler is called synchronously on enqueue', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    const processed: unknown[] = []
    jobs.registerHandler('process', async (data) => {
      processed.push(data)
    })

    await jobs.enqueue('process', { step: 1 })
    await jobs.enqueue('process', { step: 2 })

    expect(processed).toEqual([{ step: 1 }, { step: 2 }])

    await server.shutdown()
  })

  it('completed job has status "completed"', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    jobs.registerHandler('work', async () => {
      // success
    })

    const id = await jobs.enqueue('work', {})
    const job = await jobs.getJob(id)
    expect(job!.status).toBe('completed')

    await server.shutdown()
  })

  it('failed job has status "failed"', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    jobs.registerHandler('fail-job', async () => {
      throw new Error('boom')
    })

    const id = await jobs.enqueue('fail-job', {})
    const job = await jobs.getJob(id)
    expect(job!.status).toBe('failed')

    await server.shutdown()
  })

  it('job without handler stays "waiting"', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    const id = await jobs.enqueue('unhandled', { data: true })
    const job = await jobs.getJob(id)
    expect(job!.status).toBe('waiting')

    await server.shutdown()
  })

  it('multiple job names dispatch to correct handlers', async () => {
    const server = await bootWithJobs()
    const jobs = getLayer('jobs')

    const results: string[] = []
    jobs.registerHandler('alpha', async () => { results.push('alpha') })
    jobs.registerHandler('beta', async () => { results.push('beta') })

    await jobs.enqueue('beta', {})
    await jobs.enqueue('alpha', {})
    await jobs.enqueue('beta', {})

    expect(results).toEqual(['beta', 'alpha', 'beta'])

    await server.shutdown()
  })

  it('health check passes', async () => {
    const server = await bootWithJobs()

    const res = await server.app.request('/readyz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checks.jobs.status).toBe('ok')

    await server.shutdown()
  })
})
