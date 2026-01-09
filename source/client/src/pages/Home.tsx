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
    <div 
      className="min-h-screen" 
      style={{ 
        backgroundColor: 'hsl(240 100% 9%)',
        backgroundImage: `
          radial-gradient(ellipse at 20% 10%, hsl(280 100% 70% / 0.18), transparent 50%),
          radial-gradient(ellipse at 80% 80%, hsl(340 100% 70% / 0.15), transparent 50%),
          radial-gradient(ellipse at 50% 50%, hsl(180 100% 60% / 0.10), transparent 60%),
          radial-gradient(ellipse at 10% 90%, hsl(45 100% 60% / 0.08), transparent 40%),
          hsl(240 100% 9%)
        `,
        backgroundAttachment: 'fixed',
        minHeight: '100vh',
        color: '#f9fafb',
      }}
    >
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
