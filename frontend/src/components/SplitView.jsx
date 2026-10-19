import { useState } from 'react'
import {
  Code2,
  Download,
  Eye,
  Scan,
  ScanLine,
  XCircle,
} from 'lucide-react'
import MarkdownPanel from './MarkdownPanel'
import PageViewer from './PageViewer'
import ModelPicker from './ModelPicker'

export default function SplitView({
  pdfDoc,
  currentPage,
  onPageChange,
  ocrResults,
  ocrStatus,
  onOcrPage,
  onOcrAll,
  onCancelOcr,
  onDownloadAll,
  isOcrAllRunning,
  models,
  pageModel,
  onPageModelChange,
  backendLabel,
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

        <ModelPicker
          models={models}
          value={pageModel}
          onChange={onPageModelChange}
          label=""
          className="mr-1"
        />

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

          {(isOcrAllRunning || currentStatus === 'loading') && (
            <button
              onClick={onCancelOcr}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              title="Annulla la conversione in corso"
            >
              <XCircle className="w-3.5 h-3.5" />
              Annulla
            </button>
          )}

          {doneCount > 0 && (
            <button
              onClick={onDownloadAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
              title="Download all OCR results: .md, or .zip with images when the document has figures"
            >
              <Download className="w-3.5 h-3.5" />
              Download
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
        {/* Left — document viewer */}
        <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-100 dark:bg-slate-800">
          <PageViewer
            page={page}
            status={currentStatus}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
        {/* Right — dark-mode aware */}
        <div className="w-1/2 overflow-auto bg-white dark:bg-slate-900 flex flex-col">
          <MarkdownPanel
            markdown={currentMarkdown}
            view={markdownView}
            status={currentStatus}
            onOcr={() => onOcrPage(currentPage)}
            backendLabel={backendLabel}
            model={pageModel}
            downloadName={`${pdfDoc.filename.replace(/\.[^.]+$/, '')}_page${pdfDoc.pages[currentPage].page_number}`}
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
