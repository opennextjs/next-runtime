/* eslint-disable max-lines */
import { NetlifyConfig } from '@netlify/build'
import { yellowBright } from 'chalk'
import { readJSON } from 'fs-extra'
import { NextConfig } from 'next'
import { PrerenderManifest } from 'next/dist/build'
import { outdent } from 'outdent'
import { join } from 'pathe'

import { HANDLER_FUNCTION_PATH, HIDDEN_PATHS, ODB_FUNCTION_PATH } from '../constants'

import { getMiddleware } from './files'
import { RoutesManifest } from './types'
import {
  getApiRewrites,
  getPreviewRewrites,
  isApiRoute,
  redirectsForNextRoute,
  redirectsForNextRouteWithData,
  routeToDataRoute,
} from './utils'

const matchesMiddleware = (middleware: Array<string>, route: string): boolean =>
  middleware?.some((middlewarePath) => route.startsWith(middlewarePath))

const generateLocaleRedirects = ({
  i18n,
  basePath,
  trailingSlash,
}: Pick<NextConfig, 'i18n' | 'basePath' | 'trailingSlash'>): NetlifyConfig['redirects'] => {
  const redirects: NetlifyConfig['redirects'] = []
  // If the cookie is set, we need to redirect at the origin
  redirects.push({
    from: `${basePath}/`,
    to: HANDLER_FUNCTION_PATH,
    status: 200,
    force: true,
    conditions: {
      Cookie: ['NEXT_LOCALE'],
    },
  })
  i18n.locales.forEach((locale) => {
    if (locale === i18n.defaultLocale) {
      return
    }
    redirects.push({
      from: `${basePath}/`,
      to: `${basePath}/${locale}${trailingSlash ? '/' : ''}`,
      status: 301,
      conditions: {
        Language: [locale],
      },
      force: true,
    })
  })
  return redirects
}

export const generateStaticRedirects = ({
  netlifyConfig,
  nextConfig: { i18n, basePath },
}: {
  netlifyConfig: NetlifyConfig
  nextConfig: Pick<NextConfig, 'i18n' | 'basePath'>
}) => {
  // Static files are in `static`
  netlifyConfig.redirects.push({ from: `${basePath}/_next/static/*`, to: `/static/:splat`, status: 200 })

  if (i18n) {
    netlifyConfig.redirects.push({ from: `${basePath}/:locale/_next/static/*`, to: `/static/:splat`, status: 200 })
  }
}

