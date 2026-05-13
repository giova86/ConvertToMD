export default function PageViewer({ page, status }) {
  return (
    <div className="p-6 flex justify-center min-h-full">
      <div className="relative self-start">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <img
            src={`data:image/jpeg;base64,${page.image_base64}`}
            alt={`Page ${page.page_number}`}
            className="block max-w-full h-auto"
            style={{ maxHeight: 'calc(100vh - 180px)' }}
          />
        </div>

        {/* Loading overlay */}
        {status === 'loading' && (
          <div className="absolute inset-0 rounded-xl bg-blue-500/10 backdrop-blur-[1px] flex items-center justify-center">
            <div className="bg-white/95 rounded-xl px-5 py-3 flex items-center gap-3 shadow-lg">
              <svg
                className="animate-spin w-5 h-5 text-blue-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              <span className="text-sm font-medium text-slate-700">Running OCR…</span>
            </div>
          </div>
        )}

        {/* Done badge */}
        {status === 'done' && (
          <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow">
            ✓ OCR done
          </div>
        )}

        {/* Error badge */}
        {status === 'error' && (
          <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow">
            ✗ OCR failed
          </div>
        )}

        {/* Page label */}
        <div className="mt-3 text-center text-xs text-slate-400 font-medium">
          Page {page.page_number} — {page.width} × {page.height} px
        </div>
      </div>
    </div>
  )
}
