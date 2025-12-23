import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getFingerprint } from "@/lib/fingerprintCache";

interface LikeButtonProps {
  materialId: string;
  className?: string;
  initialLikeStatus?: { liked: boolean; totalLikes: number };
}

interface LikeStatus {
  liked: boolean;
  totalLikes: number;
}

export default function LikeButton({ materialId, className, initialLikeStatus }: LikeButtonProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const { toast } = useToast();

  // Get fingerprint on mount (cached)
  useEffect(() => {
    getFingerprint().then(setFingerprint).catch(() => setFingerprint("anonymous"));
  }, []);

  // Check like status - only if not provided via batch
  const { data: likeStatus, isLoading } = useQuery<LikeStatus>({
    queryKey: ["/api/materials", materialId, "likes", fingerprint],
    enabled: !!fingerprint && !initialLikeStatus,
    initialData: initialLikeStatus,
  });

  // Use batch data if available, otherwise use query data
  const currentLikeStatus = initialLikeStatus || likeStatus;

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
      
      // Update batch cache if it exists
      const batchQueryKey = ["/api/materials/likes/batch"];
      queryClient.setQueriesData(
        { queryKey: batchQueryKey },
        (oldData: Record<string, { liked: boolean; totalLikes: number }> | undefined) => {
          if (oldData && typeof oldData === 'object') {
            return {
              ...oldData,
              [materialId]: data,
            };
          }
          return oldData;
        }
      );
      
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

  if (!fingerprint || (isLoading && !initialLikeStatus)) {
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

  const likeCount = currentLikeStatus?.totalLikes || 0;
  const isLiked = currentLikeStatus?.liked;

  return (
    <Button
      variant={isLiked ? "default" : "outline"}
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        likeMutation.mutate();
      }}
      disabled={likeMutation.isPending}
      aria-label={isLiked ? `Kedvelés visszavonása (${likeCount} kedvelés)` : `Kedvelés (${likeCount} kedvelés)`}
      aria-pressed={isLiked}
      className={`min-h-[44px] ${className}`}
      data-testid={`button-like-${materialId}`}
    >
      <Heart
        className={`w-4 h-4 mr-2 ${isLiked ? "fill-current" : ""}`}
      />
      <span className="text-sm">{likeCount}</span>
    </Button>
  );
}
