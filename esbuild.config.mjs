import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');

// HTML template that wraps the bundled UI JS
const htmlTemplate = (jsCode) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${fs.readFileSync(path.resolve('src/ui/styles.css'), 'utf-8')}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    ${jsCode}
  </script>
</body>
</html>`;

// Plugin that injects bundled JS into HTML template
const htmlPlugin = {
  name: 'html-inject',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      try {
        const jsPath = path.resolve('dist/ui.js');
        const jsCode = fs.readFileSync(jsPath, 'utf-8');
        fs.writeFileSync(path.resolve('ui.html'), htmlTemplate(jsCode));
        console.log('[html-inject] ui.html generated');
      } catch (e) {
        console.error('[html-inject] Error:', e.message);
      }
    });
  },
};

// Build plugin code (Figma sandbox)
const pluginBuild = esbuild.context({
  entryPoints: ['src/plugin/code.ts'],
  bundle: true,
  outfile: 'code.js',
  platform: 'neutral',
  target: 'es2020',
  logLevel: 'info',
});

// Build UI code (browser iframe)
const uiBuild = esbuild.context({
  entryPoints: ['src/ui/ui.ts'],
  bundle: true,
  outdir: 'dist',
  platform: 'browser',
  target: 'es2020',
  logLevel: 'info',
  loader: { '.png': 'dataurl' },
  plugins: [htmlPlugin],
});

async function main() {
  const [pluginCtx, uiCtx] = await Promise.all([pluginBuild, uiBuild]);

  if (isWatch) {
    await Promise.all([pluginCtx.watch(), uiCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([pluginCtx.rebuild(), uiCtx.rebuild()]);
    await Promise.all([pluginCtx.dispose(), uiCtx.dispose()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
