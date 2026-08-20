import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * PROJECT_STATE.json is the machine-readable handoff between sessions, so it
 * being parseable is the one property that actually matters about it.
 *
 * This exists because it silently stopped being valid JSON for two whole
 * modules: an edit dropped a key's opening line and nothing ever checked.
 */
describe('PROJECT_STATE.json', () => {
  it('is valid JSON with the keys later sessions rely on', () => {
    const raw = readFileSync(join(ROOT, 'PROJECT_STATE.json'), 'utf8')
    const state = JSON.parse(raw)

    expect(state.current_module).toBeTruthy()
    expect(state.modules).toBeTypeOf('object')
    expect(Array.isArray(state.pending_user_actions)).toBe(true)
    expect(Array.isArray(state.launch_checklist)).toBe(true)
  })
})
