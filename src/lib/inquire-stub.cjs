// Replaces @protobufjs/inquire everywhere (dev + build).
// The real implementation uses eval() to dynamically require() optional
// Node modules — never reached in a browser bundle, but the EvenHub store
// scanner flags eval(), and Vite dev-mode ESM interop broke the previous
// ESM stub (require() received { default: fn } instead of the function).
// CJS keeps both esbuild dep-optimization and Rollup interop happy.
module.exports = function inquire(_moduleName) {
  return null
}
