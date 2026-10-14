/** Offers `text` as a file download named `name`. */
export function downloadText(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

/** 2026-10-14T20:19:25.123Z -> 20261014-201925, for file names. */
export function fileStamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
}
