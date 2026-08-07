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
        className="hide-scrollbar relative flex gap-1 overflow-x-auto rounded-card bg-bg-secondary p-1"
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
              'min-w-[112px] flex-1 whitespace-nowrap rounded-input px-4 py-2.5 text-body-sm font-semibold transition-all duration-200 ease-out',
              activeTab === tab.id
                ? 'bg-accent text-text-inverse shadow-sm'
                : 'text-text-secondary hover:bg-surface/50 hover:text-text-primary',
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
