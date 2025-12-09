import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Share2, Copy, Check, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { HtmlFile } from "@shared/schema";
import { useConfig } from "@/lib/useConfig";
import { queryClient } from "@/lib/queryClient";

export default function Preview() {
  const [, params] = useRoute("/preview/:id");
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Get correct base URL from backend (REPLIT_DEV_DOMAIN in dev, CUSTOM_DOMAIN in prod)
  const { baseUrl, isLoading: configLoading } = useConfig();
  
  // Fetch full material data (including content for inline rendering)
  const { data: material, isLoading: materialLoading } = useQuery<HtmlFile>({
    queryKey: [`/api/html-files/${params?.id}`],
    enabled: !!params?.id,
  });
  
  // Full URL for sharing/copying (absolute URL with baseUrl)
  const fullUrl = `${baseUrl}/preview/${params?.id}`;
  
  // Combined loading state
  const isLoading = configLoading || materialLoading;
  
  // Determine content type
  const isPdf = material?.contentType === 'pdf';
  
  // Use relative URL for iframe (same-origin, no CORS issues)
  const renderUrl = `/dev/${params?.id}`;
  
  const handleReloadIframe = () => {
    if (iframeRef.current) {
      // Force reload iframe by changing src to empty and back
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = 'about:blank';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
      }, 50);
    }
    
    toast({
      title: "Újratöltés...",
      description: "Az anyag újratöltődik.",
    });
  };

  const handleCopyUrl = async () => {
    try {
      // Cross-browser clipboard support: Safari requires user gesture
      // Try modern Clipboard API first, fallback to older methods
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        // Fallback for older Safari/iOS browsers
        const textArea = document.createElement('textarea');
        textArea.value = fullUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          textArea.remove();
        } catch (err) {
          textArea.remove();
          throw new Error('Clipboard not supported');
        }
      }
      
      setCopied(true);
      toast({
        title: "URL másolva!",
        description: "Az anyag linkje a vágólapra került.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Safari-specific: Try native share as fallback
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Anyagok Profiknak',
            url: fullUrl,
          });
          toast({
            title: "Megosztva!",
            description: "Az anyag linkje megosztva.",
          });
          return;
        } catch (shareError) {
          // User cancelled share dialog
        }
      }
      
      toast({
        title: "Hiba",
        description: "Nem sikerült másolni az URL-t. Kérlek, másold ki manuálisan.",
        variant: "destructive",
      });
    }
  };

  if (!params?.id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Fájl nem található</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-0 left-0 right-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Vissza
          </Button>
          
          {/* URL Display + Action Buttons */}
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-xl">
            <div className="flex-1 bg-muted/50 px-3 py-1.5 rounded-md text-xs font-mono text-muted-foreground truncate border">
              {fullUrl}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReloadIframe}
              data-testid="button-reload-iframe"
              className="shrink-0"
              title="Anyag újratöltése"
            >
              <RotateCw className="w-3.5 h-3.5 mr-1.5" />
              Újratöltés
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`${window.location.origin}${renderUrl}`, '_blank')}
              data-testid="button-open-new-tab"
              className="shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Új tab
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyUrl}
              data-testid="button-copy-url"
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Másolva
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Másol
                </>
              )}
            </Button>
          </div>
          
          {/* Mobile: Only Share icon */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyUrl}
            className="sm:hidden"
            data-testid="button-share-mobile"
          >
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      <div className="pt-14 h-[calc(100vh-3.5rem)]">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center py-20">
            <p className="text-muted-foreground">Betöltés...</p>
          </div>
        ) : (
          // Unified iframe rendering for both HTML and PDF
          // Sandbox: allow-scripts (JS runs), allow-forms (forms work), allow-same-origin (Web APIs)
          <iframe
            ref={iframeRef}
            src={renderUrl}
            className="w-full h-full border-0"
            title={isPdf ? 'PDF Preview' : 'HTML Preview'}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
            allow="autoplay; fullscreen; clipboard-write; microphone"
            data-testid="iframe-preview"
          />
        )}
      </div>
    </div>
  );
}
