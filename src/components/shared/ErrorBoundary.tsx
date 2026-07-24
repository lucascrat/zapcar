import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-app-bg text-white p-6 text-center">
                    <span className="material-icons text-red-500 text-6xl mb-4">error_outline</span>
                    <h1 className="text-2xl font-bold mb-2">Ops! Algo deu errado.</h1>
                    <p className="text-gray-400 mb-6 max-w-md">
                        Ocorreu um erro inesperado. Tente recarregar o aplicativo.
                    </p>
                    <div className="p-4 bg-gray-800 rounded-lg text-left text-xs font-mono text-red-300 w-full max-w-md overflow-auto mb-6 max-h-40">
                        {this.state.error?.toString()}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-whatsapp-green text-white rounded-full font-bold shadow-lg active:transform active:scale-95 transition-all"
                    >
                        Recarregar Aplicativo
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
