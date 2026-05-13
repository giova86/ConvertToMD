import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Eye,
  Scan,
  ScanLine,
} from 'lucide-react'
import MarkdownPanel from './MarkdownPanel'
import PageViewer from './PageViewer'

export default function SplitView({
  pdfDoc,
  currentPage,
  onPageChange,
  ocrResults,
  ocrStatus,
  onOcrPage,
  onOcrAll,
  onDownloadAll,
  isOcrAllRunning,
}) {
  const [markdownView, setMarkdownView] = useState('rendered')

  const page = pdfDoc.pages[currentPage]
  const pageNum = page.page_number
  const totalPages = pdfDoc.pages.length
  const currentStatus = ocrStatus[pageNum] || 'idle'
  const currentMarkdown = ocrResults[pageNum] || ''
  const doneCount = Object.values(ocrStatus).filter((s) => s === 'done').length
  const allDone = doneCount === totalPages

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Toolbar ── */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <span className="text-base">📄</span>
          <span className="font-medium text-slate-700 dark:text-slate-200 text-sm truncate max-w-xs">
            {pdfDoc.filename}
          </span>
          <span
            className={[
              'text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap',
              allDone
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
            ].join(' ')}
          >
            {doneCount}/{totalPages} OCR'd
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 px-2 tabular-nums">
            {pageNum} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage === totalPages - 1}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOcrPage(currentPage)}
            disabled={currentStatus === 'loading' || isOcrAllRunning}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm',
              currentStatus === 'loading' || isOcrAllRunning
                ? 'bg-blue-100 text-blue-400 cursor-not-allowed shadow-none'
                : 'bg-blue-500 hover:bg-blue-600 text-white',
            ].join(' ')}
          >
            {currentStatus === 'loading' ? (
              <Spinner className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Scan className="w-3.5 h-3.5" />
            )}
            OCR page
          </button>

          <button
            onClick={onOcrAll}
            disabled={isOcrAllRunning || allDone}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
              isOcrAllRunning || allDone
                ? 'border-slate-200 dark:border-slate-600 text-slate-400 cursor-not-allowed bg-slate-50 dark:bg-slate-700'
                : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
            ].join(' ')}
          >
            {isOcrAllRunning ? (
              <Spinner className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ScanLine className="w-3.5 h-3.5" />
            )}
            OCR all
          </button>

          {doneCount > 0 && (
            <button
              onClick={onDownloadAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
              title="Download all OCR results as a single Markdown file"
            >
              <Download className="w-3.5 h-3.5" />
              Download .md
            </button>
          )}
        </div>

        <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          {[
            { key: 'rendered', icon: Eye, label: 'Preview' },
            { key: 'raw', icon: Code2, label: 'Raw' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setMarkdownView(key)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                markdownView === key
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Page status strip ── */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 py-1.5 flex items-center gap-1 overflow-x-auto flex-shrink-0">
          {pdfDoc.pages.map((p, i) => {
            const s = ocrStatus[p.page_number] || 'idle'
            return (
              <button
                key={p.page_number}
                onClick={() => onPageChange(i)}
                title={`Page ${p.page_number}`}
                className={[
                  'w-6 h-6 rounded-md text-xs font-medium transition-all flex-shrink-0',
                  i === currentPage ? 'ring-2 ring-blue-400 ring-offset-1' : '',
                  s === 'done'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : s === 'loading'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 animate-pulse'
                      : s === 'error'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
                ].join(' ')}
              >
                {p.page_number}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Split panels ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left — always light (document viewer) */}
        <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 overflow-auto bg-slate-100">
          <PageViewer page={page} status={currentStatus} />
        </div>
        {/* Right — dark-mode aware */}
        <div className="w-1/2 overflow-auto bg-white dark:bg-slate-900 flex flex-col">
          <MarkdownPanel
            markdown={currentMarkdown}
            view={markdownView}
            status={currentStatus}
            onOcr={() => onOcrPage(currentPage)}
          />
        </div>
      </div>
    </div>
  )
}

function Spinner({ className = '' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
