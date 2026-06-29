import React, { createContext, useContext } from 'react';

export interface ConnectionState {
  isOnline: boolean;
  pendingSyncCount: number;
  lastSyncTime: Date | null;
  syncingOffline: boolean;
  serverUrl: string;
}

export const ConnectionContext = createContext<ConnectionState>({
  isOnline: true,
  pendingSyncCount: 0,
  lastSyncTime: null,
  syncingOffline: false,
  serverUrl: '',
});

export function useConnection(): ConnectionState {
  return useContext(ConnectionContext);
}
