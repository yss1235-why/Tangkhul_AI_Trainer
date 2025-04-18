import React, { useState, useRef, useEffect } from "react";
import { useChat } from "../../contexts/ChatContext";
import { useAuth } from "../../contexts/AuthContext";

export default function ChatInterface() {
  const { messages, sendTrainerMessage, loading } = useChat();
  const { logout } = useAuth();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Auto-adjust textarea height on component mount and message change
  useEffect(() => {
    if (textareaRef.current) {
      adjustTextareaHeight(textareaRef.current);
    }
  }, [message]);

  const handleSendMessage = () => {
    if (message.trim()) {
      sendTrainerMessage(message);
      setMessage("");
      
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const insertSpecialChar = (char) => {
    if (!textareaRef.current) return;
    
    // Save current selection/cursor position
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    
    // Create new text with the special character inserted at cursor position
    const newText = message.substring(0, start) + char + message.substring(end);
    setMessage(newText);
    
    // Use setTimeout to ensure cursor position is set after state update
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPosition = start + char.length;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 10);
  };

  const adjustTextareaHeight = (element) => {
    // Reset height to calculate correct scrollHeight
    element.style.height = "auto";
    
    // Set new height based on content (add small buffer to prevent scrollbar flicker)
    element.style.height = Math.min(Math.max(element.scrollHeight, 40), 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-300 mx-auto"></div>
          <p className="mt-4 text-gray-700">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <div className="bg-teal-200 text-gray-700 p-4 shadow-md flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Tangkhul AI Trainer</h1>
          <p className="text-sm">Collecting conversational data</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-700 hover:text-gray-900"
        >
          Logout
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.sender === 'trainer' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-xs p-3 rounded-lg ${
                msg.sender === 'trainer' 
                  ? 'bg-teal-200 text-gray-700 rounded-br-none' 
                  : 'bg-gray-200 text-gray-800 rounded-bl-none'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Special character panel */}
      <div className="bg-gray-200 border-t border-gray-300">
        <div className="flex justify-between items-center px-3 py-2">
          {/* Left group - Characters with macron */}
          <div className="flex space-x-2">
            <button 
              onClick={() => insertSpecialChar('Ā')}
              className="w-10 h-10 bg-white rounded-md shadow-sm text-lg flex items-center justify-center focus:outline-none hover:bg-gray-50"
            >
              Ā
            </button>
            <button 
              onClick={() => insertSpecialChar('ā')}
              className="w-10 h-10 bg-white rounded-md shadow-sm text-lg flex items-center justify-center focus:outline-none hover:bg-gray-50"
            >
              ā
            </button>
          </div>
          
          {/* Right group - Characters with underline */}
          <div className="flex space-x-2 mr-3">
            <button 
              onClick={() => insertSpecialChar('A̲')}
              className="w-10 h-10 bg-white rounded-md shadow-sm text-lg flex items-center justify-center focus:outline-none hover:bg-gray-50"
            >
              A̲
            </button>
            <button 
              onClick={() => insertSpecialChar('a̲')}
              className="w-10 h-10 bg-white rounded-md shadow-sm text-lg flex items-center justify-center focus:outline-none hover:bg-gray-50"
            >
              a̲
            </button>
          </div>
        </div>
      </div>

      {/* Input area - Changed from input to textarea */}
      <div className="bg-white border-t border-gray-300 p-4 flex items-center">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 resize-none overflow-y-auto min-h-[40px] max-h-[120px]"
          rows="1"
        />
        <button 
          onClick={handleSendMessage}
          className="ml-2 bg-teal-200 text-gray-700 rounded-full p-2 focus:outline-none hover:bg-teal-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
