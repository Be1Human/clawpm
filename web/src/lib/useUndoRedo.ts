/**
 * useUndoRedo — 命令模式 Undo/Redo hook
 *
 * 每个可撤销操作抽象为 UndoCommand，包含 undo() 和 redo() 两个异步方法。
 * 使用 undoStack / redoStack 两个栈管理操作历史。
 */
import { useRef, useState, useCallback } from 'react';

export interface UndoCommand {
  /** 操作描述（用于 tooltip 显示），如 "创建节点 U-042" */
  label: string;
  /** 撤销：执行逆操作 API */
  undo: () => Promise<void>;
  /** 重做：重新执行正操作 API */
  redo: () => Promise<void>;
}

export interface UseUndoRedoOptions {
  /** 栈大小上限，默认 50 */
  maxStackSize?: number;
  /** 撤销/重做后刷新数据的回调（invalidateQueries） */
  onInvalidate: () => void;
  /** 撤销/重做执行失败时的回调 */
  onError?: (action: 'undo' | 'redo', error: Error) => void;
}

export interface UseUndoRedoReturn {
  /** 推入一个可撤销命令 */
  pushCommand: (cmd: UndoCommand) => void;
  /** 执行撤销 */
  undo: () => Promise<void>;
  /** 执行重做 */
  redo: () => Promise<void>;
  /** 是否有可撤销的操作 */
  canUndo: boolean;
  /** 是否有可重做的操作 */
  canRedo: boolean;
  /** 栈顶撤销操作描述 */
  undoLabel: string | null;
  /** 栈顶重做操作描述 */
  redoLabel: string | null;
  /** 当前是否正在执行 undo/redo */
  isProcessing: boolean;
  /** 清空所有操作栈 */
  clear: () => void;
}

export function useUndoRedo(options: UseUndoRedoOptions): UseUndoRedoReturn {
  const { maxStackSize = 50, onInvalidate, onError } = options;

  const undoStackRef = useRef<UndoCommand[]>([]);
  const redoStackRef = useRef<UndoCommand[]>([]);
  const processingRef = useRef(false);

  // 用于触发 UI 更新的版本计数器（栈存 ref 中不触发 re-render，需要手动触发）
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const pushCommand = useCallback((cmd: UndoCommand) => {
    undoStackRef.current.push(cmd);
    // 超出上限时丢弃最早的操作
    if (undoStackRef.current.length > maxStackSize) {
      undoStackRef.current.shift();
    }
    // 新操作入栈时清空 redo 栈
    redoStackRef.current = [];
    bump();
  }, [maxStackSize, bump]);

  const undo = useCallback(async () => {
    if (processingRef.current) return;
    const cmd = undoStackRef.current.pop();
    if (!cmd) return;

    processingRef.current = true;
    bump();

    try {
      await cmd.undo();
      redoStackRef.current.push(cmd);
      onInvalidate();
    } catch (err) {
      // 失败时不再将 command 放回 undo 栈，避免重复尝试
      onError?.('undo', err instanceof Error ? err : new Error(String(err)));
    } finally {
      processingRef.current = false;
      bump();
    }
  }, [onInvalidate, onError, bump]);

  const redo = useCallback(async () => {
    if (processingRef.current) return;
    const cmd = redoStackRef.current.pop();
    if (!cmd) return;

    processingRef.current = true;
    bump();

    try {
      await cmd.redo();
      undoStackRef.current.push(cmd);
      onInvalidate();
    } catch (err) {
      onError?.('redo', err instanceof Error ? err : new Error(String(err)));
    } finally {
      processingRef.current = false;
      bump();
    }
  }, [onInvalidate, onError, bump]);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    bump();
  }, [bump]);

  // 从 ref 读取当前状态（version 变化触发重新读取）
  void version; // 确保 version 被使用（lint friendly）
  const canUndo = undoStackRef.current.length > 0 && !processingRef.current;
  const canRedo = redoStackRef.current.length > 0 && !processingRef.current;
  const undoLabel = undoStackRef.current.length > 0
    ? undoStackRef.current[undoStackRef.current.length - 1].label
    : null;
  const redoLabel = redoStackRef.current.length > 0
    ? redoStackRef.current[redoStackRef.current.length - 1].label
    : null;

  return {
    pushCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    isProcessing: processingRef.current,
    clear,
  };
}
