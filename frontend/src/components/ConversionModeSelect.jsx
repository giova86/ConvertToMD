import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

export default function ConversionModeSelect({
  file,
  fileType,
  mode,
  onModeChange,
  onStart,
  isLoading,
  error,
}) {
  const directSupported = fileType === 'docx' || fileType === 'xlsx' || fileType === 'xls'
  const isDoc = fileType === 'doc'

  // Force OCR mode when direct extraction is not available for this file type
  // (handles .doc files where only OCR is supported)
  useEffect(() => {
    if (!directSupported && mode !== 'ocr') {
      onModeChange('ocr')
    }
  }, [directSupported, mode, onModeChange])

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Choose conversion mode
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm truncate px-4">{file.name}</p>
      </div>

      <div className="space-y-3 mb-6">
        {directSupported && (
          <label
            className={[
              'flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
              mode === 'direct'
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500',
            ].join(' ')}
          >
            <input
              type="radio"
              name="conv-mode"
              value="direct"
              checked={mode === 'direct'}
              onChange={() => onModeChange('direct')}
              className="mt-1 accent-blue-500"
            />
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">Direct extraction</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Fast and accurate — reads text, tables, and headings directly from the file. No OCR needed.
              </p>
            </div>
          </label>
        )}

        <label
          className={[
            'flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
            mode === 'ocr'
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500',
          ].join(' ')}
        >
          <input
            type="radio"
            name="conv-mode"
            value="ocr"
            checked={mode === 'ocr'}
            onChange={() => onModeChange('ocr')}
            className="mt-1 accent-blue-500"
          />
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              OCR pipeline
              {isDoc && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  Required for .doc
                </span>
              )}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Converts to PDF via LibreOffice, then extracts text with GLM-OCR. Requires LibreOffice installed.
            </p>
          </div>
        </label>
      </div>

      <button
        onClick={() => onStart(mode)}
        disabled={isLoading}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 shadow-sm"
      >
        {isLoading ? 'Converting…' : 'Convert'}
      </button>

      {error && (
        <div className="mt-4 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 dark:text-red-400 text-sm leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  )
}
