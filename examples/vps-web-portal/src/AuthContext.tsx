/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, PORTAL_AUTH_EXPIRED_EVENT } from "./api";

interface AuthContextType {
  token: string | null;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  providerConfigured: boolean;
  providerLoading: boolean;
  refreshProviderStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  login: async () => false,
  logout: () => {},
  isLoading: true,
  providerConfigured: false,
  providerLoading: false,
  refreshProviderStatus: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("tandem_portal_token");
  });
  const [isLoading, setIsLoading] = useState(true);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [providerLoading, setProviderLoading] = useState(() => {
    return !!localStorage.getItem("tandem_portal_token");
  });

  const checkProviderConfigured = async (): Promise<boolean> => {
    try {
      const cfg = await api.getProvidersConfig();
      const providers = cfg.providers || {};
      const defaultProvider = cfg.default || null;

      // Prefer an explicit default provider with a selected model.
      if (defaultProvider && providers[defaultProvider]?.default_model) {
        return true;
      }

      // Fallback: any configured provider with a model.
      return Object.entries(providers).some(([providerId, entry]) => {
        if (providerId === "local") return false;
        return !!entry?.default_model;
      });
    } catch {
      return false;
    }
  };

  const refreshProviderStatus = async () => {
    setProviderLoading(true);
    const configured = await checkProviderConfigured();
    setProviderConfigured(configured);
    setProviderLoading(false);
  };

  const logout = useCallback(() => {
    localStorage.removeItem("tandem_portal_token");
    api.setToken("");
    setToken(null);
    setProviderConfigured(false);
    setProviderLoading(false);
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem("tandem_portal_token");
    if (storedToken) {
      api.setToken(storedToken);
      checkProviderConfigured()
        .then(setProviderConfigured)
        .finally(() => setProviderLoading(false));
    }
    // eslint-disable-next-line
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      logout();
    };
    window.addEventListener(PORTAL_AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(PORTAL_AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [logout]);

  const login = async (newToken: string) => {
    try {
      // Test the token
      api.setToken(newToken);
      await api.getSystemHealth();
      const configured = await checkProviderConfigured();
      localStorage.setItem("tandem_portal_token", newToken);
      setToken(newToken);
      setProviderConfigured(configured);
      return true;
    } catch (error) {
      console.error(error);
      api.setToken(""); // clear bad token
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        login,
        logout,
        isLoading,
        providerConfigured,
        providerLoading,
        refreshProviderStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
