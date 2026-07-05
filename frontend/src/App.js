import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import MainMenu from "@/pages/MainMenu";
import LevelSelect from "@/pages/LevelSelect";
import Game from "@/pages/Game";
import About from "@/pages/About";
import Upload from "@/pages/Upload";
import CRTOverlay from "@/components/CRTOverlay";
import MenuMusic from "@/components/MenuMusic";
import { VolumeProvider } from "@/lib/volume";

function App() {
  return (
    <div className="App relative min-h-screen bg-soul-void text-soul-ink font-body">
      <BrowserRouter>
        <VolumeProvider>
          <MenuMusic />
          <Routes>
            <Route path="/" element={<MainMenu />} />
            <Route path="/levels" element={<LevelSelect />} />
            <Route path="/play/:levelId" element={<Game />} />
            <Route path="/about" element={<About />} />
            <Route path="/upload" element={<Upload />} />
          </Routes>
        </VolumeProvider>
      </BrowserRouter>
      <CRTOverlay />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#10121C",
            color: "#E0E2EB",
            border: "1px solid #222436",
            fontFamily: "'Outfit', sans-serif",
          },
        }}
      />
    </div>
  );
}

export default App;
