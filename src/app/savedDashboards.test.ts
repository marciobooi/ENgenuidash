import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planId } from './savedDashboards'
import type { Plan } from '../genui/types'

// The same dashboard has the same id however it was reached; another country is another dashboard.
const plan = (geo: string): Plan => ({ dataset: 'nrg_ind_ren', filters: { geo }, time: { kind: 'all' }, intent: 'snapshot', renewables: { tab: 'shares' } })

test('planId is stable and tells dashboards apart', () => {
  assert.equal(planId(plan('DE')), planId({ ...plan('DE'), notes: ['noMonthly'] }))
  assert.equal(planId(plan('DE')), planId({ ...plan('DE'), also: plan('FR') }))
  assert.notEqual(planId(plan('DE')), planId(plan('FR')))
})
