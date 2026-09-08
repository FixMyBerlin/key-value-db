const encoder = new TextEncoder()

export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  const len = Math.max(aBytes.length, bBytes.length, 1)
  const aPad = new Uint8Array(len)
  const bPad = new Uint8Array(len)
  aPad.set(aBytes)
  bPad.set(bBytes)
  return crypto.subtle.timingSafeEqual(aPad, bPad) && aBytes.length === bBytes.length
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
