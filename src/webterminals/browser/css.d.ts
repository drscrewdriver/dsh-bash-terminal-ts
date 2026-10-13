// A stylesheet imported as text (the client build sets `loader: {'.css': 'text'}`).
//
// The declaration lives here because the client tsconfig runs with `types: []` (no
// bundler ambient types), so esbuild's own `*?raw`/`.css` module shims are not in
// scope - and an untyped import would be a silent `any` in the one place where a
// typo means the terminal renders without its stylesheet.

declare module "*.css" {
  const css: string;
  export default css;
}

declare module "@xterm/xterm/css/xterm.css" {
  const css: string;
  export default css;
}
