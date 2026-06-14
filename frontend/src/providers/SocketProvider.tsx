'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthProvider';
import { api } from '../lib/api';
import { invalidateQueries } from '../hooks/useQuery';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  joinGroup: (groupId: string) => void;
  leaveGroup: (groupId: string) => void;
  joinExpense: (expenseId: string) => void;
  leaveExpense: (expenseId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const tokenVal = api.getAccessToken() || '';
    const socketInstance = io('http://localhost:3001', {
      query: { token: tokenVal },
      auth: { token: tokenVal },
      autoConnect: true,
      transports: ['websocket'],
    });

    socketInstance.on('connect', () => {
      console.log('[SocketProvider] Connected with ID:', socketInstance.id);
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('[SocketProvider] Disconnected');
      setConnected(false);
    });

    // Register global event handlers for cache invalidation
    socketInstance.on('expense.created', (data: any) => {
      console.log('[Socket] expense.created:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/expenses`);
        invalidateQueries(`/groups/${data.groupId}/balances`);
      }
    });

    socketInstance.on('expense.updated', (data: any) => {
      console.log('[Socket] expense.updated:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/expenses`);
        invalidateQueries(`/groups/${data.groupId}/balances`);
      }
    });

    socketInstance.on('expense.deleted', (data: any) => {
      console.log('[Socket] expense.deleted:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/expenses`);
        invalidateQueries(`/groups/${data.groupId}/balances`);
      }
    });

    socketInstance.on('settlement.created', (data: any) => {
      console.log('[Socket] settlement.created:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/settlements`);
        invalidateQueries(`/groups/${data.groupId}/balances`);
      }
    });

    socketInstance.on('balance.updated', (data: any) => {
      console.log('[Socket] balance.updated:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/balances`);
      }
    });

    socketInstance.on('member.joined', (data: any) => {
      console.log('[Socket] member.joined:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/members`);
      }
    });

    socketInstance.on('member.left', (data: any) => {
      console.log('[Socket] member.left:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/members`);
      }
    });

    // Import updates
    socketInstance.on('import.job.created', (data: any) => {
      console.log('[Socket] import.job.created:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/import`);
      }
    });

    socketInstance.on('import.row.approved', (data: any) => {
      console.log('[Socket] import.row.approved:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/import`);
      }
    });

    socketInstance.on('import.row.rejected', (data: any) => {
      console.log('[Socket] import.row.rejected:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/import`);
      }
    });

    socketInstance.on('import.row.imported', (data: any) => {
      console.log('[Socket] import.row.imported:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/import`);
        invalidateQueries(`/groups/${data.groupId}/expenses`);
        invalidateQueries(`/groups/${data.groupId}/balances`);
      }
    });

    socketInstance.on('import.progress.updated', (data: any) => {
      console.log('[Socket] import.progress.updated:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/import`);
      }
    });

    socketInstance.on('import.job.completed', (data: any) => {
      console.log('[Socket] import.job.completed:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/import`);
        invalidateQueries(`/groups/${data.groupId}/expenses`);
        invalidateQueries(`/groups/${data.groupId}/balances`);
      }
    });

    socketInstance.on('import.job.failed', (data: any) => {
      console.log('[Socket] import.job.failed:', data);
      if (data.groupId) {
        invalidateQueries(`/groups/${data.groupId}/import`);
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  // Methods to join/leave rooms
  const joinGroup = (groupId: string) => {
    if (socketInstanceRef(socket)) {
      console.log('[Socket] Joining group:', groupId);
      socket.emit('joinGroup', { groupId });
    }
  };

  const leaveGroup = (groupId: string) => {
    if (socketInstanceRef(socket)) {
      console.log('[Socket] Leaving group:', groupId);
      socket.emit('leaveGroup', { groupId });
    }
  };

  const joinExpense = (expenseId: string) => {
    if (socketInstanceRef(socket)) {
      console.log('[Socket] Joining expense:', expenseId);
      socket.emit('joinExpense', { expenseId });
    }
  };

  const leaveExpense = (expenseId: string) => {
    if (socketInstanceRef(socket)) {
      console.log('[Socket] Leaving expense:', expenseId);
      socket.emit('leaveExpense', { expenseId });
    }
  };

  function socketInstanceRef(s: Socket | null): s is Socket {
    return s !== null && s.connected;
  }

  return (
    <SocketContext.Provider
      value={{ socket, connected, joinGroup, leaveGroup, joinExpense, leaveExpense }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
