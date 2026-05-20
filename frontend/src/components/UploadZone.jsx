import { useCallback, useState } from 'react'
import { AlertCircle, FileText, Upload } from 'lucide-react'
import logoFront from '../assets/logo_fornt.png'
import logoFrontDark from '../assets/logo_fornt_dark.png'
import { useTheme } from '../ThemeContext'

const ACCEPTED_EXTS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls']
const ACCEPT_ATTR = ACCEPTED_EXTS.join(',')

function isAccepted(file) {
  if (!file) return false
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTS.some((ext) => name.endsWith(ext))
}

export default function UploadZone({ onFileSelect, isLoading, error }) {
  const [isDragging, setIsDragging] = useState(false)
  const { isDark } = useTheme()

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (isAccepted(file)) onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleInput = useCallback(
    (e) => {
      const file = e.target.files[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-10">
        <img src={isDark ? logoFrontDark : logoFront} alt="pdf2mrk" className="h-24 object-contain mx-auto mb-3" />
        <br></br>
        <p className="text-slate-500 dark:text-slate-400 text-base">
          Upload a PDF, Word, or Excel file — convert to clean Markdown using direct
          extraction or GLM-OCR running locally on Ollama.
        </p>
      </div>

      <label
        className={[
          'relative flex flex-col items-center justify-center',
          'border-2 border-dashed rounded-2xl p-14 cursor-pointer',
          'transition-all duration-200 select-none',
          isDragging
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.015]'
            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-700',
          isLoading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={handleInput}
          disabled={isLoading}
        />

        {isLoading ? (
          <>
            <div className="w-14 h-14 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-5" />
            <p className="text-slate-600 dark:text-slate-300 font-semibold text-lg">Processing…</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Converting document</p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-6">
              <Upload className="w-9 h-9 text-blue-500" strokeWidth={1.5} />
            </div>
            <p className="text-slate-700 dark:text-slate-200 font-semibold text-xl mb-1.5">
              Drop your document here
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">or click to browse files</p>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-full px-4 py-1.5">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400 text-sm">
                PDF · DOCX · DOC · XLSX · XLS
              </span>
            </div>
          </>
        )}
      </label>

      {error && (
        <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  )
}
