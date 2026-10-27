import React, { createContext, useState, useContext } from "react";
import { getDemoUser, setDemoUser, clearDemoUser } from "@/lib/demoAuth";

const AuthContext = createContext();

// Self-hosted demo authentication. Sessions are stored in localStorage via
// demoAuth (mkbs_demo_user). This will be replaced by Django REST Framework
// token authentication in Phase 5/7 without changing this public interface.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getDemoUser());
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getDemoUser());
  const [isLoadingAuth] = useState(false);
  const [authError] = useState(null);
  const [authChecked] = useState(true);

  const login = (userData) => {
    setDemoUser(userData);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = () => {
    clearDemoUser();
    // Drop the DRF token too so the store returns to local mode.
    try {
      localStorage.removeItem("mkbs_api_token");
    } catch {
      /* noop */
    }
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        authError,
        authChecked,
        login,
        logout,
        navigateToLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
