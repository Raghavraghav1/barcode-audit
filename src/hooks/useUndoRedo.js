import { useState, useCallback } from 'react';

/**
 * Action-based Undo/Redo State Engine
 */
export default function useUndoRedo() {
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);

  const recordAction = useCallback((action) => {
    setPast((prev) => [...prev, action]);
    setFuture([]); // Clear redo stack on new action
  }, []);

  const undo = useCallback((handler) => {
    if (past.length === 0) return;
    
    const action = past[past.length - 1];
    setPast((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [...prev, action]);

    if (handler) {
      handler(action);
    }
  }, [past]);

  const redo = useCallback((handler) => {
    if (future.length === 0) return;

    const action = future[future.length - 1];
    setFuture((prev) => prev.slice(0, prev.length - 1));
    setPast((prev) => [...prev, action]);

    if (handler) {
      handler(action);
    }
  }, [future]);

  const clearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    recordAction,
    undo,
    redo,
    clearHistory,
    actionLog: past // exposing actions for timeline / audit log usage
  };
}
