import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import ScrollToTop from "./components/ScrollToTop";
import ProtectedRoute from "@/components/ProtectedRoute";
import { StoreProvider } from "@/lib/StoreContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { Layout } from "@/components/Layout";
// Auth pages
import Login from "@/pages/Login";
// App pages
import Home from "@/pages/Home";
import Catalog from "@/pages/Catalog";
import Scan from "@/pages/Scan";
import MediaDetail from "@/pages/MediaDetail";
import Genres from "@/pages/Genres";
import Persons from "@/pages/Persons";
import Settings from "@/pages/Settings";
import GenreDetail from "@/pages/GenreDetail";
import PersonDetail from "@/pages/PersonDetail";
import HardDriveDetail from "@/pages/HardDriveDetail";
import Watchlist from "@/pages/Watchlist";

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError, navigateToLogin } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError && authError.type === "auth_required") {
    navigateToLogin();
    return null;
  }

  return (
    <StoreProvider>
      <ThemeProvider>
        <Routes>
          {/* Auth routes */}
          <Route path="/login" element={<Login />} />

          {/* App routes */}
          <Route
            element={
              <ProtectedRoute
                unauthenticatedElement={<Navigate to="/login" replace />}
              />
            }
          >
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/scan" element={<Scan />} />
              <Route path="/media/:id" element={<MediaDetail />} />
              <Route path="/genres" element={<Genres />} />
              <Route path="/persons" element={<Persons />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/genre/:id" element={<GenreDetail />} />
              <Route path="/person/:id" element={<PersonDetail />} />
              <Route path="/hard-drive/:id" element={<HardDriveDetail />} />
              <Route path="/watchlist" element={<Watchlist />} />
            </Route>
          </Route>

          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </ThemeProvider>
    </StoreProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
