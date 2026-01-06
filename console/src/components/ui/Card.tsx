import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'neo';
}

export function Card({ className, variant = 'glass', children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl transition-all duration-300',
        variant === 'glass' && 'bg-surface/30 backdrop-blur-md border border-white/10 shadow-glass hover:border-white/20',
        variant === 'default' && 'bg-surface border border-slate-700',
        variant === 'neo' && 'bg-slate-900 border border-primary/50 shadow-neon',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 p-6 border-b border-white/5', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-semibold leading-none tracking-tight text-slate-100', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-6', className)} {...props} />;
}
