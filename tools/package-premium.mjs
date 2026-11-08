import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = JSON.parse(await fs.readFile(path.join(root, 'capture/premium-verification.json'), 'utf8'));
if (result.failures.length || result.routes !== 74) throw new Error('Verify the current build successfully before packaging.');
const name = `kaldan-premium-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
const output = path.join(root, name);
const entries = ['README.md', 'package.json', 'package-lock.json', 'start-pitch.bat', 'kaldan-site/README.md', 'kaldan-site/package.json', 'kaldan-site/package-lock.json', 'kaldan-site/render.mjs', 'kaldan-site/vite.config.mjs', 'kaldan-site/server.mjs', 'kaldan-site/server.test.mjs', 'kaldan-site/src', 'kaldan-site/public', 'kaldan-site/dist', 'tools/lib/chrome.mjs', 'tools/verify-premium.mjs', 'tools/package-premium.mjs', 'tools/premium-preview.mjs', 'capture/premium-verification.json'];
const script = `import pathlib,sys,json,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'x',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for entry in json.loads(sys.argv[3]):
  source=root/entry
  files=sorted(source.rglob('*')) if source.is_dir() else [source]
  for file in files:
   if file.is_file(): archive.write(file,file.relative_to(root).as_posix())
with zipfile.ZipFile(sys.argv[2]) as archive:
 assert archive.testzip() is None
 assert 'kaldan-site/dist/index.html' in archive.namelist()
 assert 'kaldan-site/server.mjs' in archive.namelist()
 print('Verified ZIP entries:',len(archive.namelist()))
`;
const command = spawnSync('python', ['-c', script, root, output, JSON.stringify(entries)], { stdio: 'inherit' });
if (command.error || command.status !== 0) throw command.error || new Error('ZIP creation failed. Python 3 is required for packaging.');
console.log(`${output}\n${((await fs.stat(output)).size / 1024 / 1024).toFixed(1)} MB`);
