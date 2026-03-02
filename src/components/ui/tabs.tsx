'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  className?: string;
}

export function Tabs({ tabs, defaultTab, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');

  return (
    <div className={className}>
      <div
        className="relative flex gap-1 rounded-card bg-bg-secondary p-1"
        role="tablist"
        aria-label="Tab navigation"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={cn(
              'flex-1 rounded-input px-4 py-2.5 text-body-sm font-medium transition-all duration-250 ease-out',
              activeTab === tab.id
                ? 'bg-accent text-text-inverse shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface/50',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          className="pt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
