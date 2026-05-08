/**
 * App version — sourced directly from package.json so it can never
 * drift from the canonical version field.
 */
import pkg from '../../package.json'
export const APP_VERSION: string = pkg.version
