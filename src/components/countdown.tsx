'use client';

import { useEffect, useState } from 'react';
import { differenceInSeconds } from 'date-fns';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownProps {
  targetDate: string | Date;
  onExpire?: () => void;
  className?: string;
}

export function Countdown({ targetDate, onExpire, className }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [expired, setExpired] = useState(false);
  const [urgency, setUrgency] = useState<'normal' | 'warning' | 'critical'>('normal');

  useEffect(() => {
    function update() {
      const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
      const diff = differenceInSeconds(target, new Date());

      if (diff <= 0) {
        setExpired(true);
        setTimeLeft('Locked');
        onExpire?.();
        return;
      }

      // Urgency levels
      if (diff < 300) setUrgency('critical'); // < 5 min
      else if (diff < 3600) setUrgency('warning'); // < 1 hour
      else setUrgency('normal');

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate, onExpire]);

  if (expired) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-countdown font-semibold text-error tabular-nums', className)}>
        <Lock className="h-3 w-3" aria-hidden="true" />
        Locked
      </span>
    );
  }

  return (
    <span
      className={cn(
        'text-countdown font-semibold tabular-nums',
        urgency === 'critical' && 'text-error',
        urgency === 'warning' && 'text-warning',
        urgency === 'normal' && 'text-text-secondary',
        className,
      )}
    >
      {timeLeft}
    </span>
  );
}
