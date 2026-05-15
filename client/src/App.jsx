import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { SocketProvider } from './hooks/useSocket';

// Pages
import WelcomePage from './pages/WelcomePage';
import LoginPage from './pages/LoginPage';
import ShopPage from './pages/ShopPage';
import CanvasPage from './pages/CanvasPage';
import AdminPage from './pages/AdminPage';

/**
 * App - Main application component
 *
 * Setup:
 * - React Router for navigation
 * - AppProvider for global state
 * - SocketProvider for Socket.io connection
 *
 * Routes:
 * - / → WelcomePage (landing)
 * - /login → LoginPage (wallet connection)
 * - /shop → ShopPage (credit purchase)
 * - /canvas → CanvasPage (main gameplay)
 *
 * [FUTURE: Add @multiversx/sdk-dapp DappProvider wrapper]
 */

function App() {
  // All the routes of the appx
  return (
    <Router>
      <AppProvider>
        <SocketProvider>
          <Routes>
            {/* Landing Page */}
            <Route path="/" element={<WelcomePage />} />

            {/* Wallet Connection */}
            <Route path="/login" element={<LoginPage />} />

            {/* Credit Purchase */}
            <Route path="/shop" element={<ShopPage />} />

            {/* Main Gameplay */}
            <Route path="/canvas" element={<CanvasPage />} />

            {/* Contract Admin */}
            <Route path="/admin" element={<AdminPage />} />

            {/* 404 - Redirect to home */}
            <Route path="*" element={<WelcomePage />} />
          </Routes>
        </SocketProvider>
      </AppProvider>
    </Router>
  );
}

export default App;
