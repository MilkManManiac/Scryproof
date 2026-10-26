/** Core Audio process taps arrived with macOS 14.2 (Darwin 23.2). */
export function macAudioSupported(osRelease, helperExists) {
  const [major, minor] = String(osRelease).split('.').map(Number);
  return helperExists === true && (major > 23 || (major === 23 && minor >= 2));
}
