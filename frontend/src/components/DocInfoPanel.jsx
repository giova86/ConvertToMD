import { FileSpreadsheet, FileText } from 'lucide-react'

export default function DocInfoPanel({ info, filename }) {
  const isWord = info.type === 'word'
  const Icon = isWord ? FileText : FileSpreadsheet
  const label = isWord ? 'Word Document' : 'Excel Spreadsheet'

  return (
    <div className="p-6 bg-white dark:bg-slate-800 h-full">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md dark:shadow-slate-900/50 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-blue-500 dark:text-blue-400" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{filename}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        </div>

        {isWord && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Headings" value={info.headings} />
            <StatCard label="Paragraphs" value={info.paragraphs} />
            <StatCard label="Tables" value={info.tables} />
          </div>
        )}

        {!isWord && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Sheets</p>
            {info.sheets.map((sheet) => (
              <div
                key={sheet.name}
                className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg"
              >
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{sheet.name}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {sheet.rows} rows × {sheet.cols} cols
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Converted via direct extraction — no OCR used
          </p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 text-center">
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}
