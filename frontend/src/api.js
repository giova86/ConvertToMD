const BASE = '/api'

export async function uploadPDF(file) {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function ocrPage(imageBase64, pageNumber) {
  const res = await fetch(`${BASE}/ocr-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64, page_number: pageNumber }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'OCR failed' }))
    throw new Error(err.detail || 'OCR failed')
  }
  return res.json()
}
