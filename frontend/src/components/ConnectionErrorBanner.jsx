import { AlertTriangle, RefreshCw, Settings } from 'lucide-react'

export default function ConnectionErrorBanner({ message, onOpenSettings, onRetry }) {
  return (
    <div className="w-full max-w-md text-center bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8">
      <div className="w-14 h-14 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <AlertTriangle className="w-7 h-7 text-red-500" strokeWidth={1.5} />
      </div>
      <p className="text-red-600 dark:text-red-400 font-semibold mb-2">Connessione al server OCR non disponibile</p>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{message}</p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Settings className="w-3.5 h-3.5" />
          Apri impostazioni
        </button>
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Riprova
        </button>
      </div>
    </div>
  )
}
