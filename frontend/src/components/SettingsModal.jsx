import { useEffect, useState } from 'react'
import { ChevronDown, Loader2, Settings as SettingsIcon, X } from 'lucide-react'
import { getModels, saveSettings } from '../api'

const BACKEND_TYPES = [
  { value: 'ollama', label: 'Ollama', defaultUrl: 'http://localhost:11434' },
  { value: 'lmstudio', label: 'LM Studio', defaultUrl: 'http://localhost:1234' },
  { value: 'vllm', label: 'vLLM', defaultUrl: 'http://localhost:8000' },
]

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSaved,
  knownConnectionOk = false,
  knownModels = [],
}) {
  const [backendType, setBackendType] = useState(settings.backend_type)
  const [baseUrl, setBaseUrl] = useState(settings.base_url)
  const [apiKey, setApiKey] = useState(settings.api_key || '')
  const [defaultModel, setDefaultModel] = useState(settings.default_model)
  const [testState, setTestState] = useState('idle') // idle | testing | ok | error
  const [testModels, setTestModels] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setBackendType(settings.backend_type)
      setBaseUrl(settings.base_url)
      setApiKey(settings.api_key || '')
      setDefaultModel(settings.default_model)
      if (knownConnectionOk) {
        setTestState('ok')
        setTestModels(knownModels)
      } else {
        setTestState('idle')
        setTestModels([])
      }
      setSaveError(null)
    }
  }, [isOpen, settings, knownConnectionOk, knownModels])

  if (!isOpen) return null

  const modelOptions = testState === 'ok' ? testModels : []

  const resetTestState = () => {
    setTestState('idle')
  }

  const handleBackendTypeChange = (value) => {
    setBackendType(value)
    const preset = BACKEND_TYPES.find((b) => b.value === value)
    const isUntouched = BACKEND_TYPES.some((b) => b.defaultUrl === baseUrl)
    if (preset && (isUntouched || !baseUrl)) setBaseUrl(preset.defaultUrl)
    resetTestState()
  }

  const handleBaseUrlChange = (value) => {
    setBaseUrl(value)
    resetTestState()
  }

  const handleApiKeyChange = (value) => {
    setApiKey(value)
    resetTestState()
  }

  const handleTestConnection = async () => {
    setTestState('testing')
    try {
      const models = await getModels({ backendType, baseUrl, apiKey })
      setTestModels(models)
      setTestState('ok')
      if (!defaultModel && models.length > 0) setDefaultModel(models[0])
    } catch {
      setTestModels([])
      setTestState('error')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const saved = await saveSettings({
        backend_type: backendType,
        base_url: baseUrl,
        api_key: apiKey || null,
        default_model: defaultModel,
      })
      onSaved(saved)
    } catch (err) {
      setSaveError(err.message || 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-slate-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Impostazioni connessione</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Tipo di server
            </label>
            <div className="relative">
              <select
                value={backendType}
                onChange={(e) => handleBackendTypeChange(e.target.value)}
                className="appearance-none w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg pl-3 pr-8 py-2"
              >
                {BACKEND_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              API key (opzionale)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testState === 'testing'}
              className="flex items-center gap-2 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg px-3 py-1.5"
            >
              {testState === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Testa connessione
            </button>

            {testState === 'ok' && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Connesso
              </span>
            )}
            {testState === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Errore connessione
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Modello di default
            </label>
            <div className="relative">
              <select
                value={defaultModel || ''}
                onChange={(e) => setDefaultModel(e.target.value)}
                disabled={modelOptions.length === 0}
                className="appearance-none w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg pl-3 pr-8 py-2 disabled:opacity-50"
              >
                {modelOptions.length === 0 && <option value="">Testa la connessione per vedere i modelli</option>}
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {saveError && <p className="text-sm text-red-500">{saveError}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !defaultModel}
            className="text-sm px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
          >
            {isSaving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}
