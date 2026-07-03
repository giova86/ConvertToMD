import { useCallback, useEffect, useRef, useState } from 'react'
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
import ModelPicker from './components/ModelPicker'
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
  const [settings, setSettings] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('checking') // checking | ok | error
  const [connectionError, setConnectionError] = useState(null)
  const [models, setModels] = useState([])

  const resetState = useCallback(() => {
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
      uploadPDF(file)
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
          setUploadError(err.message || 'Failed to process PDF')
          setAppState('idle')
        })
    } else {
      setPendingFile(file)
      setFileType(type)
      setConversionMode(type === 'doc' ? 'ocr' : 'direct')
      setAppState('mode-select')
    }
  }, [])

  const handleStartConversion = useCallback(
    async (mode) => {
      if (!pendingFile) return
      setUploadError(null)
      setAppState('uploading')
      try {
        if (mode === 'direct') {
          const data = await convertDirect(pendingFile)
          setDirectResult({ markdown: data.markdown, info: data.info, filename: data.filename })
          setConversionMode('direct')
          setAppState('ready')
        } else {
          const data = await convertToPdf(pendingFile)
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
        setUploadError(err.message || 'Conversion failed')
        setAppState('mode-select')
      }
    },
    [pendingFile],
  )

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
      try {
        const result = await ocrPage(page.image_base64, pageNum, model)
        setOcrResults((prev) => ({ ...prev, [pageNum]: result.markdown }))
        setOcrStatus((prev) => {
          const next = { ...prev, [pageNum]: 'done' }
          ocrStatusRef.current = next
          return next
        })
      } catch {
        setOcrStatus((prev) => {
          const next = { ...prev, [pageNum]: 'error' }
          ocrStatusRef.current = next
          return next
        })
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
    for (let i = 0; i < pdfDoc.pages.length; i++) {
      const pageNum = pdfDoc.pages[i].page_number
      if (ocrStatusRef.current[pageNum] === 'done') continue
      await handleOcrPage(i)
    }
    setIsOcrAllRunning(false)
  }, [pdfDoc, isOcrAllRunning, handleOcrPage])

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
    const blob = new Blob([combined], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = pdfDoc.filename.replace(/\.(pdf|docx?|xlsx?)$/i, '') + '.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [pdfDoc, ocrResults])

  const handleDirectDownload = useCallback(() => {
    if (!directResult) return
    const blob = new Blob([directResult.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = directResult.filename.replace(/\.(docx?|xlsx?)$/i, '') + '.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [directResult])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header onNew={appState === 'ready' ? resetState : null} onOpenSettings={() => setShowSettings(true)} />

      {settings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
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
              <>
                <ModelPicker
                  models={models}
                  value={settings?.default_model}
                  onChange={async (model) => {
                    const saved = await saveSettings({ ...settings, default_model: model })
                    setSettings(saved)
                  }}
                />
                <UploadZone
                  onFileSelect={handleFileSelect}
                  isLoading={appState === 'uploading'}
                  error={uploadError}
                />
              </>
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
          onDownloadAll={handleDownloadAll}
          isOcrAllRunning={isOcrAllRunning}
          models={models}
          pageModel={pageModels[pdfDoc.pages[currentPage].page_number] || settings?.default_model}
          onPageModelChange={(model) => handlePageModelChange(pdfDoc.pages[currentPage].page_number, model)}
        />
      )}

      {appState === 'ready' && conversionMode === 'direct' && directResult && (
        <DirectView directResult={directResult} onDownload={handleDirectDownload} />
      )}
    </div>
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
        <img src={isDark ? logoDark : logo} alt="pdf2mrk logo" className="w-8 h-8 object-contain flex-shrink-0" />
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
