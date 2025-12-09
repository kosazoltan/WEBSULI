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
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2">
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

      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4">
        <Card className="overflow-hidden">
          <iframe
            src={`/dev/${materialId}`}
            className="w-full h-[700px] border-0"
            title={title}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
            allow="autoplay; microphone; clipboard-write"
            data-testid="iframe-preview"
          />
        </Card>
      </div>
    </div>
  );
}
