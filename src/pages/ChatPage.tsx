import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, Settings, User, Bot, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant' as const,
      content: 'Hello! I\'m your assistant. How can I help you today?',
      timestamp: '10:00 AM'
    },
    {
      id: '2',
      role: 'user' as const,
      content: 'I need help with a React component',
      timestamp: '10:01 AM'
    },
    {
      id: '3',
      role: 'assistant' as const,
      content: 'Sure! What do you need help with specifically? Component structure, state management, or something else?',
      timestamp: '10:02 AM'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: 'This is a simulated response to: ' + input,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMessage]);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
            <Bot size={16} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Code Assistant</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <Settings size={18} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${message.role === 'user' ? 'bg-indigo-600 text-white rounded-tl-lg rounded-tr-lg rounded-bl-lg' : 'bg-white dark:bg-gray-800 rounded-tl-lg rounded-tr-lg rounded-br-lg border border-gray-200 dark:border-gray-700'}`}>
              <div className="p-3">
                <p className={message.role === 'user' ? 'text-white' : 'text-gray-900 dark:text-white'}>
                  {message.content}
                </p>
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${message.role === 'user' ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
                    {message.timestamp}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 rounded-tl-lg rounded-tr-lg rounded-br-lg border border-gray-200 dark:border-gray-700 p-3 max-w-[80%]">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="text-indigo-600 dark:text-indigo-400 animate-spin" />
                <span className="text-gray-600 dark:text-gray-400">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <Paperclip size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <Mic size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={handleSend}
            className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;