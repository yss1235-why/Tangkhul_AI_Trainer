// src/contexts/ChatContext.js
import React, { createContext, useState, useContext, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { database } from "../services/firebase";
import { ref, push, set, get, onValue } from "firebase/database";
import { storeLanguageExample, updateTrainerKnowledgeProfile } from "../services/dataProcessor";

const ChatContext = createContext();

export function useChat() {
  return useContext(ChatContext);
}

export function ChatProvider({ children }) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiProvider, setApiProvider] = useState("perplexity"); // or "chatgpt"

  // Initialize or load conversation
  useEffect(() => {
    if (currentUser) {
      const activeConversationRef = ref(database, `trainers/${currentUser.uid}/activeConversation`);
      
      get(activeConversationRef).then((snapshot) => {
        if (snapshot.exists()) {
          // Load existing conversation
          const activeConvId = snapshot.val();
          setConversationId(activeConvId);
          
          // Load messages
          const messagesRef = ref(database, `conversations/${activeConvId}/messages`);
          onValue(messagesRef, (messagesSnapshot) => {
            const messageList = [];
            messagesSnapshot.forEach((childSnapshot) => {
              messageList.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
              });
            });
            setMessages(messageList);
            setLoading(false);
          });
        } else {
          // Create new conversation
          createNewConversation();
        }
      });
    }
  }, [currentUser]);

  async function createNewConversation() {
    if (currentUser) {
      const conversationsRef = ref(database, "conversations");
      const newConversationRef = push(conversationsRef);
      
      await set(newConversationRef, {
        startTime: Date.now(),
        trainerId: currentUser.uid,
        status: "active",
        messageCount: 0
      });
      
      // Set as active conversation
      await set(ref(database, `trainers/${currentUser.uid}/activeConversation`), newConversationRef.key);
      
      setConversationId(newConversationRef.key);
      setMessages([]);
      
      // Add AI welcome message
      await sendAIMessage("Welcome to Tangkhul AI Trainer. How are you doing today?");
      
      setLoading(false);
    }
  }

  async function sendTrainerMessage(text) {
    if (!conversationId) return;
    
    const messagesRef = ref(database, `conversations/${conversationId}/messages`);
    const newMessageRef = push(messagesRef);
    
    const message = {
      sender: "trainer",
      text,
      timestamp: Date.now()
    };
    
    await set(newMessageRef, message);
    
    // Process message for potential language examples
    processMessageForExamples(text);
    
    // Generate AI response
    await generateAIResponse(text);
  }

  async function sendAIMessage(text) {
    if (!conversationId) return;
    
    const messagesRef = ref(database, `conversations/${conversationId}/messages`);
    const newMessageRef = push(messagesRef);
    
    const message = {
      sender: "ai",
      text,
      timestamp: Date.now()
    };
    
    await set(newMessageRef, message);
  }

  async function processMessageForExamples(text) {
    // This is a simplified detection logic
    // In a real implementation, this would be more sophisticated
    
    // Check for potential Tangkhul examples (contains special characters)
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(text);
    
    if (hasTangkhulChars) {
      // Extract Tangkhul examples (simplified)
      const example = {
        tangkhulText: text,
        englishTranslation: "", // This would need to be determined from context
        category: "detected",
        context: "conversation"
      };
      
      await storeLanguageExample(example, conversationId, currentUser.uid);
      
      // Update knowledge profile
      await updateTrainerKnowledgeProfile(currentUser.uid, "general", 0.7);
    }
  }

  async function generateAIResponse(trainerMessage) {
    // This function would call your serverless function to invoke the AI API
    // For this implementation, we'll use a placeholder response
    
    // Check API usage and switch if needed
    const usageRef = ref(database, "apiUsage/perplexity");
    const usageSnapshot = await get(usageRef);
    
    if (usageSnapshot.exists() && usageSnapshot.val() > 5.0) {
      setApiProvider("chatgpt");
    }
    
    // Placeholder AI response
    const aiResponse = "Thank you for sharing that. Could you tell me more about how you would express this concept in Tangkhul?";
    
    await sendAIMessage(aiResponse);
  }

  const value = {
    messages,
    conversationId,
    loading,
    apiProvider,
    sendTrainerMessage,
    createNewConversation
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
