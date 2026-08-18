import * as esbuild from 'esbuild';
import { execSync } from 'child_process';

async function build() {
  console.log('[Build] Compiling React JS bundle with esbuild...');
  try {
    await esbuild.build({
      entryPoints: ['src/client/index.tsx'],
      bundle: true,
      outfile: 'public/app.bundle.js',
      minify: process.env.NODE_ENV === 'production',
      sourcemap: true,
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      },
      target: ['es2020'],
      loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
        '.jsx': 'jsx',
        '.js': 'js',
      },
    });
    console.log('[Build] JS bundle generated -> public/app.bundle.js');
  } catch (error) {
    console.error('[Build] JS compilation failed:', error);
    process.exit(1);
  }

  console.log('[Build] Compiling Tailwind CSS with @tailwindcss/cli...');
  try {
    execSync('npx @tailwindcss/cli -i src/client/styles.css -o public/app.css --minify', {
      stdio: 'inherit',
    });
    console.log('[Build] Tailwind CSS compiled -> public/app.css');
  } catch (error) {
    console.error('[Build] Tailwind build failed:', error);
    process.exit(1);
  }
}

build();
