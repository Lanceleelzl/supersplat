import fs from 'fs/promises';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';

const input = 'dist/index.css';

async function run() {
  try {
    const css = await fs.readFile(input, 'utf8');
    const result = await postcss([autoprefixer]).process(css, { from: undefined });
    await fs.writeFile(input, result.css, 'utf8');
    console.log('PostCSS autoprefixer applied to', input);
  } catch (e) {
    console.error('PostCSS processing failed:', e);
    process.exitCode = 1;
  }
}

run();
