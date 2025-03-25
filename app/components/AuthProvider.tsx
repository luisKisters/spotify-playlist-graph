"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type AuthContextType = {
  token: string | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check for token in localStorage on component mount
    const storedToken = localStorage.getItem("spotify_access_token");
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
    }

    // Check URL for auth callback
    const url = new URL(window.location.href);
    const authToken = url.searchParams.get("token");
    const error = url.searchParams.get("error");

    if (authToken) {
      localStorage.setItem("spotify_access_token", authToken);
      setToken(authToken);
      setIsAuthenticated(true);

      // Clean up URL
      window.history.replaceState({}, document.title, "/");
    } else if (error) {
      console.error("Authentication error:", error);
    }
  }, []);

  const login = () => {
    window.location.href = "/api/auth/login";
  };

  const logout = () => {
    localStorage.removeItem("spotify_access_token");
    setToken(null);
    setIsAuthenticated(false);
    router.push("/");
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
