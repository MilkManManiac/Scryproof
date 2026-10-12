const b = (window as any).scryproofDesktop;
export const onAppSound = (s: () => void, d: (c: Uint8Array) => void, e: () => void) => b.onAppSound(s, d, e);
export const stopAppSound = () => b.stopAppSound();
