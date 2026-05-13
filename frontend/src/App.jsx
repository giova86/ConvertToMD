import { useCallback, useRef, useState } from 'react'
import { FileUp, Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeContext'
import UploadZone from './components/UploadZone'
import SplitView from './components/SplitView'
import DirectView from './components/DirectView'
import ConversionModeSelect from './components/ConversionModeSelect'
import { convertDirect, convertToPdf, ocrPage, uploadPDF } from './api'

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
  const [uploadError, setUploadError] = useState(null)
  const [isOcrAllRunning, setIsOcrAllRunning] = useState(false)
  const ocrStatusRef = useRef({})

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
    setUploadError(null)
    setIsOcrAllRunning(false)
  }, [])

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
      setOcrStatus((prev) => {
        const next = { ...prev, [pageNum]: 'loading' }
        ocrStatusRef.current = next
        return next
      })
      try {
        const result = await ocrPage(page.image_base64, pageNum)
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
    [pdfDoc],
  )

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
    <div className="h-full flex flex-col">
      <Header onNew={appState === 'ready' ? resetState : null} />

      {(appState === 'idle' || appState === 'uploading') && (
        <main className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
          <UploadZone
            onFileSelect={handleFileSelect}
            isLoading={appState === 'uploading'}
            error={uploadError}
          />
        </main>
      )}

      {appState === 'mode-select' && (
        <main className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
          <ConversionModeSelect
            file={pendingFile}
            fileType={fileType}
            mode={conversionMode}
            onModeChange={setConversionMode}
            onStart={handleStartConversion}
            isLoading={appState === 'uploading'}
            error={uploadError}
          />
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
        />
      )}

      {appState === 'ready' && conversionMode === 'direct' && directResult && (
        <DirectView directResult={directResult} onDownload={handleDirectDownload} />
      )}
    </div>
  )
}

function Header({ onNew }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm select-none">p</span>
        </div>
        <span className="font-bold text-lg tracking-tight">pdf2mrk</span>
        <span className="text-slate-500 text-sm hidden sm:inline">Docs → Markdown</span>
      </div>

      <div className="flex items-center gap-2">
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
