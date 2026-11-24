import { createStylexBunPlugin } from "@stylexjs/unplugin/bun";

// Styles are injected by the page itself (no generated CSS file to keep in step with the bundle).
// ponytail: StyleX calls this a development mode; for a local single-user app the cost is not felt.
export default createStylexBunPlugin({
  dev: false,
  runtimeInjection: true,
  useCSSLayers: false,
  unstable_moduleResolution: { type: "commonJS", rootDir: import.meta.dir },
});
