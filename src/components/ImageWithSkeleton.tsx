import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ImageWithSkeletonProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: "square" | "video" | "custom";
}

export const ImageWithSkeleton = ({ 
  src, 
  alt, 
  className,
  aspectRatio = "custom" 
}: ImageWithSkeletonProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!isLoaded && !hasError && (
        <Skeleton className="absolute inset-0" />
      )}
      <img
        src={hasError ? "/placeholder.svg" : src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          "transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setIsLoaded(true)}
        onError={(e) => {
          setHasError(true);
          setIsLoaded(true);
          e.currentTarget.src = "/placeholder.svg";
        }}
      />
    </div>
  );
};
