import {StrictMode, Component, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthGuard } from './components/AuthGuard';

// Suppress ResizeObserver errors that Recharts throws, which triggers AI Studio's error overlay
window.addEventListener('error', (e) => {
  const errorText = String(e.message || "").toLowerCase();
  if (errorText.includes('resizeobserver') || 
      errorText.includes('script error') ||
      errorText === '') {
      
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

window.addEventListener('unhandledrejection', (e) => {
  const reasonText = String(e.reason?.message || e.reason || "").toLowerCase();
  if (reasonText.includes('resizeobserver') || 
      reasonText.includes('script error')) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("React Error caught by boundary:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-10 text-red-500 bg-red-100/10 font-mono whitespace-pre-wrap"><h1>Something went wrong.</h1><pre>{this.state.error?.message}</pre><pre className="mt-4 text-xs">{this.state.error?.stack}</pre></div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGuard>
        <App />
      </AuthGuard>
    </ErrorBoundary>
  </StrictMode>,
);
