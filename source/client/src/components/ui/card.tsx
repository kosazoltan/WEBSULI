import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties }
>(({ className, style, ...props }, ref) => {
  // Ha van inline style background vagy backgroundColor, ne alkalmazzuk a bg-card/80-at
  const hasCustomBackground = style?.background || style?.backgroundColor;
  
  return (
    <div
      ref={ref}
      className={cn(
        "shadcn-card rounded-xl border backdrop-blur-md border-primary/20 text-card-foreground shadow-xl",
        !hasCustomBackground && "bg-card/80", // Csak ha nincs custom background
        className
      )}
      style={style}
      {...props}
    />
  );
});
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  // Ha parent Card holographic-card, ne legyen háttér
  const parentIsHolographic = ref && 'current' in ref && ref.current?.parentElement?.classList.contains('holographic-card');
  
  return (
    <div 
      ref={ref} 
      className={cn("p-6 pt-0", className)} 
      style={parentIsHolographic ? { backgroundColor: 'transparent' } : undefined}
      {...props} 
    />
  );
})
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
