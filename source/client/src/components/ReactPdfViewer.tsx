import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

// Import styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

interface ReactPdfViewerProps {
  pdfUrl: string;
  title?: string;
  onClose?: () => void;
}

export default function ReactPdfViewer({ pdfUrl, title }: ReactPdfViewerProps) {
  // Create default layout plugin with all features
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnails
      defaultTabs[1], // Bookmarks
      defaultTabs[2], // Attachments
    ],
    toolbarPlugin: {
      fullScreenPlugin: {
        // Customize fullscreen if needed
      },
      searchPlugin: {
        // Customize search if needed
      },
    },
  });

  // Use local worker (served from public folder)
  const workerUrl = `/pdfjs/pdf.worker.min.js`;

  return (
    <div 
      className="h-full w-full bg-background"
      style={{ 
        // Responsive height: adapts to screen size
        // Mobile: full viewport minus header
        // Tablet/Fold: optimized for larger screens
        // Desktop: full available space
        height: '100%',
        minHeight: '400px', // Minimum for very small screens
      }}
      data-testid="react-pdf-viewer-container"
    >
      <Worker workerUrl={workerUrl}>
        <Viewer 
          fileUrl={pdfUrl} 
          plugins={[defaultLayoutPluginInstance]}
          theme="auto"
          transformGetDocumentParams={(options) => ({
            ...options,
            standardFontDataUrl: '/pdfjs/standard_fonts/',
            useSystemFonts: false,
          })}
        />
      </Worker>
    </div>
  );
}
