import { getLogger } from 'lambda-local'
import { v4 } from 'uuid'
import { beforeEach, expect, it, vi } from 'vitest'
import { type FixtureTestContext } from '../utils/contexts.js'
import { createFixture, runPlugin } from '../utils/fixture.js'
import { generateRandomObjectID, startMockBlobStore } from '../utils/helpers.js'

getLogger().level = 'alert'

beforeEach<FixtureTestContext>(async (ctx) => {
  // set for each test a new deployID and siteID
  ctx.deployID = generateRandomObjectID()
  ctx.siteID = v4()
  vi.stubEnv('SITE_ID', ctx.siteID)
  vi.stubEnv('DEPLOY_ID', ctx.deployID)
  vi.stubEnv('NETLIFY_PURGE_API_TOKEN', 'fake-token')
  // hide debug logs in tests
  // vi.spyOn(console, 'debug').mockImplementation(() => {})

  await startMockBlobStore(ctx)
})

it<FixtureTestContext>('test', async (ctx) => {
  await createFixture('advanced-api-routes', ctx)

  const runPluginPromise = runPlugin(ctx)

  await expect(runPluginPromise).rejects.toThrow(
    '@opennextjs/netlify@5 does not support advanced API routes. The following API routes should be migrated to Netlify background or scheduled functions:',
  )

  // list API routes to migrate
  await expect(runPluginPromise).rejects.toThrow(
    '/api/hello-scheduled (type: "experimental-scheduled")',
  )
  await expect(runPluginPromise).rejects.toThrow(
    '/api/hello-background (type: "experimental-background")',
  )

  // links to migration example
  await expect(runPluginPromise).rejects.toThrow(
    'Refer to https://ntl.fyi/next-scheduled-bg-function-migration as migration example.',
  )
})
