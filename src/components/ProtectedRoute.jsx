import { Outlet, Navigate } from "react-router-dom";
import { getDemoUser } from "@/lib/demoAuth";

export default function ProtectedRoute({ unauthenticatedElement }) {
  const demoUser = getDemoUser();

  if (!demoUser) {
    return unauthenticatedElement ?? <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
