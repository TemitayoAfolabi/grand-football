import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4 text-center">
      <div className="space-y-6">
        <p className="text-display font-extrabold text-text-tertiary">404</p>
        <div className="space-y-2">
          <h1 className="text-h1 text-text-primary">Page not found</h1>
          <p className="text-body text-text-secondary">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <Link href="/">
          <Button size="lg">
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
