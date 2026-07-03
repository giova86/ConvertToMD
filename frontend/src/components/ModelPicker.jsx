import { ChevronDown } from 'lucide-react'

export default function ModelPicker({
  models,
  value,
  onChange,
  disabled = false,
  label = 'Modello OCR',
  className = '',
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && (
        <label className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{label}</label>
      )}
      <div className="relative flex items-center h-[34px]">
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || models.length === 0}
          className="appearance-none h-full text-sm font-medium border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg pl-3 pr-8 disabled:opacity-50"
        >
          {models.length === 0 && <option value="">Nessun modello</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5" />
      </div>
    </div>
  )
}
