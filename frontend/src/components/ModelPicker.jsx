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
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || models.length === 0}
        className="text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 disabled:opacity-50"
      >
        {models.length === 0 && <option value="">Nessun modello</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}
