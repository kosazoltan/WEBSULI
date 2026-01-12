import { useState, useMemo, useEffect, memo } from "react";
import { Search, FileCode, ShieldCheck, BookOpen, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFileIcon } from "@/lib/iconUtils";
import LikeButton from "@/components/LikeButton";
import HeroSection from "@/components/HeroSection";
import { CLASSROOM_VALUES, getClassroomLabel } from "@shared/classrooms";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { motion } from "framer-motion";

interface HtmlFileApi {
  id: string;
  userId: string | null;
  title: string;
  content: string;
  description: string | null;
  classroom: number;
  createdAt: string;
}

interface UserFileListProps {
  files: HtmlFileApi[];
  isLoading: boolean;
  onViewFile: (file: HtmlFileApi) => void;
  onToggleView?: () => void;
}

// Framer Motion animációk
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      damping: 15,
      stiffness: 200,
    },
  },
  hover: {
    scale: 1.03,
    y: -5,
    transition: {
      type: "spring",
      stiffness: 300,
    },
  },
};

function UserFileList({ files, isLoading, onViewFile, onToggleView }: UserFileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState<number | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  // Load fingerprint once on mount
  useEffect(() => {
    getFingerprint().then(setFingerprint).catch(() => setFingerprint("anonymous"));
  }, []);

  // Filter by search query AND selected classroom
  const filteredFiles = useMemo(() => {
    return files
      .filter((file) => {
        const matchesSearch =
          file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (file.description || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesClassroom = selectedClassroom === null || file.classroom === selectedClassroom;
        return matchesSearch && matchesClassroom;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [files, searchQuery, selectedClassroom]);

  // Batch fetch likes for all visible files
  const materialIds = useMemo(() => filteredFiles.map((f) => f.id), [filteredFiles]);

  const { data: batchLikesData } = useQuery<Record<string, { liked: boolean; totalLikes: number }>>({
    queryKey: ["/api/materials/likes/batch", materialIds.sort().join(","), fingerprint],
    queryFn: async () => {
      if (!fingerprint || materialIds.length === 0) return {};
      return await apiRequest("POST", "/api/materials/likes/batch", {
        materialIds,
        fingerprint,
      });
    },
    enabled: !!fingerprint && materialIds.length > 0,
    staleTime: 30000,
  });

  // Stats
  const totalFiles = files.length;
  const allClassrooms = new Set(files.map((f) => f.classroom ?? 1));
  const totalClassrooms = allClassrooms.size;
  const availableClassrooms = Array.from(allClassrooms).sort((a, b) => a - b);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-16 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded mx-auto" />
            <div className="h-4 w-32 bg-muted rounded mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-12">
          {onToggleView && (
            <div className="flex justify-end mb-6">
              <Button onClick={onToggleView} variant="outline" data-testid="button-toggle-admin-view">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Admin nézet
              </Button>
            </div>
          )}

          <div className="text-center py-16">
            <Card className="max-w-md mx-auto">
              <CardContent className="pt-12 pb-12">
                <FileCode className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Még nincsenek anyagok
                </h3>
                <p className="text-muted-foreground">
                  Hamarosan érkeznek az első tananyagok!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6">
        {/* Admin Toggle */}
        {onToggleView && (
          <div className="flex justify-end mb-4">
            <Button onClick={onToggleView} variant="outline" data-testid="button-toggle-admin-view">
              <ShieldCheck className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Admin nézet</span>
              <span className="sm:hidden">Admin</span>
            </Button>
          </div>
        )}

        {/* Hero Section */}
        <HeroSection
          totalFiles={totalFiles}
          totalClassrooms={totalClassrooms}
          showEmailSubscribe={true}
        />

        {/* Classroom Filter */}
        <div className="mb-6">
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Válassz osztályt:
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedClassroom === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedClassroom(null)}
              data-testid="button-filter-all"
            >
              Minden osztály
            </Button>
            {CLASSROOM_VALUES.map((classroom) => {
              const hasFiles = availableClassrooms.includes(classroom);
              return (
                <Badge
                  key={classroom}
                  variant={selectedClassroom === classroom ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1 px-3 ${
                    !hasFiles ? "opacity-50 cursor-not-allowed" : "hover:bg-primary/10"
                  }`}
                  onClick={() => (hasFiles ? setSelectedClassroom(classroom) : null)}
                  data-testid={`button-filter-classroom-${classroom}`}
                >
                  {getClassroomLabel(classroom, false)}
                  {!hasFiles && " (0)"}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="max-w-xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Keresés tananyag után..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Files Grid - Bento Style with Framer Motion */}
        {filteredFiles.length > 0 ? (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr"
            data-testid="list-files"
            id="content-start"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredFiles.map((file, index) => {
              const Icon = getFileIcon(file.title, file.description || undefined);
              const classroom = file.classroom ?? 1;
              
              // Bento Grid: nagyobb kártyák minden 5. elemnél
              const isLarge = index % 5 === 0;
              const gridClasses = isLarge 
                ? "sm:col-span-2 lg:col-span-2" 
                : "";
              
              // Korcsoport-specifikus téma
              let themeClasses = "";
              let badgeGradient = "from-orange-600 to-amber-600";
              let iconBg = "from-orange-600/30 to-amber-600/30";
              let iconBorder = "border-orange-500/30";
              
              if (classroom >= 1 && classroom <= 4) {
                // Kid theme - korall-türkiz
                themeClasses = "rounded-3xl";
                badgeGradient = "from-[#FF6B6B] to-[#4ECDC4]";
                iconBg = "from-[#FF6B6B]/30 to-[#4ECDC4]/30";
                iconBorder = "border-[#FF6B6B]/30";
              } else if (classroom >= 5 && classroom <= 8) {
                // Teen theme - lila-türkiz
                themeClasses = "rounded-2xl";
                badgeGradient = "from-[#8B5CF6] to-[#06B6D4]";
                iconBg = "from-[#8B5CF6]/30 to-[#06B6D4]/30";
                iconBorder = "border-[#8B5CF6]/30";
              } else {
                // Senior theme - kék-indigo
                themeClasses = "rounded-xl";
                badgeGradient = "from-[#3B82F6] to-[#8B5CF6]";
                iconBg = "from-[#3B82F6]/30 to-[#8B5CF6]/30";
                iconBorder = "border-[#3B82F6]/30";
              }

              return (
                <motion.div
                  key={file.id}
                  variants={cardVariants}
                  whileHover="hover"
                  className={gridClasses}
                >
                  <Card
                    className={`group cursor-pointer glass-card h-full ${themeClasses}`}
                    onClick={() => onViewFile(file)}
                    data-testid={`link-file-${file.id}`}
                  >
                    <CardContent className="p-5 flex flex-col h-full">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${iconBg} backdrop-blur-sm border ${iconBorder} shadow-lg`}>
                          <Icon className="w-6 h-6 text-white drop-shadow-lg" />
                        </div>
                        <Badge 
                          className={`text-xs font-semibold bg-gradient-to-r ${badgeGradient} text-white shadow-md`}
                        >
                          {getClassroomLabel(classroom, true)}
                        </Badge>
                      </div>

                      {/* Content */}
                      <div className="flex-1 mb-4">
                        <h3 className={`text-lg font-bold text-foreground mb-2 line-clamp-2 group-hover:bg-gradient-to-r ${badgeGradient} group-hover:bg-clip-text group-hover:text-transparent transition-all ${classroom >= 1 && classroom <= 4 ? 'font-kid-display' : classroom >= 5 && classroom <= 8 ? 'font-teen-display' : 'font-senior-display'}`}>
                          {file.title}
                        </h3>
                        <p className={`text-sm text-muted-foreground line-clamp-3 ${classroom >= 1 && classroom <= 4 ? 'font-kid-body' : classroom >= 5 && classroom <= 8 ? 'font-teen-body' : 'font-senior-body'}`}>
                          {file.description || "Kattints a megtekintéshez"}
                        </p>
                      </div>

                      {/* Footer */}
                      <div className={`flex items-center justify-between pt-4 border-t ${iconBorder}`}>
                        <LikeButton
                          materialId={file.id}
                          initialLikeStatus={batchLikesData?.[file.id]}
                        />
                        <motion.div
                          className={`w-10 h-10 rounded-full bg-gradient-to-r ${badgeGradient} flex items-center justify-center transition-all`}
                          whileHover={{ scale: 1.15, rotate: 5 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <ArrowRight className="w-5 h-5 text-white" />
                        </motion.div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <div className="text-center py-16">
            <Card className="max-w-md mx-auto glass-card">
              <CardContent className="pt-12 pb-12">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  {selectedClassroom !== null ? (
                    <>
                      Nincs találat a(z) <strong>{selectedClassroom}. osztályban</strong>
                      {searchQuery && (
                        <>
                          {" "}a keresésre: <strong>"{searchQuery}"</strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Nincs találat a keresésre: <strong>"{searchQuery}"</strong>
                    </>
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedClassroom(null);
                  }}
                  data-testid="button-clear-filters"
                >
                  Szűrők törlése
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(UserFileList);
