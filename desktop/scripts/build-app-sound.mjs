// Compiles app-sound/AppSound.cs with the C# compiler every Windows has (.NET Framework 4.x).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app-sound');
const csc = join(process.env.WINDIR ?? 'C:\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
if (!existsSync(csc)) throw new Error(`No C# compiler at ${csc}`);
execFileSync(csc, ['/nologo', '/optimize', '/target:exe', '/out:app-sound.exe', 'AppSound.cs'], { cwd: dir, stdio: 'inherit' });
console.log('built app-sound/app-sound.exe');
