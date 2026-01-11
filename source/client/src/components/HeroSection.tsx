import { memo } from "react";
import { ChevronDown, BookOpen, GraduationCap, FileText } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";
import { MIN_CLASSROOM, MAX_CLASSROOM } from "@shared/classrooms";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

function HeroSection({
  totalFiles = 0,
  totalClassrooms = 0,
  showEmailSubscribe = true,
}: HeroSectionProps) {
  const scrollToContent = () => {
    const content = document.getElementById("content-start");
    if (content) {
      content.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="relative text-center py-12 sm:py-16 px-4 mb-8 rounded-xl bg-gradient-to-b from-primary/5 to-transparent">
      {/* Main content */}
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
          Üdvözöl a{" "}
          <span className="text-primary">WebSuli</span>!
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Interaktív tananyagok általános és középiskolásoknak.
          Böngéssz osztályok szerint, és találd meg a neked való anyagokat!
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Button
            size="lg"
            onClick={scrollToContent}
            className="gap-2"
          >
            Böngészés
            <ChevronDown className="w-4 h-4" />
          </Button>

          {showEmailSubscribe && (
            <EmailSubscribeDialog />
          )}
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-8 sm:gap-12 pt-6 border-t border-border">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-primary" />
              <span className="text-2xl sm:text-3xl font-bold text-foreground">
                {totalFiles}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Tananyag</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <GraduationCap className="w-5 h-5 text-primary" />
              <span className="text-2xl sm:text-3xl font-bold text-foreground">
                {totalClassrooms}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Osztály</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-primary" />
              <span className="text-2xl sm:text-3xl font-bold text-foreground">
                {MIN_CLASSROOM === 0 ? "1" : MIN_CLASSROOM}-{MAX_CLASSROOM}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Évfolyam</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(HeroSection);
