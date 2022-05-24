import type { NetlifyConfig } from '@netlify/build'
import { readJSON, writeJSON } from 'fs-extra'
import type { Header } from 'next/dist/lib/load-custom-routes'
import type { NextConfigComplete } from 'next/dist/server/config-shared'
import { join, dirname, relative } from 'pathe'
import slash from 'slash'

import { HANDLER_FUNCTION_NAME, ODB_FUNCTION_NAME } from '../constants'

const ROUTES_MANIFEST_FILE = 'routes-manifest.json'

type NetlifyHeaders = NetlifyConfig['headers']

// This is the minimal amount of typing required for now
// add other properties as needed from the routes-manifest.json
export type RoutesManifest = { headers: Header[] }

export interface RequiredServerFiles {
  version?: number
  config?: NextConfigComplete
  appDir?: string
  files?: string[]
  ignore?: string[]
}

export type NextConfig = Pick<RequiredServerFiles, 'appDir' | 'ignore'> &
  NextConfigComplete & {
    routesManifest?: RoutesManifest
  }

const defaultFailBuild = (message: string, { error }): never => {
  throw new Error(`${message}\n${error && error.stack}`)
}

export const getNextConfig = async function getNextConfig({
  publish,
  failBuild = defaultFailBuild,
}): Promise<NextConfig> {
  try {
    const { config, appDir, ignore, files }: RequiredServerFiles = await readJSON(
      join(publish, 'required-server-files.json'),
    )
    if (!config) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return failBuild('Error loading your Next config')
    }

    const routeManifestFile = files.find((f) => f.endsWith(ROUTES_MANIFEST_FILE))
    const routesManifest = (routeManifestFile ? await readJSON(routeManifestFile) : {}) as RoutesManifest

    // If you need access to other manifest files, you can add them here as well
    return { ...config, appDir, ignore, routesManifest }
  } catch (error: unknown) {
    return failBuild('Error loading your Next config', { error })
  }
}

/**
 * Returns all of the NextJS configuration stored within 'required-server-files.json'
 * To update the configuration within this file, use the 'updateRequiredServerFiles' method.
 */
export const getRequiredServerFiles = async (publish: string): Promise<RequiredServerFiles> => {
  const configFile = join(publish, 'required-server-files.json')
  return await readJSON(configFile)
}

/**
 * Writes a modified configuration object to 'required-server-files.json'.
 * To get the full configuration, use the 'getRequiredServerFiles' method.
 */
export const updateRequiredServerFiles = async (publish: string, modifiedConfig: RequiredServerFiles) => {
  const configFile = join(publish, 'required-server-files.json')
  await writeJSON(configFile, modifiedConfig)
}

const resolveModuleRoot = (moduleName) => {
  try {
    return dirname(relative(process.cwd(), require.resolve(`${moduleName}/package.json`, { paths: [process.cwd()] })))
  } catch {
    return null
  }
}

const DEFAULT_EXCLUDED_MODULES = ['sharp', 'electron']

export const configureHandlerFunctions = ({ netlifyConfig, publish, ignore = [] }) => {
  /* eslint-disable no-underscore-dangle */
  netlifyConfig.functions._ipx ||= {}
  netlifyConfig.functions._ipx.node_bundler = 'nft'

  /* eslint-enable no-underscore-dangle */
  ;[HANDLER_FUNCTION_NAME, ODB_FUNCTION_NAME].forEach((functionName) => {
    netlifyConfig.functions[functionName] ||= { included_files: [], external_node_modules: [] }
    netlifyConfig.functions[functionName].node_bundler = 'nft'
    netlifyConfig.functions[functionName].included_files ||= []
    netlifyConfig.functions[functionName].included_files.push(
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
      './public/locales/**',
      './next-i18next.config.js',
      `${publish}/server/**`,
      `${publish}/serverless/**`,
      `${publish}/*.json`,
      `${publish}/BUILD_ID`,
      `${publish}/static/chunks/webpack-middleware*.js`,
      `!${publish}/server/**/*.js.nft.json`,
      ...ignore.map((path) => `!${slash(path)}`),
    )

    const nextRoot = resolveModuleRoot('next')
    if (nextRoot) {
      netlifyConfig.functions[functionName].included_files.push(
        `!${nextRoot}/dist/server/lib/squoosh/**/*.wasm`,
        `!${nextRoot}/dist/next-server/server/lib/squoosh/**/*.wasm`,
        `!${nextRoot}/dist/compiled/webpack/bundle4.js`,
        `!${nextRoot}/dist/compiled/webpack/bundle5.js`,
      )
    }

    DEFAULT_EXCLUDED_MODULES.forEach((moduleName) => {
      const moduleRoot = resolveModuleRoot(moduleName)
      if (moduleRoot) {
        netlifyConfig.functions[functionName].included_files.push(`!${moduleRoot}/**/*`)
      }
    })
  })
}

/**
 * Persist NEXT.js custom headers to the Netlify configuration so the headers work with static files
 *
 * @param customHeaders - Custom headers defined in the Next.js configuration
 * @param netlifyHeaders - Existing headers that are already configured in the Netlify configuration
 */
export const generateCustomHeaders = (customHeaders: Header[] = [], netlifyHeaders: NetlifyHeaders = []) => {
  for (const { source, headers } of customHeaders) {
    netlifyHeaders.push({
      for: source,
      values: headers.reduce((builtHeaders, { key, value }) => {
        builtHeaders[key] = value

        return builtHeaders
      }, {}),
    })
  }
}
