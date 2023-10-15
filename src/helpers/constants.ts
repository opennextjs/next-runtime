import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url))
export const PLUGIN_DIR = resolve(`${MODULE_DIR}../..`)
export const TASK_DIR = process.cwd()

export const BUILD_DIR = `${TASK_DIR}/.netlify/.next`

export const FUNCTIONS_INTERNAL_DIR = `${TASK_DIR}/.netlify/functions-internal`
export const FUNCTIONS_URL = '/.netlify/functions'

export const SERVER_HANDLER_NAME = '___netlify-server-handler'
export const SERVER_HANDLER_DIR = `${FUNCTIONS_INTERNAL_DIR}/${SERVER_HANDLER_NAME}`
export const SERVER_HANDLER_URL = `${FUNCTIONS_URL}/${SERVER_HANDLER_NAME}`
