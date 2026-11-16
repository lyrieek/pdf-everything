import { PdfViewer } from './components/PdfViewer'
import './app.css'

export function App() {
  return (
    <div className="app">
      <PdfViewer initialScale={1.0} />
    </div>
  )
}
