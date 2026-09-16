import { Routes, Route } from 'react-router-dom'
import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'
import Watch from './pages/Watch.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-yt-bg">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/watch/:videoId" element={<Watch />} />
        </Routes>
      </main>
    </div>
  )
}
