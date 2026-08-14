import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./Pages/Auth/Auth";
import Dashboard from "./Pages/Dashboard/Dashboard";
import Upload from "./Pages/Upload/Upload";
import ProtectedRoute from "./Components/ProtectedRoute";
import Navbar from "./Components/Navbar/Navbar";
import Inventory from "./Pages/Inventory/Inventory";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/login" element={<Auth />} />

        {/* PROTECTED ROUTES WITH NAVBAR */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Navbar>
                <Dashboard />
              </Navbar>
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <Navbar>
                <Upload />
              </Navbar>
            </ProtectedRoute>
          }
        />

        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <Navbar>
                <Inventory />
              </Navbar>
            </ProtectedRoute>
          }
        />

        {/* FALLBACK - Redirect to dashboard if logged in, else login */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;