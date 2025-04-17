import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userRole } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  if (userRole === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Account Pending Approval</h2>
          <p className="text-gray-600 mb-4">
            Your account is currently pending administrator approval. You'll be notified once your account is activated.
          </p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="w-full bg-teal-200 text-gray-700 py-2 px-4 rounded hover:bg-teal-300"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }
  
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }
  
  return children;
}
