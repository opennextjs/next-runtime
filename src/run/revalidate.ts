import type { ServerResponse } from 'node:http'
import { isPromise } from 'node:util/types'

import type { NextApiResponse } from 'next'

import type { RequestContext } from './handlers/request-context.cjs'

type ResRevalidateMethod = NextApiResponse['revalidate']

function isRevalidateMethod(
  key: string,
  nextResponseField: unknown,
): nextResponseField is ResRevalidateMethod {
  return key === 'revalidate' && typeof nextResponseField === 'function'
}

// Needing to proxy the response object to intercept the revalidate call for on-demand revalidation on page routes
export const nextResponseProxy = (res: ServerResponse, requestContext: RequestContext) => {
  return new Proxy(res, {
    get(target: ServerResponse, key: string) {
      const originalValue = Reflect.get(target, key)
      if (isRevalidateMethod(key, originalValue)) {
        return function newRevalidate(...args: Parameters<ResRevalidateMethod>) {
          requestContext.didPagesRouterOnDemandRevalidate = true

          const result = originalValue.apply(target, args)
          if (result && isPromise(result)) {
            requestContext.trackBackgroundWork(result, 'res.revalidate')
          }

          return result
        }
      }
      return originalValue
    },
  })
}
