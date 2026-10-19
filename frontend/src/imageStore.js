import { createContext } from 'react'
import JSZip from 'jszip'

// Maps "name.png" -> base64 payload for figures extracted from the current document.
export const ImageContext = createContext({})

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// Index of the first markdown block containing `anchor`, matched on its first
// (side "start") or last (side "end") words; shorter fragments tolerate OCR typos.
function findBlock(blockTexts, anchor, side) {
  const words = norm(anchor).split(' ').filter(Boolean)
  if (words.length < 2) return -1
  for (const n of [words.length, 5, 3]) {
    if (n > words.length || n < 2) continue
    const needle = (side === 'start' ? words.slice(0, n) : words.slice(-n)).join(' ')
    const idx = blockTexts.findIndex((t) => t.includes(needle))
    if (idx !== -1) return idx
  }
  return -1
}

// Inserts the page's extracted figures into its OCR markdown near their original
// position, using the text printed right below (caption) / above each figure.
// Figures that can't be located are appended at the end.
export function placeFigures(markdown, figures = []) {
  if (!figures.length) return markdown
  const blocks = markdown.split(/\n{2,}/)
  const texts = blocks.map(norm)
  const before = blocks.map(() => [])
  const after = blocks.map(() => [])
  const head = []
  const tail = []
  for (const f of figures) {
    const ref = `![](images/${f.name})`
    let i = findBlock(texts, f.after_text || '', 'start')
    if (i !== -1) { before[i].push(ref); continue }
    i = findBlock(texts, f.before_text || '', 'end')
    if (i !== -1) { after[i].push(ref); continue }
    ;(f.at_start ? head : tail).push(ref)
  }
  const out = [...head]
  blocks.forEach((b, i) => out.push(...before[i], b, ...after[i]))
  out.push(...tail)
  return out.join('\n\n')
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Saves a plain .md when no extracted image is referenced, otherwise a .zip with the
// .md next to an images/ folder so the relative links keep working.
export async function downloadMarkdown(baseName, markdown, images) {
  const used = Object.entries(images).filter(([name]) => markdown.includes(`images/${name}`))
  if (used.length === 0) {
    saveBlob(new Blob([markdown], { type: 'text/markdown' }), `${baseName}.md`)
    return
  }
  const zip = new JSZip()
  zip.file(`${baseName}.md`, markdown)
  const folder = zip.folder('images')
  used.forEach(([name, b64]) => folder.file(name, b64, { base64: true }))
  saveBlob(await zip.generateAsync({ type: 'blob' }), `${baseName}.zip`)
}
