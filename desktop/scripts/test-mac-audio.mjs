import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'mac-audio');
const scratch = mkdtempSync(join(tmpdir(), 'sp-mac-native-'));
try {
  const exe = join(scratch, 'native-tests');
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-o', exe, ...['PCMWriter.swift', 'ProcessSelection.swift', 'NativeTests.swift'].map(name => join(source, name))], { stdio: 'inherit' });
  execFileSync(exe, [], { stdio: 'inherit' });
} finally { rmSync(scratch, { recursive: true, force: true }); }