// eslint-disable-next-line max-lines-per-function
export const generateRedirects = async ({
  netlifyConfig,
  nextConfig: { i18n, basePath, trailingSlash, appDir },
  buildId,
}: {
  netlifyConfig: NetlifyConfig
  nextConfig: Pick<NextConfig, 'i18n' | 'basePath' | 'trailingSlash' | 'appDir'>
  buildId: string
}) => {
  const { dynamicRoutes: prerenderedDynamicRoutes, routes: prerenderedStaticRoutes }: PrerenderManifest =
    await readJSON(join(netlifyConfig.build.publish, 'prerender-manifest.json'))

  const { dynamicRoutes, staticRoutes }: RoutesManifest = await readJSON(
    join(netlifyConfig.build.publish, 'routes-manifest.json'),
  )

  netlifyConfig.redirects.push(
    ...HIDDEN_PATHS.map((path) => ({
      from: `${basePath}${path}`,
      to: '/404.html',
      status: 404,
      force: true,
    })),
  )

  if (i18n && i18n.localeDetection !== false) {
    netlifyConfig.redirects.push(...generateLocaleRedirects({ i18n, basePath, trailingSlash }))
  }

  // This is only used in prod, so dev uses `next dev` directly
  netlifyConfig.redirects.push(
    // API routes always need to be served from the regular function
    ...getApiRewrites(basePath),
    // Preview mode gets forced to the function, to bypass pre-rendered pages, but static files need to be skipped
    ...(await getPreviewRewrites({ basePath, appDir })),
  )

  const middleware = await getMiddleware(netlifyConfig.build.publish)
  const routesThatMatchMiddleware = new Set<string>()

  const handlerRewrite = (from: string) => ({
    from: `${basePath}${from}`,
    to: HANDLER_FUNCTION_PATH,
    status: 200,
  })

  // Routes that match middleware need to always use the SSR function
  // This generates a rewrite for every middleware in every locale, both with and without a splat
  netlifyConfig.redirects.push(
    ...middleware
      .map((route) => {
        const unlocalized = [handlerRewrite(`${route}`), handlerRewrite(`${route}/*`)]
        if (i18n?.locales?.length > 0) {
          const localized = i18n?.locales?.map((locale) => [
            handlerRewrite(`/${locale}${route}`),
            handlerRewrite(`/${locale}${route}/*`),
            handlerRewrite(`/_next/data/${buildId}/${locale}${route}/*`),
          ])
          // With i18n, all data routes are prefixed with the locale, but the HTML also has the unprefixed default
          return [...unlocalized, ...localized]
        }
        return [...unlocalized, handlerRewrite(`/_next/data/${buildId}${route}/*`)]
      })
      // Flatten the array of arrays. Can't use flatMap as it might be 2 levels deep
      .flat(2),
  )

  const staticRouteEntries = Object.entries(prerenderedStaticRoutes)

  const staticRoutePaths = new Set<string>()

  // First add all static ISR routes
  staticRouteEntries.forEach(([route, { initialRevalidateSeconds }]) => {
    if (isApiRoute(route)) {
      return
    }
    staticRoutePaths.add(route)

    if (initialRevalidateSeconds === false) {
      // These can be ignored, as they're static files handled by the CDN
      return
    }
    // The default locale is served from the root, not the localised path
    if (i18n?.defaultLocale && route.startsWith(`/${i18n.defaultLocale}/`)) {
      route = route.slice(i18n.defaultLocale.length + 1)
      staticRoutePaths.add(route)
      if (matchesMiddleware(middleware, route)) {
        routesThatMatchMiddleware.add(route)
      }
      netlifyConfig.redirects.push(
        ...redirectsForNextRouteWithData({
          route,
          dataRoute: routeToDataRoute(route, buildId, i18n.defaultLocale),
          basePath,
          to: ODB_FUNCTION_PATH,
          force: true,
        }),
      )
    } else if (matchesMiddleware(middleware, route)) {
      //  Routes that match middleware can't use the ODB
      routesThatMatchMiddleware.add(route)
    } else {
      // ISR routes use the ODB handler
      netlifyConfig.redirects.push(
        // No i18n, because the route is already localized
        ...redirectsForNextRoute({ route, basePath, to: ODB_FUNCTION_PATH, force: true, buildId, i18n: null }),
      )
    }
  })
  // Add rewrites for all static SSR routes. This is Next 12+
  staticRoutes?.forEach((route) => {
    if (staticRoutePaths.has(route.page) || isApiRoute(route.page)) {
      // Prerendered static routes are either handled by the CDN or are ISR
      return
    }
    netlifyConfig.redirects.push(
      ...redirectsForNextRoute({ route: route.page, buildId, basePath, to: HANDLER_FUNCTION_PATH, i18n }),
    )
  })
  // Add rewrites for all dynamic routes (both SSR and ISR)
  dynamicRoutes.forEach((route) => {
    if (isApiRoute(route.page)) {
      return
    }
    if (route.page in prerenderedDynamicRoutes) {
      if (matchesMiddleware(middleware, route.page)) {
        routesThatMatchMiddleware.add(route.page)
      } else {
        netlifyConfig.redirects.push(
          ...redirectsForNextRoute({ buildId, route: route.page, basePath, to: ODB_FUNCTION_PATH, status: 200, i18n }),
        )
      }
    } else {
      // If the route isn't prerendered, it's SSR
      netlifyConfig.redirects.push(
        ...redirectsForNextRoute({ route: route.page, buildId, basePath, to: HANDLER_FUNCTION_PATH, i18n }),
      )
    }
  })

  // Final fallback
  netlifyConfig.redirects.push({
    from: `${basePath}/*`,
    to: HANDLER_FUNCTION_PATH,
    status: 200,
  })

  const middlewareMatches = routesThatMatchMiddleware.size
  if (middlewareMatches > 0) {
    console.log(
      yellowBright(outdent`
        There ${
          middlewareMatches === 1
            ? `is one statically-generated or ISR route`
            : `are ${middlewareMatches} statically-generated or ISR routes`
        } that match a middleware function, which means they will always be served from the SSR function and will not use ISR or be served from the CDN.
        If this was not intended, ensure that your middleware only matches routes that you intend to use SSR.
      `),
    )
  }
}
/* eslint-enable max-lines */
