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
  vi.resetModules()

  await startMockBlobStore(ctx)
})

it<FixtureTestContext>('should fail build when netlify forms are used', async (ctx) => {
  await createFixture('netlify-forms', ctx)

  const runPluginPromise = runPlugin(ctx)

  await expect(runPluginPromise).rejects.toThrow(
    '@opennextjs/netlify@5 requires migration steps to support Netlify Forms. Refer to https://ntl.fyi/next-runtime-forms-migration for migration example.',
  )
})

it<FixtureTestContext>('should not fail build when netlify forms are used with workaround', async (ctx) => {
  await createFixture('netlify-forms-workaround', ctx)

  const runPluginPromise = runPlugin(ctx)

  await expect(runPluginPromise).resolves.not.toThrow()
})
