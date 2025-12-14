import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface CodeViewerProps {
  title: string;
  materialId: string;
  onBack: () => void;
}

export default function CodeViewer({
  title,
  materialId,
  onBack,
}: CodeViewerProps) {

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-full mx-auto px-2 sm:px-4 tablet:px-6 xl:px-8 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Vissza
          </Button>
        </div>
      </div>

      {/* Responsive container - optimized for all screen sizes */}
      <div className="w-full mx-auto px-0 sm:px-2 tablet:px-4 xl:px-6 py-2 sm:py-4">
        <Card className="overflow-hidden h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] tablet:h-[calc(100vh-6rem)]">
          <iframe
            src={`/dev/${materialId}`}
            className="w-full h-full border-0"
            title={title}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
            allow="autoplay; microphone; clipboard-write"
            data-testid="iframe-preview"
            style={{
              minHeight: '400px', // Minimum height for very small screens
            }}
          />
        </Card>
      </div>
    </div>
  );
}
