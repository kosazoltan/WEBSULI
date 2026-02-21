import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Bell, Mail, CheckCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CLASSROOMS } from "@shared/classrooms";

// Email subscription schema
const subscribeEmailSchema = z.object({
  email: z
    .string()
    .min(1, "Email cím megadása kötelező")
    .trim()
    .email("Érvénytelen email cím formátum"),
  classrooms: z
    .array(z.number())
    .min(1, "Legalább egy osztály kiválasztása kötelező"),
});

type SubscribeEmailFormValues = z.infer<typeof subscribeEmailSchema>;

export default function EmailSubscribeDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<SubscribeEmailFormValues>({
    resolver: zodResolver(subscribeEmailSchema),
    defaultValues: {
      email: "",
      classrooms: [],
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async (data: SubscribeEmailFormValues) => {
      return await apiRequest("POST", "/api/subscribe-email", { 
        email: data.email,
        classrooms: data.classrooms 
      });
    },
    onSuccess: () => {
      setIsSuccess(true);
      toast({
        title: "Sikeres feliratkozás! 🎉",
        description: "Értesítést fogsz kapni minden új tananyagról.",
      });
      form.reset();
      
      // Close dialog after 2 seconds
      setTimeout(() => {
        setOpen(false);
        setIsSuccess(false);
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Hiba történt",
        description: error.message || "Nem sikerült feliratkozni. Próbáld újra később.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: SubscribeEmailFormValues) => {
    subscribeMutation.mutate(data);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset states when closing
      form.reset();
      setIsSuccess(false);
    }
  };

  const toggleClassroom = (classroom: number) => {
    const currentClassrooms = form.getValues("classrooms");
    const newClassrooms = currentClassrooms.includes(classroom)
      ? currentClassrooms.filter(c => c !== classroom)
      : [...currentClassrooms, classroom].sort();
    form.setValue("classrooms", newClassrooms, { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
          data-testid="button-open-subscribe-dialog"
        >
          <Bell className="w-4 h-4 mr-2" />
          <span className="hidden xs:inline">Email értesítést kérek</span>
          <span className="xs:hidden">Értesítés</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-email-subscribe">
        {isSuccess ? (
          // Success state
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-4">
              <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-500" />
            </div>
            <DialogTitle className="text-center text-2xl">Sikeresen feliratkoztál!</DialogTitle>
            <DialogDescription className="text-center">
              Mostantól értesítést fogsz kapni minden új tananyagról az email címedre.
            </DialogDescription>
          </div>
        ) : (
          // Subscription form
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-orange-600" />
                Email értesítések
              </DialogTitle>
              <DialogDescription>
                Add meg az email címedet és válaszd ki, mely osztályok tananyagairól szeretnél értesítést kapni!
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email cím
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="pelda@email.com"
                          disabled={subscribeMutation.isPending}
                          data-testid="input-subscribe-email"
                          autoFocus
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Az email címedet kizárólag új tananyagok értesítésére használjuk.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="classrooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Osztályok (több is választható)</FormLabel>
                      <FormControl>
                        <div className="grid grid-cols-4 gap-2">
                          {CLASSROOMS.map((option) => (
                            <div key={option.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={`classroom-${option.value}`}
                                checked={field.value.includes(option.value)}
                                onCheckedChange={() => toggleClassroom(option.value)}
                                data-testid={`checkbox-classroom-${option.value}`}
                              />
                              <Label 
                                htmlFor={`classroom-${option.value}`}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {option.shortLabel}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </FormControl>
                      <FormDescription>
                        Válaszd ki azokat az osztályokat, melyek tananyagairól értesítést szeretnél.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    disabled={subscribeMutation.isPending}
                    data-testid="button-cancel-subscribe"
                  >
                    Mégsem
                  </Button>
                  <Button
                    type="submit"
                    disabled={subscribeMutation.isPending}
                    data-testid="button-submit-subscribe"
                  >
                    {subscribeMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Feliratkozás...
                      </>
                    ) : (
                      <>
                        <Bell className="w-4 h-4 mr-2" />
                        Feliratkozom
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
