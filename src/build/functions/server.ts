import { NetlifyPluginOptions } from '@netlify/build'
import { nodeFileTrace } from '@vercel/nft'
import { cp, mkdir, rm, writeFile } from 'fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import {
  PLUGIN_DIR,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  SERVER_FUNCTIONS_DIR,
  SERVER_HANDLER_DIR,
  SERVER_HANDLER_NAME,
} from '../constants.js'
import { copyNextDependencies, copyNextServerCode, writeTagsManifest } from '../content/server.js'

const copyHandlerDependencies = async () => {
  // trace the handler dependencies
  const { fileList } = await nodeFileTrace(
    [
      join(PLUGIN_DIR, 'dist/run/handlers/server.js'),
      join(PLUGIN_DIR, 'dist/run/handlers/cache.cjs'),
      join(PLUGIN_DIR, 'dist/run/handlers/next.cjs'),
    ],
    // base in this case is the directory where it should stop looking up.
    // by setting this to `/` we get absolute paths and don't have to worry about wrongly chaining it
    {
      base: '/',
      ignore: ['**/node_modules/next/**'],
    },
  )

  // if the parent directory of the plugin directory is not a @netlify folder we are consuming
  // the runtime from source and not over node_modules
  // this can be for example in the `netlify.toml` specified as the following
  //   [[plugins]]
  //   package = "../next-runtime-minimal"
  // in this case we use the PLUGIN_DIR for calculating the relative path
  const isRunFromSource = basename(join(PLUGIN_DIR, '..')) !== '@netlify'
  const cwd = isRunFromSource ? PLUGIN_DIR : process.cwd()

  // copy the handler dependencies
  await Promise.all(
    [...fileList].map(async (path) => {
      const absPath = `/${path}`
      // if the file that got traced is inside the plugin directory (like `dist/run/handlers/server.js`)
      // resolve it with the plugin directory like `<abs-path>/node_modules/@netlify/next-runtime`
      // if it is a node_module resolve it with the process working directory.
      const relPath = relative(path.includes(PLUGIN_NAME) ? PLUGIN_DIR : cwd, absPath)
      await cp(absPath, resolve(SERVER_HANDLER_DIR, relPath), { recursive: true })
    }),
  )
}

const writeHandlerManifest = () => {
  return writeFile(
    resolve(SERVER_HANDLER_DIR, `${SERVER_HANDLER_NAME}.json`),
    JSON.stringify({
      config: {
        name: 'Next.js Server Handler',
        generator: `${PLUGIN_NAME}@${PLUGIN_VERSION}`,
        nodeBundler: 'none',
        includedFiles: [
          `${SERVER_HANDLER_NAME}*`,
          'package.json',
          'dist/**',
          '.next/**',
          '.netlify/**',
          'node_modules/**',
        ],
        includedFilesBasePath: resolve(SERVER_HANDLER_DIR),
      },
      version: 1,
    }),
    'utf-8',
  )
}

const writePackageMetadata = async () => {
  await writeFile(resolve(SERVER_HANDLER_DIR, 'package.json'), JSON.stringify({ type: 'module' }))
}

const writeHandlerFile = async () => {
  await writeFile(
    resolve(SERVER_HANDLER_DIR, `${SERVER_HANDLER_NAME}.js`),
    `import handler from './dist/run/handlers/server.js';export default handler`,
  )
}

/**
 * Create a Netlify function to run the Next.js server
 */
export const createServerHandler = async ({
  constants,
}: Pick<NetlifyPluginOptions, 'constants'>) => {
  await rm(resolve(SERVER_FUNCTIONS_DIR), { recursive: true, force: true })
  await mkdir(resolve(SERVER_HANDLER_DIR, '.netlify'), { recursive: true })

  await Promise.all([
    copyNextServerCode({ constants }),
    copyNextDependencies({ constants }),
    writeTagsManifest({ constants }),
    copyHandlerDependencies(),
    writeHandlerManifest(),
    writePackageMetadata(),
    writeHandlerFile(),
  ])
}
