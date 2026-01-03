import { Routes, Route } from "react-router-dom";
import MainTrekApp from "./MainTrekApp.jsx";
import AdminDashboard from "./AdminDashboard.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainTrekApp />} />
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
}
