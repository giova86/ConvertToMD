import { useCallback, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import UploadZone from './components/UploadZone'
import SplitView from './components/SplitView'
import { ocrPage, uploadPDF } from './api'

export default function App() {
  const [appState, setAppState] = useState('idle') // idle | uploading | ready
  const [pdfDoc, setPdfDoc] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [ocrResults, setOcrResults] = useState({})
  const [ocrStatus, setOcrStatus] = useState({})
  const [uploadError, setUploadError] = useState(null)
  const [isOcrAllRunning, setIsOcrAllRunning] = useState(false)
  const ocrStatusRef = useRef({})

  const handleFileUpload = useCallback(async (file) => {
    setUploadError(null)
    setAppState('uploading')
    try {
      const data = await uploadPDF(file)
      setPdfDoc(data)
      setCurrentPage(0)
      setOcrResults({})
      setOcrStatus({})
      ocrStatusRef.current = {}
      setAppState('ready')
    } catch (err) {
      setUploadError(err.message || 'Failed to process PDF')
      setAppState('idle')
    }
  }, [])

  const handleOcrPage = useCallback(async (pageIndex) => {
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
  }, [pdfDoc])

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
    a.download = pdfDoc.filename.replace(/\.pdf$/i, '') + '.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [pdfDoc, ocrResults])

  const handleNewDocument = useCallback(() => {
    setAppState('idle')
    setPdfDoc(null)
    setCurrentPage(0)
    setOcrResults({})
    setOcrStatus({})
    ocrStatusRef.current = {}
    setUploadError(null)
    setIsOcrAllRunning(false)
  }, [])

  return (
    <div className="h-full flex flex-col">
      <Header onNew={appState === 'ready' ? handleNewDocument : null} />

      {appState !== 'ready' ? (
        <main className="flex-1 flex items-center justify-center p-8">
          <UploadZone
            onFileSelect={handleFileUpload}
            isLoading={appState === 'uploading'}
            error={uploadError}
          />
        </main>
      ) : (
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
    </div>
  )
}

function Header({ onNew }) {
  return (
    <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm select-none">p</span>
        </div>
        <span className="font-bold text-lg tracking-tight">pdf2mrk</span>
        <span className="text-slate-500 text-sm hidden sm:inline">PDF → Markdown</span>
      </div>

      {onNew && (
        <button
          onClick={onNew}
          className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
        >
          <FileUp className="w-4 h-4" />
          New document
        </button>
      )}
    </header>
  )
}
