import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Settings, 
  Save, 
  X, 
  ChevronDown, 
  ChevronUp,
  Loader2,
  Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SystemPromptEditorProps {
  promptId: string;
  title: string;
  description?: string;
  defaultPrompt: string;
  helpText?: string;
  onPromptChange?: (prompt: string) => void;
}

export default function SystemPromptEditor({
  promptId,
  title,
  description,
  defaultPrompt,
  helpText,
  onPromptChange
}: SystemPromptEditorProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load existing prompt from database on mount
  useEffect(() => {
    loadPrompt();
  }, [promptId]);

  const loadPrompt = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/system-prompts/${promptId}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setPrompt(data.prompt);
        if (onPromptChange) {
          onPromptChange(data.prompt);
        }
      } else if (response.status === 404) {
        // Prompt doesn't exist yet, use default
        setPrompt(defaultPrompt);
        if (onPromptChange) {
          onPromptChange(defaultPrompt);
        }
      }
    } catch (error) {
      console.error('Failed to load system prompt:', error);
      setPrompt(defaultPrompt);
      if (onPromptChange) {
        onPromptChange(defaultPrompt);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptChange = (value: string) => {
    setPrompt(value);
    setHasUnsavedChanges(true);
    if (onPromptChange) {
      onPromptChange(value);
    }
  };

  const handleSave = async () => {
    if (!hasUnsavedChanges) return;
    
    setIsSaving(true);
    try {
      // Try to update first
      let response = await fetch(`/api/admin/system-prompts/${promptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          name: title,
          description: description || ''
        })
      });
      
      // If not found, create new
      if (response.status === 404) {
        response = await apiRequest('POST', '/api/admin/system-prompts', {
          id: promptId,
          name: title,
          prompt,
          description: description || '',
          isActive: true
        });
      }
      
      if (response.ok) {
        setHasUnsavedChanges(false);
        toast({
          title: "✅ Mentve",
          description: "A system prompt sikeresen frissítve.",
        });
      } else {
        throw new Error('Failed to save prompt');
      }
    } catch (error) {
      console.error('Failed to save system prompt:', error);
      toast({
        title: "❌ Hiba",
        description: "Nem sikerült menteni a system promptot.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(defaultPrompt);
    setHasUnsavedChanges(true);
    if (onPromptChange) {
      onPromptChange(defaultPrompt);
    }
    toast({
      title: "🔄 Visszaállítva",
      description: "Az alapértelmezett prompt visszaállítva.",
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                {description && (
                  <CardDescription className="text-sm mt-1">
                    {description}
                  </CardDescription>
                )}
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`button-toggle-prompt-${promptId}`}
              >
                {isOpen ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-1" />
                    Bezár
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-1" />
                    Paraméterezés
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {helpText && (
              <div className="flex gap-2 p-3 bg-primary/5 rounded-lg text-sm">
                <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-muted-foreground">{helpText}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`prompt-${promptId}`}>
                System Prompt
                {hasUnsavedChanges && (
                  <span className="text-orange-500 ml-2">● Nem mentett változások</span>
                )}
              </Label>
              <Textarea
                id={`prompt-${promptId}`}
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="Add meg a system promptot..."
                className="min-h-[200px] font-mono text-sm"
                disabled={isLoading}
                data-testid={`textarea-prompt-${promptId}`}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isLoading || isSaving}
                data-testid={`button-reset-prompt-${promptId}`}
              >
                <X className="w-4 h-4 mr-1" />
                Alapértelmezett
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isLoading || isSaving || !hasUnsavedChanges}
                data-testid={`button-save-prompt-${promptId}`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Mentés...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    Mentés
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
