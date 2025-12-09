import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    // We can't use useAuth's login method directly because standard simple auth usually involves a direct fetch
    // or we need to update useAuth to support password login.
    // For simplicity, I'll do the fetch here and invalidate queries.

    // Actually, useAuth usually just queries /api/auth/user.
    // So we login, then invalidate that query.

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                // Use text/plain to bypass global body-parser on server which seems broken
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
                // Force reload to update auth state perfectly
                window.location.href = "/admin";
            } else {
                const data = await res.json();
                throw new Error(data.message || "Hiba a bejelentkezés során");
            }
        } catch (error: any) {
            toast({
                title: "Sikertelen bejelentkezés",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4">
            <Card className="w-full max-w-md mx-4">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">Admin Bejelentkezés</CardTitle>
                    <CardDescription className="text-center">
                        Add meg az email címed és jelszavad a belépéshez
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email cím</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="pelda@websuli.vip"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Jelszó</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? "Bejelentkezés..." : "Belépés"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Button variant="ghost" onClick={() => setLocation("/")}>
                Vissza a főoldalra
            </Button>
        </div>
    );
}
