import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from "react";
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
  const [apiProvider, setApiProvider] = useState("chatgpt"); // Default to OpenAI for stability
  const [apiConversationId, setApiConversationId] = useState(null); // Track API conversation ID

  // Define sendAIMessage function
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

  // Define createNewConversation function with proper dependencies
  const createNewConversation = useCallback(async () => {
    if (!currentUser) return;
    
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
    
    const newConversationId = newConversationRef.key;
    setConversationId(newConversationId);
    
    // Reset API conversation ID for the new conversation
    setApiConversationId(null);
    
    setMessages([]);
    
    // Add AI welcome message
    const messagesRef = ref(database, `conversations/${newConversationId}/messages`);
    const newMessageRef = push(messagesRef);
    
    await set(newMessageRef, {
      sender: "ai",
      text: "Welcome to Tangkhul AI Trainer. How are you doing today?",
      timestamp: Date.now()
    });
    
    setLoading(false);
  }, [currentUser]);

  // Process messages for potential language examples
  const processMessageForExamples = useCallback(async (text) => {
    if (!currentUser || !conversationId) return;
    
    // Check for potential Tangkhul examples (contains special characters)
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(text);
    
    if (hasTangkhulChars) {
      // Extract Tangkhul examples (simplified)
      const example = {
        tangkhulText: text,
        englishTranslation: "",
        category: "detected",
        context: "conversation"
      };
      
      await storeLanguageExample(example, conversationId, currentUser.uid);
      
      // Update knowledge profile
      await updateTrainerKnowledgeProfile(currentUser.uid, "general", 0.7);
    }
  }, [currentUser, conversationId]);

  // Generate AI response
  const generateAIResponse = useCallback(async (trainerMessage) => {
    if (!conversationId) return;
    
    try {
      // Limit conversation context to prevent overload
      const recentMessages = messages.slice(-5);
      
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
              content: "You are an AI assistant designed to collect Tangkhul language examples from human trainers. Follow these guidelines: 1) Use only English in your responses. 2) Ask only ONE question at a time. 3) Format your responses with clear paragraphs and proper spacing. 4) Focus on eliciting specific Tangkhul language examples, grammar clarifications, or vocabulary. 5) Keep your responses concise and focused. 6) IMPORTANT: If the user message is in English (like 'hi', 'hello', etc.), respond appropriately in English. Only ask for translations when the message contains Tangkhul text."
            },
            ...recentMessages.map(msg => ({
              role: msg.sender === "trainer" ? "user" : "assistant",
              content: msg.text
            })),
            {
              role: "user",
              content: trainerMessage
            }
          ],
          apiProvider,
          conversationId: apiConversationId // Pass the API conversation ID
        }),
      });

      const data = await response.json();
      
      // If response includes a conversation ID, save it for future requests
      if (data.conversationId) {
        setApiConversationId(data.conversationId);
      }
      
      if (data.response) {
        // Remove the provider indication (e.g., "(OpenAI)" or "(Perplexity)") before storing
        const cleanedResponse = data.response.replace(/\n\n\([^)]+\)$/, '');
        await sendAIMessage(cleanedResponse);
      } else {
        // Fallback message if API call fails
        await sendAIMessage("I'm sorry, I couldn't process that. Could you please try again?");
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      await sendAIMessage("I'm experiencing some technical difficulties. Please try again later.");
    }
  }, [conversationId, messages, apiProvider, apiConversationId, sendAIMessage]);

  // Send trainer message
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
  }, [conversationId, processMessageForExamples, generateAIResponse]);

  // Initialize or load conversation
  useEffect(() => {
    if (!currentUser) return;
    
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
    }).catch(error => {
      console.error("Error checking active conversation:", error);
      setLoading(false);
    });
  }, [currentUser, createNewConversation]);

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
