// convert-frontend.js
// This script recursively converts TypeScript (.ts, .tsx) files in the frontend/src directory to JavaScript (.js, .jsx).
// It removes TypeScript-only syntax such as type annotations, interfaces, and type-only imports.
// After conversion, original .ts/.tsx files are deleted.

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');

function isTsFile(file) {
  return file.endsWith('.ts') || file.endsWith('.tsx');
}

function targetExt(file) {
  return file.endsWith('.tsx') ? '.jsx' : '.js';
}

function stripTypes(content) {
  // Remove import statements that only import types (e.g., "import { User } from '../App';")
  // Simple heuristic: if the imported identifier starts with an uppercase and is not used as a value later, we can drop the line.
  // We'll just remove any import that imports only types from a file that ends with .tsx (common for interfaces).
  content = content.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^.]+\.tsx['"];?\s*$/gm, '');

  // Remove interface and type declarations
  content = content.replace(/export\s+interface\s+\w+\s+\{[^}]*\}\s*/gs, '');
  content = content.replace(/interface\s+\w+\s+\{[^}]*\}\s*/gs, '');
  content = content.replace(/export\s+type\s+\w+\s*=\s*[^;]+;\s*/g, '');

  // Remove type annotations in variable declarations and function parameters
  // e.g., const [state, setState] = useState<User | null>(null);
  content = content.replace(/<[^>]*>/g, ''); // naive removal of generic type parameters
  // Remove colon type annotations (e.g., ": string" or ": User | null")
  content = content.replace(/:\s*[^=;\n]+(?=[=;\n])/g, '');

  // Remove "as" assertions
  content = content.replace(/\s+as\s+\w+/g, '');

  // Cleanup multiple empty lines
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
  // Delete original file
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
