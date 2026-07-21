import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ backgroundColor: "#0A0E27" }}
    >
      <Card className="w-full max-w-md mx-4 glass-card border-orange-400/30 bg-black/30">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-orange-400 shrink-0" />
            <h1 className="text-2xl font-bold text-white">404 - Az oldal nem található</h1>
          </div>

          <p className="mt-2 text-sm text-white/70">
            A keresett oldal nem létezik vagy eltávolításra került.
          </p>

          <Link href="/">
            <Button
              className="mt-6 gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-semibold"
              data-testid="button-back-home"
            >
              <Home className="w-4 h-4" />
              Vissza a főoldalra
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
