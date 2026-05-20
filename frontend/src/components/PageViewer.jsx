import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, ArrowUpDown, Minus, Plus } from 'lucide-react'

// Vertical space consumed by padding + label (mt-3 12px + text line 16px + pad top/bottom 32px + 2px buffer)
const V_RESERVED = 62
// Horizontal space consumed by left+right padding
const H_RESERVED = 32

export default function PageViewer({ page, status }) {
  // zoom: 'fit' | 'fitV' | 'fitW' | number
  const [zoom, setZoom] = useState('fit')
  const [fitV, setFitV] = useState(1) // scale that fills available height
  const [fitW, setFitW] = useState(1) // scale that fills available width
  const areaRef = useRef(null)

  // Reset to fit when the page changes
  useEffect(() => {
    setZoom('fit')
  }, [page.page_number])

  // Recompute fit scales whenever container resizes or page dimensions change
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const compute = () => {
      const availH = el.clientHeight - V_RESERVED
      const availW = el.clientWidth  - H_RESERVED
      if (availH <= 0 || availW <= 0) return
      setFitV(availH / page.height)
      setFitW(availW / page.width)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [page.width, page.height])

  const fitBoth = Math.min(fitV, fitW)
  const effectiveScale =
    zoom === 'fit'  ? fitBoth :
    zoom === 'fitV' ? fitV    :
    zoom === 'fitW' ? fitW    :
    zoom

  const imgW = Math.round(page.width  * effectiveScale)
  const imgH = Math.round(page.height * effectiveScale)

  const curScale = typeof zoom === 'number' ? zoom : effectiveScale
  const zoomIn  = () => setZoom(Math.min(curScale * 1.25, 8))
  const zoomOut = () => setZoom(Math.max(curScale / 1.25, 0.05))

  const btnBase    = 'flex items-center justify-center rounded-md transition-colors'
  const btnIcon    = `${btnBase} w-7 h-7 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400`
  const btnText    = `${btnBase} text-xs px-2 py-1 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400`
  const btnActive  = 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'

  return (
    <div className="flex flex-col h-full">
      {/* ── Zoom bar ── */}
      <div className="flex items-center justify-center gap-1.5 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex-shrink-0">
        <button onClick={zoomOut} title="Zoom out" className={btnIcon}>
          <Minus className="w-3.5 h-3.5" />
        </button>

        <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 w-12 text-center tabular-nums select-none">
          {Math.round(effectiveScale * 100)}%
        </span>

        <button onClick={zoomIn} title="Zoom in" className={btnIcon}>
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-1" />

        <button
          onClick={() => setZoom('fitV')}
          title="Fit height"
          className={`${btnIcon} ${zoom === 'fitV' ? btnActive : ''}`}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setZoom('fitW')}
          title="Fit width"
          className={`${btnIcon} ${zoom === 'fitW' ? btnActive : ''}`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-1" />

        <button
          onClick={() => setZoom(1)}
          title="Actual size"
          className={`${btnText} ${zoom === 1 ? btnActive : ''}`}
        >
          100%
        </button>
      </div>

      {/* ── Scrollable image area ── */}
      <div ref={areaRef} className="flex-1 overflow-auto p-4">
        {/* mx-auto centers when narrower than container; aligns left (scrollable) when wider */}
        <div className="relative mx-auto" style={{ width: imgW }}>
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <img
              src={`data:image/jpeg;base64,${page.image_base64}`}
              alt={`Page ${page.page_number}`}
              style={{ width: imgW, height: imgH, display: 'block' }}
            />
          </div>

          {/* Loading overlay */}
          {status === 'loading' && (
            <div className="absolute inset-0 rounded-xl bg-blue-500/10 backdrop-blur-[1px] flex items-center justify-center">
              <div className="bg-white/95 rounded-xl px-5 py-3 flex items-center gap-3 shadow-lg">
                <svg className="animate-spin w-5 h-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm font-medium text-slate-700">Running OCR…</span>
              </div>
            </div>
          )}

          {status === 'done' && (
            <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow">
              ✓ OCR done
            </div>
          )}

          {status === 'error' && (
            <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow">
              ✗ OCR failed
            </div>
          )}

          <div className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
            Page {page.page_number} — {page.width} × {page.height} px
          </div>
        </div>
      </div>
    </div>
  )
}
