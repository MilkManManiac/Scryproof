// Native system/app audio; no driver and no third-party dependency.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mac-audio');
if (process.platform !== 'darwin') throw new Error('Build mac-audio on a Mac with Xcode command line tools');
execFileSync('xcrun', ['swiftc', '-O', '-swift-version', '5', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.2`, '-framework', 'AppKit', '-framework', 'AVFoundation', '-framework', 'CoreAudio', '-o', join(dir, 'mac-audio'), join(dir, 'PCMWriter.swift'), join(dir, 'ProcessSelection.swift'), join(dir, 'MacAudio.swift')], { stdio: 'inherit' });
console.log('built mac-audio/mac-audio');
