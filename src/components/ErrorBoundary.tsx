import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Guitar Studio caught rendering error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-[#e0e0e0] flex items-center justify-center p-6">
          <div className="frosted-card p-8 rounded-3xl max-w-md w-full border border-red-500/30 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h2 className="text-xl font-bold font-mono text-white">
              SANDBOX RESTORED
            </h2>

            <p className="text-xs font-mono text-white/50 leading-relaxed">
              An unexpected audio or rendering state was intercepted. Click below to safely restore Guitar Studio.
            </p>

            {this.state.error && (
              <div className="p-3 bg-black/50 rounded-xl border border-white/10 text-left overflow-x-auto">
                <code className="text-[11px] font-mono text-red-300 block">
                  {this.state.error.message}
                </code>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="flex items-center justify-center space-x-2 w-full py-3 rounded-xl bg-[#a3ff12] text-black font-mono font-bold text-xs hover:bg-[#92e610] transition-colors shadow-[0_0_15px_rgba(163,255,18,0.3)]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RELOAD WORKSTATION</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
