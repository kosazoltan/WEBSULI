import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import UserFileList from "@/components/UserFileList";
import CosmicBackground from "@/components/CosmicBackground";

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
    if (file.contentType === "pdf") {
      setLocation(`/materials/pdf/${file.id}`);
    } else {
      setLocation(`/preview/${file.id}`);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#0A0E27" }}>
      {/* Kopernikuszi naprendszer háttér - ELTÁVOLÍTVA, mert a HeroSection-ban van a háttérkép */}
      
      <Header />
      <main className="pt-16 relative z-10">
        <UserFileList
          files={files}
          isLoading={isLoading}
          onViewFile={handleViewFile}
          onToggleView={isAdmin ? () => setLocation("/admin") : undefined}
        />
      </main>
    </div>
  );
}
