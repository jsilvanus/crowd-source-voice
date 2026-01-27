import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Header from './components/Header';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Record from './pages/Record';
import Validate from './pages/Validate';
import MyRecordings from './pages/MyRecordings';
import Profile from './pages/Profile';
import AdminCorpora from './pages/admin/Corpora';
import AdminExport from './pages/admin/Export';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading, isAuthenticated, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" />;
  }

  return children;
}

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="loading" style={{ height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />

          <Route path="/" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />

          <Route path="/record/:corpusId" element={
            <PrivateRoute>
              <Record />
            </PrivateRoute>
          } />

          <Route path="/validate" element={
            <PrivateRoute>
              <Validate />
            </PrivateRoute>
          } />

          <Route path="/my-recordings" element={
            <PrivateRoute>
              <MyRecordings />
            </PrivateRoute>
          } />

          <Route path="/profile" element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          } />

          <Route path="/admin/dashboard" element={
            <PrivateRoute adminOnly>
              <AdminDashboard />
            </PrivateRoute>
          } />

          <Route path="/admin/corpora" element={
            <PrivateRoute adminOnly>
              <AdminCorpora />
            </PrivateRoute>
          } />

          <Route path="/admin/users" element={
            <PrivateRoute adminOnly>
              <AdminUsers />
            </PrivateRoute>
          } />

          <Route path="/admin/export" element={
            <PrivateRoute adminOnly>
              <AdminExport />
            </PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
