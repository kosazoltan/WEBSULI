import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  isPushSupported,
  getNotificationPermission,
  setupPushNotifications,
  teardownPushNotifications,
  getCurrentSubscription
} from "@/lib/pushNotifications";

export default function PushNotificationToggle() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const checkSupport = async () => {
      const supported = isPushSupported();
      setIsSupported(supported);

      if (supported) {
        const subscription = await getCurrentSubscription();
        setIsSubscribed(!!subscription);
      }
    };

    checkSupport();
  }, []);

  const handleToggle = async () => {
    if (!isSupported) {
      toast({
        title: "Nem támogatott",
        description: "A böngésző nem támogatja a push értesítéseket.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      if (isSubscribed) {
        await teardownPushNotifications();
        setIsSubscribed(false);
        toast({
          title: "Értesítések kikapcsolva",
          description: "Többé nem kapsz push értesítéseket."
        });
      } else {
        const permission = getNotificationPermission();
        
        if (permission === 'denied') {
          toast({
            title: "Értesítések letiltva",
            description: "Kérlek, engedélyezd az értesítéseket a böngésző beállításaiban.",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        // Fetch VAPID public key from server
        const response = await fetch('/api/push/vapid-public-key');
        if (!response.ok) {
          toast({
            title: "Konfigurációs hiba",
            description: "A push értesítések nincsenek megfelelően konfigurálva.",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        const { publicKey } = await response.json();
        
        if (!publicKey) {
          console.error('VAPID public key not found');
          toast({
            title: "Konfigurációs hiba",
            description: "A push értesítések nincsenek megfelelően konfigurálva.",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        await setupPushNotifications(publicKey);
        setIsSubscribed(true);
        toast({
          title: "Értesítések bekapcsolva",
          description: "Push értesítéseket fogsz kapni új anyagokról."
        });
      }
    } catch (error) {
      console.error('Push notification error:', error);
      toast({
        title: "Hiba történt",
        description: error instanceof Error ? error.message : "Nem sikerült váltani az értesítéseket.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={isLoading}
      data-testid="button-push-toggle"
      title={isSubscribed ? "Push értesítések kikapcsolása" : "Push értesítések bekapcsolása"}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : isSubscribed ? (
        <Bell className="h-5 w-5 text-primary" />
      ) : (
        <BellOff className="h-5 w-5" />
      )}
    </Button>
  );
}
