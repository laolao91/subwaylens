// Replaces @protobufjs/inquire in the browser bundle.
// The real implementation uses eval() to dynamically require() modules,
// which triggers the EvenHub store's static scanner. In a bundled browser
// context the dynamic-require path is never executed anyway, so returning
// null is equivalent behaviour.
export default function inquire(_moduleName: string): null {
  return null
}
