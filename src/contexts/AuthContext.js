// src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from "react";
import { auth, database } from "../services/firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { ref, get, set } from "firebase/database";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function registerTrainer(email, password, profileData) {
    // Create auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Store in pending trainers
    await set(ref(database, `pendingTrainers/${userCredential.user.uid}`), {
      email,
      profile: profileData,
      registrationDate: Date.now(),
      status: "pending"
    });
    
    return userCredential;
  }

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    return signOut(auth);
  }

  async function checkUserRole(uid) {
    // Check if admin
    const adminSnapshot = await get(ref(database, `admins/${uid}`));
    if (adminSnapshot.exists()) {
      setUserRole("admin");
      return "admin";
    }
    
    // Check if approved trainer
    const trainerSnapshot = await get(ref(database, `trainers/${uid}`));
    if (trainerSnapshot.exists()) {
      setUserRole("trainer");
      return "trainer";
    }
    
    // Check if pending trainer
    const pendingSnapshot = await get(ref(database, `pendingTrainers/${uid}`));
    if (pendingSnapshot.exists()) {
      setUserRole("pending");
      return "pending";
    }
    
    setUserRole(null);
    return null;
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await checkUserRole(user.uid);
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    registerTrainer,
    login,
    logout,
    checkUserRole
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
