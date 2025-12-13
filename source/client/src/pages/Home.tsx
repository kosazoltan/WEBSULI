import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import UserFileList from "@/components/UserFileList";

interface HtmlFileApi {
  id: string;
  userId: string | null;
  title: string;
  content: string;
  description: string | null;
  classroom: number;
  contentType?: string;
  createdAt: string;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();

  const { data: files = [], isLoading } = useQuery<HtmlFileApi[]>({
    queryKey: ["/api/html-files"],
  });

  const handleViewFile = (file: HtmlFileApi) => {
    // PDF anyagok külön viewer oldalra mennek
    if (file.contentType === 'pdf') {
      setLocation(`/materials/pdf/${file.id}`);
    } else {
      setLocation(`/preview/${file.id}`);
    }
  };


  return (
    <div className="min-h-screen">
      <Header />

      {/* Normál felhasználói nézet - csak a fájlok listája */}
      <UserFileList
        files={files}
        isLoading={isLoading}
        onViewFile={handleViewFile}
        onToggleView={isAdmin ? () => setLocation("/admin") : undefined}
      />
    </div>
  );
}
