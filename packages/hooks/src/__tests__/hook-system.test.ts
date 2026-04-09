import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HookSystem, setHookErrorHandler } from '../hook-system.ts'

// Store the default handler so we can restore it
const defaultErrorHandler = vi.fn()

describe('HookSystem', () => {
  let hooks: HookSystem

  beforeEach(() => {
    hooks = new HookSystem()
    setHookErrorHandler(defaultErrorHandler)
  })

  afterEach(() => {
    defaultErrorHandler.mockReset()
  })

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  describe('actions', () => {
    it('registers and dispatches an action', async () => {
      hooks.addAction('test:greet', (name: string) => `Hello, ${name}!`)
      const result = await hooks.doAction('test:greet', 'World')
      expect(result).toBe('Hello, World!')
    })

    it('supports async action handlers', async () => {
      hooks.addAction('test:async', async (x: number) => x * 2)
      const result = await hooks.doAction('test:async', 5)
      expect(result).toBe(10)
    })

    it('throws on duplicate action registration', () => {
      hooks.addAction('test:dup', () => 'first')
      expect(() => hooks.addAction('test:dup', () => 'second')).toThrow(
        'Action handler already registered for "test:dup"'
      )
    })

    it('throws on doAction with no handler', async () => {
      await expect(hooks.doAction('test:missing', null)).rejects.toThrow(
        'No action handler registered for "test:missing"'
      )
    })

    it('tryAction returns null when no handler', async () => {
      const result = await hooks.tryAction('test:missing', null)
      expect(result).toBeNull()
    })

    it('tryAction returns result when handler exists', async () => {
      hooks.addAction('test:exists', () => 42)
      const result = await hooks.tryAction('test:exists', null)
      expect(result).toBe(42)
    })
  })

  // -----------------------------------------------------------------------
  // Broadcasts
  // -----------------------------------------------------------------------

  describe('broadcasts', () => {
    it('fires broadcast to all listeners', async () => {
      const calls: string[] = []
      hooks.onBroadcast('test:event', () => { calls.push('a') })
      hooks.onBroadcast('test:event', () => { calls.push('b') })

      await hooks.broadcast('test:event', {})
      expect(calls).toEqual(['a', 'b'])
    })

    it('respects priority ordering (lower first)', async () => {
      const calls: string[] = []
      hooks.onBroadcast('test:event', () => { calls.push('late') }, 20)
      hooks.onBroadcast('test:event', () => { calls.push('early') }, 5)
      hooks.onBroadcast('test:event', () => { calls.push('default') }, 10)

      await hooks.broadcast('test:event', {})
      expect(calls).toEqual(['early', 'default', 'late'])
    })

    it('does not throw when no listeners', async () => {
      await expect(hooks.broadcast('test:nobody', {})).resolves.toBeUndefined()
    })

    it('catches listener errors and continues', async () => {
      const calls: string[] = []

      hooks.onBroadcast('test:event', () => { throw new Error('boom') })
      hooks.onBroadcast('test:event', () => { calls.push('survived') })

      await hooks.broadcast('test:event', {})
      expect(calls).toEqual(['survived'])
      expect(defaultErrorHandler).toHaveBeenCalledOnce()
    })

    it('broadcastSync fires synchronously', () => {
      const calls: string[] = []
      hooks.onBroadcast('test:sync', () => { calls.push('done') })

      hooks.broadcastSync('test:sync', {})
      expect(calls).toEqual(['done'])
    })

    it('fires registered side-channel when matching option key is present', async () => {
      const sidePayloads: unknown[] = []

      hooks.registerSideChannel('activity', {
        broadcastName: 'activity',
        buildPayload: ({ broadcastName, payload, optionValue }) => ({
          broadcastName,
          activity: optionValue,
          metadata: payload,
        }),
      })

      hooks.onBroadcast('activity', (payload) => { sidePayloads.push(payload) })

      await hooks.broadcast(
        'billing:wallet_low',
        { walletId: 'wal_1' },
        { activity: { entityType: 'wallet', entityId: 'wal_1', action: 'low_balance' } }
      )

      expect(sidePayloads).toHaveLength(1)
      expect(sidePayloads[0]).toMatchObject({
        broadcastName: 'billing:wallet_low',
        activity: { entityType: 'wallet', entityId: 'wal_1', action: 'low_balance' },
        metadata: { walletId: 'wal_1' },
      })
    })

    it('does not fire side-channel when option key is absent', async () => {
      const sidePayloads: unknown[] = []

      hooks.registerSideChannel('activity', {
        broadcastName: 'activity',
        buildPayload: ({ optionValue }) => ({ activity: optionValue }),
      })

      hooks.onBroadcast('activity', (payload) => { sidePayloads.push(payload) })

      await hooks.broadcast('billing:wallet_low', { walletId: 'wal_1' })
      expect(sidePayloads).toHaveLength(0)
    })

    it('supports multiple side-channels on one broadcast', async () => {
      const activityPayloads: unknown[] = []
      const auditPayloads: unknown[] = []

      hooks.registerSideChannel('activity', {
        broadcastName: 'activity',
        buildPayload: ({ optionValue }) => ({ activity: optionValue }),
      })
      hooks.registerSideChannel('audit', {
        broadcastName: 'audit:log',
        buildPayload: ({ broadcastName, optionValue }) => ({ source: broadcastName, audit: optionValue }),
      })

      hooks.onBroadcast('activity', (p) => { activityPayloads.push(p) })
      hooks.onBroadcast('audit:log', (p) => { auditPayloads.push(p) })

      await hooks.broadcast(
        'contact:created',
        { id: 'ct_1' },
        { activity: { action: 'created' }, audit: { level: 'info' } }
      )

      expect(activityPayloads).toHaveLength(1)
      expect(auditPayloads).toHaveLength(1)
      expect(auditPayloads[0]).toMatchObject({ source: 'contact:created', audit: { level: 'info' } })
    })

    it('catches side-channel buildPayload errors and continues', async () => {
      const calls: string[] = []

      hooks.registerSideChannel('bad', {
        broadcastName: 'bad:channel',
        buildPayload: () => { throw new Error('buildPayload boom') },
      })

      hooks.onBroadcast('test:event', () => { calls.push('main') })

      await hooks.broadcast('test:event', {}, { bad: true })
      expect(calls).toEqual(['main'])
      expect(defaultErrorHandler).toHaveBeenCalledOnce()
    })

    it('catches side-channel listener errors and continues', async () => {
      const calls: string[] = []

      hooks.registerSideChannel('audit', {
        broadcastName: 'audit:log',
        buildPayload: ({ optionValue }) => ({ audit: optionValue }),
      })

      hooks.onBroadcast('audit:log', () => { throw new Error('listener boom') })
      hooks.onBroadcast('audit:log', () => { calls.push('second listener survived') })

      await hooks.broadcast('test:event', {}, { audit: { level: 'info' } })
      expect(calls).toEqual(['second listener survived'])
      expect(defaultErrorHandler).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------

  describe('filters', () => {
    it('applies filters as a waterfall', async () => {
      hooks.addFilter<number>('test:double', (v) => v * 2)
      hooks.addFilter<number>('test:double', (v) => v + 1)

      const result = await hooks.applyFilter('test:double', 5)
      expect(result).toBe(11) // (5 * 2) + 1
    })

    it('returns initial value when no filters', async () => {
      const result = await hooks.applyFilter('test:empty', 'unchanged')
      expect(result).toBe('unchanged')
    })

    it('respects priority ordering', async () => {
      hooks.addFilter<string>('test:order', (v) => v + '-late', 20)
      hooks.addFilter<string>('test:order', (v) => v + '-early', 5)

      const result = await hooks.applyFilter('test:order', 'start')
      expect(result).toBe('start-early-late')
    })

    it('scope-filtered: only runs matching + unscoped', async () => {
      hooks.addFilter<string[]>('routes', (v) => [...v, 'global'], { scope: undefined })
      hooks.addFilter<string[]>('routes', (v) => [...v, 'company'], { scope: 'company' })
      hooks.addFilter<string[]>('routes', (v) => [...v, 'location'], { scope: 'location' })

      const companyRoutes = await hooks.applyFilter('routes', [], { scope: 'company' })
      expect(companyRoutes).toEqual(['global', 'company'])

      const locationRoutes = await hooks.applyFilter('routes', [], { scope: 'location' })
      expect(locationRoutes).toEqual(['global', 'location'])
    })

    it('no scope query: runs all filters regardless of scope', async () => {
      hooks.addFilter<string[]>('all', (v) => [...v, 'a'], { scope: 'x' })
      hooks.addFilter<string[]>('all', (v) => [...v, 'b'], { scope: 'y' })
      hooks.addFilter<string[]>('all', (v) => [...v, 'c'])

      const result = await hooks.applyFilter('all', [])
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('applyFilterSync works synchronously', () => {
      hooks.addFilter<number>('test:sync', (v) => v + 10)
      const result = hooks.applyFilterSync('test:sync', 5)
      expect(result).toBe(15)
    })

    it('catches filter errors and continues with previous value', async () => {
      hooks.addFilter<number>('test:err', (v) => v + 1)
      hooks.addFilter<number>('test:err', () => { throw new Error('boom') })
      hooks.addFilter<number>('test:err', (v) => v + 100)

      const result = await hooks.applyFilter('test:err', 0)
      // First filter: 0 + 1 = 1
      // Second filter: throws, value stays 1
      // Third filter: 1 + 100 = 101
      expect(result).toBe(101)
      expect(defaultErrorHandler).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // Scoped API
  // -----------------------------------------------------------------------

  describe('createScopedAPI', () => {
    it('tags registrations with plugin ID', async () => {
      const scoped = hooks.createScopedAPI('my-tool')
      scoped.addAction('my-tool:do', () => 'ok')

      const result = await hooks.doAction('my-tool:do', null)
      expect(result).toBe('ok')
    })

    it('removePluginRegistrations clears all registrations for a plugin', async () => {
      const broadcastCalls: string[] = []
      const scoped = hooks.createScopedAPI('my-tool')
      scoped.addAction('my-tool:do', () => 'ok')
      scoped.onBroadcast('my-tool:event', () => { broadcastCalls.push('should not fire') })
      scoped.addFilter<string>('my-tool:filter', (v) => v + '-modified')

      hooks.removePluginRegistrations('my-tool')

      // Action should be gone
      const actionResult = await hooks.tryAction('my-tool:do', null)
      expect(actionResult).toBeNull()

      // Broadcast listener should be gone
      await hooks.broadcast('my-tool:event', {})
      expect(broadcastCalls).toEqual([])

      // Filter should be gone — initial value passes through unchanged
      const filterResult = await hooks.applyFilter('my-tool:filter', 'original')
      expect(filterResult).toBe('original')
    })

    it('creating a new scoped API cleans previous registrations', async () => {
      const scoped1 = hooks.createScopedAPI('my-tool')
      scoped1.addAction('my-tool:do', () => 'v1')

      // Re-creating scoped API (HMR scenario) cleans up
      const scoped2 = hooks.createScopedAPI('my-tool')
      scoped2.addAction('my-tool:do', () => 'v2')

      const result = await hooks.doAction('my-tool:do', null)
      expect(result).toBe('v2')
    })
  })

  // -----------------------------------------------------------------------
  // Hook declaration
  // -----------------------------------------------------------------------

  describe('hook declaration', () => {
    it('registers and queries hook names', () => {
      hooks.registerHook('my-hook')
      expect(hooks.hasHook('my-hook')).toBe(true)
      expect(hooks.hasHook('other')).toBe(false)
      expect(hooks.getRegisteredHooks()).toContain('my-hook')
    })
  })
})
