import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { FlightAnalysisPage } from "@/features/flight-analysis/flight-analysis-page";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<FlightAnalysisPage />} />
      </Routes>
    </BrowserRouter>
  );
}
