// convert-frontend.cjs
// ESM-compatible conversion script (CommonJS) for converting .ts/.tsx to .js/.jsx in the frontend/src folder.
// Removes TypeScript-only syntax.

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, 'src');

function isTsFile(file) {
  return file.endsWith('.ts') || file.endsWith('.tsx');
}

function targetExt(file) {
  return file.endsWith('.tsx') ? '.jsx' : '.js';
}

function stripTypes(content) {
  // Remove type-only imports (heuristic)
  content = content.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^.]+\.tsx['"];?\s*$/gm, '');
  // Remove interface and type declarations
  content = content.replace(/export\s+interface\s+\w+\s*\{[^}]*\}\s*/gs, '');
  content = content.replace(/interface\s+\w+\s*\{[^}]*\}\s*/gs, '');
  content = content.replace(/export\s+type\s+\w+\s*=\s*[^;]+;\s*/g, '');
  // Remove generic type parameters (naive)
  content = content.replace(/<[^>]*>/g, '');
  // Remove colon type annotations
  content = content.replace(/:\s*[^=;\n]+(?=[=;\n])/g, '');
  // Remove "as" assertions
  content = content.replace(/\s+as\s+\w+/g, '');
  // Clean up extra blank lines
  content = content.replace(/\n{3,}/g, '\n\n');
  return content;
}

function processFile(filePath) {
  const ext = path.extname(filePath);
  const rel = path.relative(srcDir, filePath);
  const targetPath = path.join(srcDir, rel.replace(ext, targetExt(filePath)));
  const content = fs.readFileSync(filePath, 'utf8');
  const newContent = stripTypes(content);
  fs.writeFileSync(targetPath, newContent, 'utf8');
  fs.unlinkSync(filePath);
  console.log(`Converted ${filePath} -> ${targetPath}`);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (isTsFile(entry.name)) {
      processFile(fullPath);
    }
  }
}

walk(srcDir);
console.log('Frontend conversion completed.');
