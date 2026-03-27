import { useState, useMemo, useEffect, memo } from "react";
import { Search, FileCode, ShieldCheck, BookOpen, ArrowRight, Gamepad2 } from "lucide-react";
import { Link } from "wouter";
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
      <div className="min-h-screen relative">
        <div className="container py-16 text-center relative z-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted/20 rounded mx-auto" />
            <div className="h-4 w-32 bg-muted/20 rounded mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="min-h-screen relative">
        <div className="container py-12 relative z-10">
          {onToggleView && (
            <div className="flex justify-end mb-6">
              <Button
                onClick={onToggleView}
                data-testid="button-toggle-admin-view"
                className="h-8 px-3 text-xs font-semibold gap-1 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white border border-rose-200/25 rounded-full shadow-lg"
              >
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
                <Link href="/games">
                  <Button variant="outline" className="mt-4 gap-2" data-testid="link-empty-games">
                    <Gamepad2 className="w-4 h-4" />
                    Játékok
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="container py-3 relative z-10">
        {/* Hero Section */}
        <HeroSection
          totalFiles={totalFiles}
          totalClassrooms={totalClassrooms}
          showEmailSubscribe={true}
        />

        {/* Classroom Filter */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5 justify-center items-center">
            <Button
              variant={selectedClassroom === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedClassroom(null)}
              data-testid="button-filter-all"
              className={`h-7 px-3 text-xs font-semibold ${
                selectedClassroom === null
                  ? "bg-gradient-to-r from-[#FB923C] to-[#EAB308] text-white border-0 shadow-md"
                  : "bg-white/20 hover:bg-white/30 text-white border-white/40 backdrop-blur-md"
              }`}
            >
              Mind
            </Button>
            {CLASSROOM_VALUES.map((classroom) => {
              const hasFiles = availableClassrooms.includes(classroom);
              return (
                <Badge
                  key={classroom}
                  variant={selectedClassroom === classroom ? "default" : "outline"}
                  className={`cursor-pointer text-xs py-0.5 px-2 font-semibold backdrop-blur-sm ${
                    selectedClassroom === classroom
                      ? "bg-gradient-to-r from-[#FB923C] to-[#EAB308] text-white border-0 shadow-md"
                      : "bg-white/20 hover:bg-white/30 text-white border-white/40 backdrop-blur-md"
                  } ${
                    !hasFiles ? "opacity-50 cursor-not-allowed" : ""
                  } transition-all duration-200`}
                  onClick={() => (hasFiles ? setSelectedClassroom(classroom) : null)}
                  data-testid={`button-filter-classroom-${classroom}`}
                >
                  {getClassroomLabel(classroom, true)}
                  {!hasFiles && " (0)"}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="max-w-md mx-auto mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70 z-10" />
            <Input
              placeholder="Keresés..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-white/20 backdrop-blur-md border-white/40 text-white placeholder:text-white/60 focus:bg-white/30 focus:border-white/60 focus-visible:ring-white/50"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Files Grid - Bento Style with Framer Motion */}
        {filteredFiles.length > 0 ? (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 auto-rows-fr"
            data-testid="list-files"
            id="content-start"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredFiles.map((file, index) => {
              const Icon = getFileIcon(file.title, file.description || undefined);
              const classroom = file.classroom ?? 1;

              const gridClasses = "";
              
              // Korcsoport-specifikus téma
              let themeClasses = "";
              let badgeGradient = "from-orange-600 to-amber-600";
              let iconBg = "from-orange-600/30 to-amber-600/30";
              let iconBorder = "border-orange-500/30";
              
              // Új színpaletta: elsődleges és másodlagos gradient-ek
              if (classroom >= 1 && classroom <= 4) {
                // Kid theme - vibráló gradient-ek
                themeClasses = "rounded-3xl";
                badgeGradient = "from-[#8B5CF6] to-[#EC4899]";
                iconBg = "from-[#8B5CF6]/20 to-[#EC4899]/20";
                iconBorder = "border-[#8B5CF6]/40";
              } else if (classroom >= 5 && classroom <= 8) {
                // Teen theme - elsődleges gradient
                themeClasses = "rounded-2xl";
                badgeGradient = "from-[#8B5CF6] via-[#EC4899] to-[#F97316]";
                iconBg = "from-[#8B5CF6]/20 via-[#EC4899]/20 to-[#F97316]/20";
                iconBorder = "border-[#EC4899]/40";
              } else {
                // Senior theme - másodlagos gradient
                themeClasses = "rounded-xl";
                badgeGradient = "from-[#F97316] to-[#EAB308]";
                iconBg = "from-[#F97316]/20 to-[#EAB308]/20";
                iconBorder = "border-[#F97316]/40";
              }

              return (
                <motion.div
                  key={file.id}
                  variants={cardVariants}
                  whileHover="hover"
                  className={gridClasses}
                >
                  <motion.div
                    whileHover={{ scale: 1.03, y: -5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Card
                      className={`group cursor-pointer glass-card h-full ${themeClasses}`}
                      onClick={() => onViewFile(file)}
                      data-testid={`link-file-${file.id}`}
                    >
                    <CardContent className="p-2.5 flex flex-col h-full">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-1.5">
                        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${iconBg} backdrop-blur-md border ${iconBorder} shadow-md transition-all group-hover:scale-110 relative z-10`}>
                          <Icon className="w-4 h-4 text-white drop-shadow-lg" />
                        </div>
                        <Badge
                          className="text-[9px] font-bold bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-sm border-0 px-1.5 py-0 h-4 group-hover:from-gray-900 group-hover:to-black transition-all duration-300"
                        >
                          {getClassroomLabel(classroom, true)}
                        </Badge>
                      </div>

                      {/* Content */}
                      <div className="flex-1 mb-1.5">
                        <h3 className="text-xs font-bold text-orange-500 mb-0.5 line-clamp-2 group-hover:text-black transition-all duration-300 drop-shadow-lg leading-tight">
                          {file.title}
                        </h3>
                        <p className="text-[10px] text-orange-400 font-medium line-clamp-2 group-hover:text-black transition-all duration-300 leading-tight">
                          {file.description || "Kattints a megtekintéshez"}
                        </p>
                      </div>

                      {/* Footer */}
                      <div className={`flex items-center justify-between pt-1.5 border-t ${iconBorder}`}>
                        <LikeButton
                          materialId={file.id}
                          initialLikeStatus={batchLikesData?.[file.id]}
                        />
                        <motion.div
                          className={`w-6 h-6 rounded-full bg-gradient-to-r ${badgeGradient} flex items-center justify-center transition-all`}
                          whileHover={{ scale: 1.15, rotate: 5 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <ArrowRight className="w-3 h-3 text-white" />
                        </motion.div>
                      </div>
                    </CardContent>
                    </Card>
                  </motion.div>
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
