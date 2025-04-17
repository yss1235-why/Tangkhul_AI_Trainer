import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
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

  // Use useCallback to prevent recreation of this function on each render
  const createNewConversation = useCallback(async () => {
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
  }, [currentUser]); // Include sendAIMessage as a dependency once we define it

  // Define sendAIMessage with useCallback
  const sendAIMessage = useCallback(async (text) => {
    if (!conversationId) return;
    
    const messagesRef = ref(database, `conversations/${conversationId}/messages`);
    const newMessageRef = push(messagesRef);
    
    const message = {
      sender: "ai",
      text,
      timestamp: Date.now()
    };
    
    await set(newMessageRef, message);
  }, [conversationId]);

  // Update the createNewConversation to include sendAIMessage
  useEffect(() => {
    // Update the reference to sendAIMessage
    createNewConversation.sendAIMessage = sendAIMessage;
  }, [createNewConversation, sendAIMessage]);

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
  }, [currentUser, createNewConversation]); // Add createNewConversation to the dependency array

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
    try {
      // Call the serverless function to get AI response
      const response = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "You are an AI assistant designed to collect Tangkhul language examples from human trainers. Use only English in your responses. Ask questions that prompt Tangkhul language responses, seek clarification about grammar, and engage in natural conversation."
            },
            ...messages.map(msg => ({
              role: msg.sender === "trainer" ? "user" : "assistant",
              content: msg.text
            })),
            {
              role: "user",
              content: trainerMessage
            }
          ],
          apiProvider
        }),
      });

      const data = await response.json();
      
      if (data.response) {
        await sendAIMessage(data.response);
      } else {
        // Fallback message if API call fails
        await sendAIMessage("I'm sorry, I couldn't process that. Could you please try again?");
      }
      
      // Check if we need to switch API providers
      const usageRef = ref(database, "apiUsage/perplexity");
      const usageSnapshot = await get(usageRef);
      
      if (usageSnapshot.exists() && usageSnapshot.val() > 5.0) {
        setApiProvider("chatgpt");
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      await sendAIMessage("I'm experiencing some technical difficulties. Please try again later.");
    }
  }

  const sendTrainerMessage = useCallback(async (text) => {
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
    await processMessageForExamples(text);
    
    // Generate AI response
    await generateAIResponse(text);
  }, [conversationId]);

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
