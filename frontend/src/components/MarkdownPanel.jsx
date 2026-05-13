import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, Download, Scan } from 'lucide-react'

export default function MarkdownPanel({ markdown, view, status, onOcr }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'page.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (status === 'idle' || (!markdown && status !== 'loading' && status !== 'error')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-5">
          <Scan className="w-8 h-8 text-slate-400" strokeWidth={1.5} />
        </div>
        <p className="text-slate-600 font-semibold mb-1.5">No OCR result yet</p>
        <p className="text-slate-400 text-sm mb-7 max-w-xs">
          Click "OCR page" in the toolbar to extract text from this page using GLM-OCR
        </p>
        <button
          onClick={onOcr}
          className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          Run OCR on this page
        </button>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin w-12 h-12 text-blue-500 mx-auto mb-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-80"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <p className="text-slate-600 font-semibold">Extracting text with GLM-OCR…</p>
          <p className="text-slate-400 text-sm mt-1">This may take a moment</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center bg-red-50 border border-red-100 rounded-2xl p-8 max-w-xs">
          <p className="text-red-500 font-semibold mb-2">OCR failed</p>
          <p className="text-slate-500 text-sm mb-5">
            Make sure Ollama is running and <code className="bg-red-50 px-1 rounded">glm-ocr:latest</code> is installed.
          </p>
          <button
            onClick={onOcr}
            className="border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-slate-100 flex-shrink-0">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Save .md
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === 'raw' ? (
          <pre className="p-6 text-sm font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
            {markdown}
          </pre>
        ) : (
          <div className="p-8">
            <div className="prose prose-slate prose-sm max-w-none prose-headings:font-semibold prose-table:text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
