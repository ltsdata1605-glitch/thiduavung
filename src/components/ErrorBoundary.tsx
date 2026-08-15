import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { clearAllLocalCache } from '../services/storeService';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);

    // Code-split chunks (React.lazy) are fetched by a content-hashed
    // filename baked into the JS the browser already has loaded. After a
    // fresh deploy, that old filename no longer exists on the server — the
    // dynamic import rejects, and with nothing catching it that used to
    // blank the whole page. A single reload fetches the current
    // index.html, which points at the chunks that actually exist now, so
    // this recovers automatically instead of leaving the user stuck. The
    // sessionStorage flag stops a *genuinely* broken deploy from reload-looping.
    const message = `${error?.message || ''} ${error?.name || ''}`.toLowerCase();
    const isChunkLoadError =
      message.includes('dynamically imported module') ||
      message.includes('failed to fetch dynamically') ||
      message.includes('chunkloaderror') ||
      message.includes('importing a module script failed');

    if (isChunkLoadError) {
      const RELOAD_FLAG = 'tnb_chunk_reload_attempted';
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCache = async () => {
    await clearAllLocalCache();
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] w-full flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl border border-rose-200 shadow-xl p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-800">
                {this.props.fallbackTitle || 'Đã xảy ra sự cố khi hiển thị giao diện'}
              </h3>
              <p className="text-xs text-slate-500">
                Hệ thống đã tự động bảo vệ giao diện tránh bị lỗi trắng trang. Bạn có thể tải lại hoặc xoá cache để khôi phục trạng thái.
              </p>
              {this.state.error && (
                <p className="text-[11px] font-mono text-rose-700 bg-rose-50 rounded-lg p-2 mt-2 text-left break-words max-h-24 overflow-y-auto">
                  {this.state.error.message || String(this.state.error)}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tải lại trang</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearCache}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                <span>Xoá Cache & Khôi phục</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
