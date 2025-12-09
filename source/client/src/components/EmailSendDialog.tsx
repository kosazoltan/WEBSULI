import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Send, Loader2, Mail, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface EmailSendDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  classroom?: number;
}

interface ExtraEmail {
  id: string;
  email: string;
  classroom: number;
  isActive: boolean;
}

// Simple email validation regex
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export default function EmailSendDialog({
  isOpen,
  onClose,
  fileId,
  fileName,
  classroom,
}: EmailSendDialogProps) {
  const { toast } = useToast();
  const [customEmail, setCustomEmail] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  // Fetch suggested emails based on classroom
  const { data: allExtraEmails, isLoading: isLoadingEmails } = useQuery<ExtraEmail[]>({
    queryKey: ["/api/admin/extra-emails"],
    enabled: isOpen,
  });

  // Filter emails by classroom
  const suggestedEmails = allExtraEmails?.filter(
    (email) => email.isActive && email.classroom === classroom
  ) || [];

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedEmails(new Set());
      setCustomEmail("");
    }
  }, [isOpen]);

  const toggleEmail = (email: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedEmails(newSelected);
  };

  const handleSend = async () => {
    const emailsToSend = Array.from(selectedEmails);
    
    // Add custom email if provided and valid
    const trimmedCustom = customEmail.trim();
    if (trimmedCustom && isValidEmail(trimmedCustom)) {
      // Deduplicate: only add if not already selected
      if (!emailsToSend.includes(trimmedCustom)) {
        emailsToSend.push(trimmedCustom);
      }
    } else if (trimmedCustom && !isValidEmail(trimmedCustom)) {
      toast({
        title: "Hiba",
        description: "Kérjük adjon meg egy érvényes email formátumot (példa@domain.hu)!",
        variant: "destructive",
      });
      return;
    }

    if (emailsToSend.length === 0) {
      toast({
        title: "Hiba",
        description: "Kérjük válasszon ki legalább egy email címet vagy adjon meg egyet!",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Send to each email
      for (const email of emailsToSend) {
        try {
          await apiRequest("POST", `/api/html-files/${fileId}/send-email`, { email });
          successCount++;
        } catch (error) {
          console.error('Failed to send email:', { email, error });
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Sikeres küldés",
          description: `Email értesítés elküldve ${successCount} címre${failCount > 0 ? ` (${failCount} sikertelen)` : ''}`,
        });
      }
      
      if (failCount === emailsToSend.length) {
        toast({
          title: "Hiba történt",
          description: "Egyik email sem lett elküldve",
          variant: "destructive",
        });
      }

      if (successCount > 0) {
        setCustomEmail("");
        setSelectedEmails(new Set());
        onClose();
      }
    } catch (error: any) {
      toast({
        title: "Hiba történt",
        description: error.message || "Az email küldése sikertelen",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending) {
      setCustomEmail("");
      setSelectedEmails(new Set());
      onClose();
    }
  };

  // Calculate total selected with deduplication
  const trimmedCustom = customEmail.trim();
  const customEmailValid = trimmedCustom && isValidEmail(trimmedCustom);
  const customEmailIsDuplicate = customEmailValid && selectedEmails.has(trimmedCustom);
  const totalSelected = selectedEmails.size + (customEmailValid && !customEmailIsDuplicate ? 1 : 0);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Email értesítés küldése</DialogTitle>
          <DialogDescription>
            Küldjön értesítést erről a fájlról: {fileName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Suggested emails based on classroom */}
          {classroom && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold">
                  {classroom}. osztályhoz rendelt email címek
                </Label>
                <Badge variant="secondary" className="text-xs">
                  {suggestedEmails.length} cím
                </Badge>
              </div>
              
              {isLoadingEmails ? (
                <div className="text-sm text-muted-foreground">Betöltés...</div>
              ) : suggestedEmails.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {suggestedEmails.map((emailObj) => (
                    <div
                      key={emailObj.id}
                      className="flex items-center space-x-2 hover-elevate p-2 rounded transition-colors"
                    >
                      <Checkbox
                        id={`email-${emailObj.id}`}
                        checked={selectedEmails.has(emailObj.email)}
                        onCheckedChange={() => toggleEmail(emailObj.email)}
                        disabled={isSending}
                        data-testid={`checkbox-email-${emailObj.id}`}
                      />
                      <label
                        htmlFor={`email-${emailObj.id}`}
                        className="flex items-center gap-2 flex-1 text-sm cursor-pointer"
                      >
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {emailObj.email}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground border rounded-md p-4 text-center">
                  Nincs {classroom}. osztályhoz rendelt email cím.
                  <br />
                  Adjon hozzá email címeket az "Email címek" tab-on.
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Custom email input */}
          <div className="space-y-2">
            <Label htmlFor="custom-email" className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Egyedi email cím hozzáadása
            </Label>
            <Input
              id="custom-email"
              type="email"
              placeholder="pelda@email.com"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              disabled={isSending}
              data-testid="input-custom-email"
            />
            <p className="text-xs text-muted-foreground">
              Az email cím automatikusan hozzáadásra kerül az adatbázishoz{classroom ? ` és a jövőbeni ${classroom}. osztályos feltöltésekről értesítést kap` : ''}.
            </p>
          </div>

          {/* Summary */}
          {totalSelected > 0 && (
            <div className="bg-muted/50 rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">Összesen {totalSelected} címzett:</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(selectedEmails).map((email) => (
                  <Badge key={email} variant="secondary" className="text-xs">
                    {email}
                  </Badge>
                ))}
                {customEmailValid && !customEmailIsDuplicate && (
                  <Badge variant="secondary" className="text-xs">
                    {trimmedCustom}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSending}
            data-testid="button-cancel-email"
          >
            Mégse
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || totalSelected === 0}
            data-testid="button-send-email-confirm"
          >
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Küldés...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Küldés ({totalSelected})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
