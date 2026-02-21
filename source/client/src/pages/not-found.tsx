import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-orange-500" />
            <h1 className="text-2xl font-bold text-orange-900">404 - Az oldal nem található</h1>
          </div>

          <p className="mt-4 text-sm text-orange-700">
            A keresett oldal nem létezik vagy eltávolításra került.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
