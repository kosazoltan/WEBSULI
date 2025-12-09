import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

interface LikeButtonProps {
  materialId: string;
  className?: string;
}

interface LikeStatus {
  liked: boolean;
  totalLikes: number;
}

export default function LikeButton({ materialId, className }: LikeButtonProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const { toast } = useToast();

  // Get fingerprint on mount
  useEffect(() => {
    const getFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        setFingerprint(result.visitorId);
      } catch (error) {
        console.error("Failed to get fingerprint:", error);
        setFingerprint("anonymous");
      }
    };
    getFingerprint();
  }, []);

  // Check like status
  const { data: likeStatus, isLoading } = useQuery<LikeStatus>({
    queryKey: ["/api/materials", materialId, "likes", fingerprint],
    enabled: !!fingerprint,
  });

  // Toggle like mutation
  const likeMutation = useMutation({
    mutationFn: async (): Promise<LikeStatus> => {
      if (!fingerprint) throw new Error("No fingerprint available");
      
      // Backend now has toggle logic - always POST
      const result = await apiRequest<LikeStatus>("POST", `/api/materials/${materialId}/likes`, { fingerprint });
      return result;
    },
    onSuccess: (data: LikeStatus) => {
      // Immediately update cache with response data
      queryClient.setQueryData(["/api/materials", materialId, "likes", fingerprint], data);
      
      // Invalidate material list to refresh like counts everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      
      toast({
        title: data.liked ? "Kedvelve!" : "Kedvelés törölve",
        description: data.liked ? "Köszönjük a visszajelzést!" : "Eltávolítottad a kedvelést."
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: "destructive",
        title: "Hiba történt",
        description: error instanceof Error ? error.message : "Nem sikerült a kedvelés."
      });
    }
  });

  if (!fingerprint || isLoading) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className={className}
        data-testid={`button-like-loading-${materialId}`}
      >
        <Heart className="w-4 h-4 mr-2" />
        <span className="text-sm">-</span>
      </Button>
    );
  }

  return (
    <Button
      variant={likeStatus?.liked ? "default" : "outline"}
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        likeMutation.mutate();
      }}
      disabled={likeMutation.isPending}
      className={className}
      data-testid={`button-like-${materialId}`}
    >
      <Heart 
        className={`w-4 h-4 mr-2 ${likeStatus?.liked ? "fill-current" : ""}`} 
      />
      <span className="text-sm">{likeStatus?.totalLikes || 0}</span>
    </Button>
  );
}
