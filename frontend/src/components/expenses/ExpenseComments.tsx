'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useQuery, useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import { X, Send, Trash2, Edit2, CornerDownLeft } from 'lucide-react';

interface ExpenseCommentsProps {
  expenseId: string;
  expenseDescription: string;
  onClose: () => void;
}

export default function ExpenseComments({ expenseId, expenseDescription, onClose }: ExpenseCommentsProps) {
  const { user } = useAuth();
  const { socket, joinExpense, leaveExpense } = useSocket();
  const [content, setContent] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch comments
  const { data: messages, refetch } = useQuery(`/expenses/${expenseId}/messages`, () =>
    api.get(`/expenses/${expenseId}/messages`)
  );

  // Join/leave expense comments socket room
  useEffect(() => {
    joinExpense(expenseId);
    return () => {
      leaveExpense(expenseId);
    };
  }, [expenseId, joinExpense, leaveExpense]);

  // Setup local socket listeners for message changes and typing status
  useEffect(() => {
    if (!socket) return;

    const handleMessageCreated = () => {
      refetch().catch(() => {});
    };
    const handleMessageUpdated = () => {
      refetch().catch(() => {});
    };
    const handleMessageDeleted = () => {
      refetch().catch(() => {});
    };
    const handleTyping = (data: { userId: string; displayName: string; isTyping: boolean }) => {
      if (data.userId !== user?.id) {
        setTypingUser(data.isTyping ? data.displayName : null);
      }
    };

    socket.on('message.created', handleMessageCreated);
    socket.on('message.updated', handleMessageUpdated);
    socket.on('message.deleted', handleMessageDeleted);
    socket.on('typing', handleTyping);

    return () => {
      socket.off('message.created', handleMessageCreated);
      socket.off('message.updated', handleMessageUpdated);
      socket.off('message.deleted', handleMessageDeleted);
      socket.off('typing', handleTyping);
    };
  }, [socket, refetch, user]);

  // Handle typing indicator trigger
  const handleContentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    
    if (socket && user) {
      socket.emit('typing', { expenseId, isTyping: e.target.value.length > 0 });
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { expenseId, isTyping: false });
      }, 2000);
    }
  };

  // Create message mutation
  const { mutate: createMessage } = useMutation(
    (text: string) => api.post(`/expenses/${expenseId}/messages`, { content: text }),
    {
      onSuccess: () => {
        setContent('');
        if (socket) {
          socket.emit('typing', { expenseId, isTyping: false });
        }
      },
    }
  );

  // Edit message mutation
  const { mutate: updateMessage } = useMutation(
    ({ id, text }: { id: string; text: string }) =>
      api.patch(`/expenses/${expenseId}/messages/${id}`, { content: text }),
    {
      onSuccess: () => {
        setEditingMessageId(null);
        setEditContent('');
      },
    }
  );

  // Delete message mutation
  const { mutate: deleteMessage } = useMutation(
    (id: string) => api.delete(`/expenses/${expenseId}/messages/${id}`),
    {
      onSuccess: () => {
        // refetch handles sync
      },
    }
  );

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createMessage(content.trim());
  };

  const handleEditSubmit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editContent.trim()) return;
    updateMessage({ id, text: editContent.trim() });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[450px] bg-[#151c2c] border-l border-[#222d44] flex flex-col justify-between shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-[#222d44] flex items-center justify-between">
        <div className="overflow-hidden mr-4">
          <h3 className="text-base font-bold text-white truncate">Comments Thread</h3>
          <p className="text-xs text-slate-400 truncate">{expenseDescription}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg bg-slate-800 border border-[#222d44] p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages && messages.length > 0 ? (
          messages.map((msg: any) => {
            const isMe = msg.authorId === user?.id;
            const initials = msg.author?.avatarInitials || msg.author?.displayName?.slice(0, 2).toUpperCase() || '??';
            const color = msg.author?.avatarColor || '#3b82f6';
            
            return (
              <div key={msg.id} className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>

                <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : ''}`}>
                  {/* Metadata */}
                  <span className="text-xs text-slate-500 mb-1">
                    {msg.author?.displayName || 'Unknown'} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* Bubble Content */}
                  <div className={`p-3 rounded-2xl text-sm relative group/bubble ${
                    isMe
                      ? 'bg-primary text-white rounded-tr-none'
                      : 'bg-[#1f2a3f] text-slate-200 rounded-tl-none'
                  }`}>
                    {editingMessageId === msg.id ? (
                      <form onSubmit={(e) => handleEditSubmit(e, msg.id)} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          className="bg-slate-800 border border-[#222d44] rounded px-2 py-1 text-white text-xs focus:outline-none"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <button type="submit" className="text-cyan-glow hover:opacity-80"><CornerDownLeft size={14} /></button>
                      </form>
                    ) : (
                      <>
                        <p>{msg.content}</p>
                        {/* Action buttons (Edit/Delete) */}
                        {isMe && (
                          <div className={`absolute top-0 right-0 -translate-y-6 flex items-center gap-1.5 bg-slate-800 border border-[#222d44] rounded-md px-1 py-0.5 opacity-0 group-hover/bubble:opacity-100 transition duration-150`}>
                            <button
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditContent(msg.content);
                              }}
                              className="text-slate-400 hover:text-white p-0.5 rounded"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="text-negative hover:opacity-80 p-0.5 rounded"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col h-full items-center justify-center text-slate-500 py-12">
            <p className="text-sm">No comments yet.</p>
            <p className="text-xs text-slate-600 mt-1">Start the conversation below.</p>
          </div>
        )}
      </div>

      {/* Footer input */}
      <div className="p-4 border-t border-[#222d44] space-y-2">
        {typingUser && (
          <p className="text-xs text-cyan-glow flex items-center gap-1.5">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-glow animate-bounce-slow"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-glow animate-bounce-slow [animation-delay:0.2s]"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-glow animate-bounce-slow [animation-delay:0.4s]"></span>
            </span>
            {typingUser} is typing...
          </p>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-lg bg-input-bg border border-input-border px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-glow text-sm transition"
            placeholder="Write a message..."
            value={content}
            onChange={handleContentChange}
          />
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-primary to-[#4f46e5] px-4 hover:opacity-95 text-white transition flex items-center justify-center cursor-pointer"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
