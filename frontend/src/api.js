const BASE = '/api'

export async function uploadPDF(file, signal) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function getSettings() {
  const res = await fetch(`${BASE}/settings`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load settings' }))
    throw new Error(err.detail || 'Failed to load settings')
  }
  return res.json()
}

export async function saveSettings(settings) {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to save settings' }))
    throw new Error(err.detail || 'Failed to save settings')
  }
  return res.json()
}

export async function getModels({ backendType, baseUrl, apiKey } = {}) {
  const params = new URLSearchParams()
  if (backendType) params.set('backend_type', backendType)
  if (baseUrl) params.set('base_url', baseUrl)
  if (apiKey !== undefined) params.set('api_key', apiKey)
  const qs = params.toString()
  const res = await fetch(`${BASE}/models${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load models' }))
    throw new Error(err.detail || 'Failed to load models')
  }
  const data = await res.json()
  return data.models
}

export async function ocrPage(imageBase64, pageNumber, model, signal) {
  const res = await fetch(`${BASE}/ocr-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64, page_number: pageNumber, model }),
    signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'OCR failed' }))
    throw new Error(err.detail || 'OCR failed')
  }
  return res.json()
}

export async function convertDirect(file, signal) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/convert-direct`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Conversion failed' }))
    throw new Error(err.detail || 'Conversion failed')
  }
  return res.json()
}

export async function convertToPdf(file, signal) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/convert-to-pdf`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Conversion failed' }))
    throw new Error(err.detail || 'Conversion failed')
  }
  return res.json()
}
