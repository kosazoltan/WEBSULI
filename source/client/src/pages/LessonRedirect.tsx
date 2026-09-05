import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { AlertTriangle, Loader2 } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";

/**
 * /lesson/:lessonId — audit 2026-09-05 (A).
 *
 * The coupon HUD ("Vissza a leckéhez") and the Studio link by LESSON id, but the SPA
 * renders materials by html_files id at /preview/:id. This page resolves one to the
 * other and forwards; an unpublished or unknown lesson gets a child-readable message
 * instead of the NotFound page it used to hit.
 */
export default function LessonRedirect() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = useQuery<{ htmlFileId: string }>({
    queryKey: ["/api/lessons/material", params.id],
    queryFn: () => apiRequest("GET", `/api/lessons/${params.id}/material`),
    retry: false,
  });

  useEffect(() => {
    if (data?.htmlFileId) {
      const hash = window.location.hash;
      setLocation(`/preview/${data.htmlFileId}${hash}`, { replace: true });
    }
  }, [data, setLocation]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300 max-w-md">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Ez a lecke most nem érhető el. Kérj segítséget a tanárodtól vagy egy felnőttől.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      {isLoading ? "Lecke megnyitása…" : "Átirányítás…"}
    </div>
  );
}
