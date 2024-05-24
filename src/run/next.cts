import fs from 'fs/promises'
import { relative, resolve } from 'path'

// @ts-expect-error no types installed
import { patchFs } from 'fs-monkey'

import { getRequestContext } from './handlers/request-context.cjs'
import { getTracer } from './handlers/tracer.cjs'
import { getRegionalBlobStore } from './regional-blob-store.cjs'

console.time('import next server')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getRequestHandlers } = require('next/dist/server/lib/start-server.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ResponseCache = require('next/dist/server/response-cache/index.js').default

// Next.js standalone doesn't expose background work promises (such as generating fresh response
// while stale one is being served) that we could use so we regrettably have to use hacks to
// gain access to them so that we can explicitly track them to ensure they finish before function
// execution stops
const originalGet = ResponseCache.prototype.get
ResponseCache.prototype.get = function get(...getArgs: unknown[]) {
  if (!this.didAddBackgroundWorkTracking) {
    if (typeof this.batcher !== 'undefined') {
      const originalBatcherBatch = this.batcher.batch
      this.batcher.batch = async (key: string, fn: (...args: unknown[]) => unknown) => {
        const trackedFn = async (...workFnArgs: unknown[]) => {
          const workPromise = fn(...workFnArgs)
          const requestContext = getRequestContext()
          if (requestContext && workPromise instanceof Promise) {
            requestContext.trackBackgroundWork(workPromise)
          }
          return await workPromise
        }

        return originalBatcherBatch.call(this.batcher, key, trackedFn)
      }
    } else if (typeof this.pendingResponses !== 'undefined') {
      const backgroundWork = new Map<string, () => void>()

      const originalPendingResponsesSet = this.pendingResponses.set
      this.pendingResponses.set = async (key: string, value: unknown) => {
        const requestContext = getRequestContext()
        if (requestContext && !this.pendingResponses.has(key)) {
          const workPromise = new Promise<void>((_resolve) => {
            backgroundWork.set(key, _resolve)
          })

          requestContext.trackBackgroundWork(workPromise)
        }
        return originalPendingResponsesSet.call(this.pendingResponses, key, value)
      }

      const originalPendingResponsesDelete = this.pendingResponses.delete
      this.pendingResponses.delete = async (key: string) => {
        const _resolve = backgroundWork.get(key)
        if (_resolve) {
          _resolve()
        }
        return originalPendingResponsesDelete.call(this.pendingResponses, key)
      }
    }

    this.didAddBackgroundWorkTracking = true
  }
  return originalGet.apply(this, getArgs)
}

console.timeEnd('import next server')

type FS = typeof import('fs')

export async function getMockedRequestHandlers(...args: Parameters<typeof getRequestHandlers>) {
  const tracer = getTracer()
  return tracer.withActiveSpan('mocked request handler', async () => {
    const ofs = { ...fs }

    const { encodeBlobKey } = await import('../shared/blobkey.js')

    async function readFileFallbackBlobStore(...fsargs: Parameters<FS['promises']['readFile']>) {
      const [path, options] = fsargs
      try {
        // Attempt to read from the disk
        // important to use the `import * as fs from 'fs'` here to not end up in a endless loop
        return await ofs.readFile(path, options)
      } catch (error) {
        // only try to get .html files from the blob store
        if (typeof path === 'string' && path.endsWith('.html')) {
          const store = getRegionalBlobStore()
          const relPath = relative(resolve('.next/server/pages'), path)

          const file = await getTracer().withActiveSpan(`blob readFile ${relPath}`, async () => {
            return await store.get(await encodeBlobKey(relPath))
          })

          if (file !== null) {
            const requestContext = getRequestContext()
            if (requestContext) {
              requestContext.usedFsRead = true
            }

            return file
          }
        }

        throw error
      }
    }

    // patch the file system for fs.promises with operations to fallback on the blob store
    patchFs(
      {
        readFile: readFileFallbackBlobStore,
      },
      // eslint-disable-next-line n/global-require, @typescript-eslint/no-var-requires
      require('fs').promises,
    )

    return getRequestHandlers(...args)
  })
}
