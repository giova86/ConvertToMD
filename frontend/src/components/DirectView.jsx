import { useState } from 'react'
import { Code2, Download, Eye } from 'lucide-react'
import DocInfoPanel from './DocInfoPanel'
import MarkdownPanel from './MarkdownPanel'

export default function DirectView({ directResult, onDownload }) {
  const [markdownView, setMarkdownView] = useState('rendered')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <span className="text-base">📄</span>
          <span className="font-medium text-slate-700 dark:text-slate-200 text-sm truncate max-w-xs">
            {directResult.filename}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 whitespace-nowrap">
            Direct extraction
          </span>
        </div>

        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download .md
        </button>

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

      {/* Split panels */}
      <div className="flex-1 flex min-h-0">
        {/* Left — document info area */}
        <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 overflow-auto bg-slate-100 dark:bg-slate-800">
          <DocInfoPanel info={directResult.info} filename={directResult.filename} />
        </div>
        {/* Right — dark-mode aware */}
        <div className="w-1/2 overflow-auto bg-white dark:bg-slate-900 flex flex-col">
          <MarkdownPanel
            markdown={directResult.markdown || '*No content extracted.*'}
            view={markdownView}
            status="done"
            onOcr={() => {}}
          />
        </div>
      </div>
    </div>
  )
}
