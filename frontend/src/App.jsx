import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageContext, downloadMarkdown, placeFigures } from './imageStore'
import logo from './assets/logo.png'
import logoDark from './assets/logo_dark.png'
import { ExternalLink, FileUp, Moon, Settings, Sun } from 'lucide-react'
import { useTheme } from './ThemeContext'
import UploadZone from './components/UploadZone'
import SplitView from './components/SplitView'
import DirectView from './components/DirectView'
import ConversionModeSelect from './components/ConversionModeSelect'
import SettingsModal from './components/SettingsModal'
import ConnectionErrorBanner from './components/ConnectionErrorBanner'
import { convertDirect, convertToPdf, getModels, getSettings, ocrPage, saveSettings, uploadPDF } from './api'

function getFileType(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.doc')) return 'doc'
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.xls')) return 'xls'
  return null
}

const BACKEND_LABELS = { ollama: 'Ollama', lmstudio: 'LM Studio', vllm: 'vLLM' }

export default function App() {
  const [appState, setAppState] = useState('idle') // idle | mode-select | uploading | ready
  const [pendingFile, setPendingFile] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [conversionMode, setConversionMode] = useState('direct')
  const [pdfDoc, setPdfDoc] = useState(null)
  const [directResult, setDirectResult] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [ocrResults, setOcrResults] = useState({})
  const [ocrStatus, setOcrStatus] = useState({})
  const [pageModels, setPageModels] = useState({})
  const [uploadError, setUploadError] = useState(null)
  const [isOcrAllRunning, setIsOcrAllRunning] = useState(false)
  const ocrStatusRef = useRef({})
  const uploadAbortRef = useRef(null)
  const ocrAbortRef = useRef(new Set())
  const ocrAllCancelledRef = useRef(false)
  const [settings, setSettings] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('checking') // checking | ok | error
  const [connectionError, setConnectionError] = useState(null)
  const [models, setModels] = useState([])

  const resetState = useCallback(() => {
    ocrAllCancelledRef.current = true
    ocrAbortRef.current.forEach((c) => c.abort())
    setAppState('idle')
    setPendingFile(null)
    setFileType(null)
    setConversionMode('direct')
    setPdfDoc(null)
    setDirectResult(null)
    setCurrentPage(0)
    setOcrResults({})
    setOcrStatus({})
    ocrStatusRef.current = {}
    setPageModels({})
    setUploadError(null)
    setIsOcrAllRunning(false)
  }, [])

  const checkConnection = useCallback(async () => {
    setConnectionStatus('checking')
    setConnectionError(null)
    try {
      const loadedSettings = await getSettings()
      setSettings(loadedSettings)
      const loadedModels = await getModels()
      if (loadedModels.length === 0) {
        setConnectionError('Nessun modello disponibile sul server configurato.')
        setConnectionStatus('error')
        return
      }
      setModels(loadedModels)
      setConnectionStatus('ok')
    } catch (err) {
      setConnectionError(err.message || 'Impossibile verificare la connessione.')
      setConnectionStatus('error')
    }
  }, [])

  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  const handleFileSelect = useCallback((file) => {
    setUploadError(null)
    const type = getFileType(file)
    if (!type) {
      setUploadError('Unsupported file type. Please use PDF, DOCX, DOC, XLSX, or XLS.')
      return
    }
    if (type === 'pdf') {
      setAppState('uploading')
      const controller = new AbortController()
      uploadAbortRef.current = controller
      uploadPDF(file, controller.signal)
        .then((data) => {
          setPdfDoc(data)
          setConversionMode('ocr')
          setCurrentPage(0)
          setOcrResults({})
          setOcrStatus({})
          ocrStatusRef.current = {}
          setPageModels(Object.fromEntries(data.pages.map((p) => [p.page_number, settings?.default_model])))
          setAppState('ready')
        })
        .catch((err) => {
          if (err.name === 'AbortError') return
          setUploadError(err.message || 'Failed to process PDF')
          setAppState('idle')
        })
    } else {
      setPendingFile(file)
      setFileType(type)
      setConversionMode(type === 'doc' ? 'ocr' : 'direct')
      setAppState('mode-select')
    }
  }, [settings])

  const handleStartConversion = useCallback(
    async (mode) => {
      if (!pendingFile) return
      setUploadError(null)
      setAppState('uploading')
      const controller = new AbortController()
      uploadAbortRef.current = controller
      try {
        if (mode === 'direct') {
          const data = await convertDirect(pendingFile, controller.signal)
          setDirectResult({ markdown: data.markdown, info: data.info, filename: data.filename, images: data.images || [] })
          setConversionMode('direct')
          setAppState('ready')
        } else {
          const data = await convertToPdf(pendingFile, controller.signal)
          setPdfDoc(data)
          setCurrentPage(0)
          setOcrResults({})
          setOcrStatus({})
          ocrStatusRef.current = {}
          setPageModels(Object.fromEntries(data.pages.map((p) => [p.page_number, settings?.default_model])))
          setConversionMode('ocr')
          setAppState('ready')
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        setUploadError(err.message || 'Conversion failed')
        setAppState('mode-select')
      }
    },
    [pendingFile, settings],
  )

  const handleCancelUpload = useCallback(() => {
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    setUploadError(null)
    setAppState(pendingFile ? 'mode-select' : 'idle')
  }, [pendingFile])

  const handleCancelOcr = useCallback(() => {
    ocrAllCancelledRef.current = true
    ocrAbortRef.current.forEach((c) => c.abort())
  }, [])

  const handleOcrPage = useCallback(
    async (pageIndex) => {
      if (!pdfDoc) return
      const page = pdfDoc.pages[pageIndex]
      const pageNum = page.page_number
      const model = pageModels[pageNum] || settings?.default_model
      setOcrStatus((prev) => {
        const next = { ...prev, [pageNum]: 'loading' }
        ocrStatusRef.current = next
        return next
      })
      const controller = new AbortController()
      ocrAbortRef.current.add(controller)
      try {
        const result = await ocrPage(page.image_base64, pageNum, model, controller.signal)
        setOcrResults((prev) => ({ ...prev, [pageNum]: placeFigures(result.markdown, page.figures) }))
        setOcrStatus((prev) => {
          const next = { ...prev, [pageNum]: 'done' }
          ocrStatusRef.current = next
          return next
        })
      } catch (err) {
        const status = err.name === 'AbortError' ? 'idle' : 'error'
        setOcrStatus((prev) => {
          const next = { ...prev, [pageNum]: status }
          ocrStatusRef.current = next
          return next
        })
      } finally {
        ocrAbortRef.current.delete(controller)
      }
    },
    [pdfDoc, pageModels, settings],
  )

  const handlePageModelChange = useCallback((pageNum, model) => {
    setPageModels((prev) => ({ ...prev, [pageNum]: model }))
  }, [])

  const handleOcrAll = useCallback(async () => {
    if (!pdfDoc || isOcrAllRunning) return
    setIsOcrAllRunning(true)
    ocrAllCancelledRef.current = false
    for (let i = 0; i < pdfDoc.pages.length; i++) {
      if (ocrAllCancelledRef.current) break
      const pageNum = pdfDoc.pages[i].page_number
      if (ocrStatusRef.current[pageNum] === 'done') continue
      await handleOcrPage(i)
    }
    setIsOcrAllRunning(false)
  }, [pdfDoc, isOcrAllRunning, handleOcrPage])

  const images = useMemo(() => {
    const map = {}
    ;(directResult?.images || []).forEach((i) => { map[i.name] = i.image_base64 })
    ;(pdfDoc?.pages || []).forEach((p) => (p.figures || []).forEach((f) => { map[f.name] = f.image_base64 }))
    return map
  }, [directResult, pdfDoc])

  const handleDownloadAll = useCallback(() => {
    if (!pdfDoc) return
    const combined = pdfDoc.pages
      .map((p) => {
        const md = ocrResults[p.page_number]
        return md
          ? `## Page ${p.page_number}\n\n${md}`
          : `## Page ${p.page_number}\n\n*(no OCR result)*`
      })
      .join('\n\n---\n\n')
    downloadMarkdown(pdfDoc.filename.replace(/\.(pdf|docx?|xlsx?)$/i, ''), combined, images)
  }, [pdfDoc, ocrResults, images])

  const handleDirectDownload = useCallback(() => {
    if (!directResult) return
    downloadMarkdown(directResult.filename.replace(/\.(docx?|xlsx?)$/i, ''), directResult.markdown, images)
  }, [directResult, images])

  return (
    <ImageContext.Provider value={images}>
    <div className="h-screen flex flex-col overflow-hidden">
      <Header onNew={appState === 'ready' ? resetState : null} onOpenSettings={() => setShowSettings(true)} />

      {settings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          knownConnectionOk={connectionStatus === 'ok'}
          knownModels={models}
          onSaved={(saved) => {
            setSettings(saved)
            setShowSettings(false)
            checkConnection()
          }}
        />
      )}

      {(appState === 'idle' || appState === 'uploading') && (
        <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900">
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5">
            {connectionStatus === 'checking' && (
              <p className="text-slate-400 dark:text-slate-500 text-sm">Verifica connessione al server OCR…</p>
            )}
            {connectionStatus === 'error' && (
              <ConnectionErrorBanner
                message={connectionError}
                onOpenSettings={() => setShowSettings(true)}
                onRetry={checkConnection}
              />
            )}
            {connectionStatus === 'ok' && (
              <UploadZone
                onFileSelect={handleFileSelect}
                isLoading={appState === 'uploading'}
                onCancel={handleCancelUpload}
                error={uploadError}
              />
            )}
          </div>
          <PortfolioFooter />
        </main>
      )}

      {appState === 'mode-select' && (
        <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900">
          <div className="flex-1 flex items-center justify-center p-8">
            <ConversionModeSelect
              file={pendingFile}
              fileType={fileType}
              mode={conversionMode}
              onModeChange={setConversionMode}
              onStart={handleStartConversion}
              isLoading={appState === 'uploading'}
              error={uploadError}
            />
          </div>
          <PortfolioFooter />
        </main>
      )}

      {appState === 'ready' && conversionMode === 'ocr' && pdfDoc && (
        <SplitView
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          ocrResults={ocrResults}
          ocrStatus={ocrStatus}
          onOcrPage={handleOcrPage}
          onOcrAll={handleOcrAll}
          onCancelOcr={handleCancelOcr}
          onDownloadAll={handleDownloadAll}
          isOcrAllRunning={isOcrAllRunning}
          models={models}
          pageModel={pageModels[pdfDoc.pages[currentPage].page_number] || settings?.default_model}
          onPageModelChange={(model) => handlePageModelChange(pdfDoc.pages[currentPage].page_number, model)}
          backendLabel={BACKEND_LABELS[settings?.backend_type] || settings?.backend_type}
        />
      )}

      {appState === 'ready' && conversionMode === 'direct' && directResult && (
        <DirectView directResult={directResult} onDownload={handleDirectDownload} />
      )}
    </div>
    </ImageContext.Provider>
  )
}

function PortfolioFooter() {
  return (
    <div className="flex justify-center pb-5">
      <a
        href="https://giova86.github.io/business_card/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors group"
      >
        <span>Made by Giovanni Bocchi</span>
        <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
      </a>
    </div>
  )
}

function Header({ onNew, onOpenSettings }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-lg">
      <div className="flex items-center gap-3">
        <img src={isDark ? logoDark : logo} alt="ConvertToMD logo" className="w-8 h-8 object-contain flex-shrink-0" />
        <span className="font-bold text-lg tracking-tight">ConvertToMD</span>
        <span className="text-slate-500 text-sm hidden sm:inline">Docs → Markdown</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
          title="Impostazioni connessione"
        >
          <Settings className="w-4 h-4 text-slate-300" />
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-slate-300" />
          ) : (
            <Moon className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {onNew && (
          <button
            onClick={onNew}
            className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            <FileUp className="w-4 h-4" />
            New document
          </button>
        )}
      </div>
    </header>
  )
}
