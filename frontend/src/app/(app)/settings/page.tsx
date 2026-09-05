'use client';

import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [theme, setTheme] = useState('system');
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('relative');

  // Load from local storage
  useEffect(() => {
    const savedTheme = localStorage.getItem('djs_theme');
    if (savedTheme) setTheme(savedTheme);

    const savedInterval = localStorage.getItem('djs_refreshInterval');
    if (savedInterval) setRefreshInterval(savedInterval);

    const savedTz = localStorage.getItem('djs_timezone');
    if (savedTz) setTimezone(savedTz);

    const savedFormat = localStorage.getItem('djs_dateFormat');
    if (savedFormat) setDateFormat(savedFormat);
  }, []);

  const handleSaveTheme = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTheme(val);
    localStorage.setItem('djs_theme', val);
  };

  const handleSaveInterval = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setRefreshInterval(val);
    localStorage.setItem('djs_refreshInterval', val);
  };

  const handleSaveTz = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTimezone(val);
    localStorage.setItem('djs_timezone', val);
  };

  const handleSaveFormat = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setDateFormat(val);
    localStorage.setItem('djs_dateFormat', val);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 max-w-3xl">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your local dashboard preferences.</p>
        </div>
      </div>

      <div className="space-y-6">
        <section className="bg-card border border-border/50 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Appearance</h3>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium text-foreground">Theme</label>
                <p className="text-xs text-muted-foreground">Select your preferred color scheme.</p>
              </div>
              <select 
                value={theme}
                onChange={handleSaveTheme}
                className="w-full sm:w-48 bg-muted/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="system">System Default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
        </section>

        <section className="bg-card border border-border/50 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Dashboard Behavior</h3>
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium text-foreground">Auto-Refresh Interval</label>
                <p className="text-xs text-muted-foreground">How often tables fetch fresh data.</p>
              </div>
              <select 
                value={refreshInterval}
                onChange={handleSaveInterval}
                className="w-full sm:w-48 bg-muted/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="1">1 second</option>
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
                <option value="0">Off (Manual refresh)</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium text-foreground">Timezone Display</label>
                <p className="text-xs text-muted-foreground">Preferred timezone for date rendering.</p>
              </div>
              <select 
                value={timezone}
                onChange={handleSaveTz}
                className="w-full sm:w-48 bg-muted/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="local">Local Browser Time</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium text-foreground">Date Format</label>
                <p className="text-xs text-muted-foreground">How dates should be presented in tables.</p>
              </div>
              <select 
                value={dateFormat}
                onChange={handleSaveFormat}
                className="w-full sm:w-48 bg-muted/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="relative">Relative (e.g. 5 mins ago)</option>
                <option value="absolute">Absolute (e.g. Jan 1, 12:00 PM)</option>
                <option value="iso">ISO-8601 (e.g. 2026-07-17T12:00:00Z)</option>
              </select>
            </div>
          </div>
        </section>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Note: These settings are stored locally in your browser (localStorage) and do not sync across devices.
        </p>
      </div>
    </div>
  );
}
