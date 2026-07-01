import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { SocketProvider } from './hooks/useSocket';

import WelcomePage from './pages/WelcomePage';
import LoginPage from './pages/LoginPage';
import ShopPage from './pages/ShopPage';
import CanvasPage from './pages/CanvasPage';
import AdminPage from './pages/AdminPage';
import NftPage from './pages/NftPage';
import AuctionPage from './pages/AuctionPage';

function App() {
  return (
    <Router>
      <AppProvider>
        <SocketProvider>
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/canvas" element={<CanvasPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/nft" element={<NftPage />} />
            <Route path="/auction" element={<AuctionPage />} />
            <Route path="*" element={<WelcomePage />} />
          </Routes>
        </SocketProvider>
      </AppProvider>
    </Router>
  );
}

export default App;
