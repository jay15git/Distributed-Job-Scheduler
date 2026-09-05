'use client';

import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { RefreshCw, PlayCircle, Settings2, Code, LayoutList, AlertCircle, CheckCircle2 } from 'lucide-react';
import { jobsApi } from '../api/jobs-api';
import { apiClient } from '@/lib/api-client';
import { notify } from '@/lib/notify';

interface CreateJobDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TASK_TYPES = [
  { id: 'email', name: 'Email Notification', defaultPayload: '{\n  "taskType": "email",\n  "to": "user@example.com",\n  "subject": "Welcome!"\n}' },
  { id: 'pdf', name: 'Document Generation (PDF)', defaultPayload: '{\n  "taskType": "pdf",\n  "template": "invoice",\n  "data": { "amount": 100 }\n}' },
  { id: 'webhook', name: 'Webhook Request', defaultPayload: '{\n  "taskType": "webhook",\n  "url": "https://api.example.com/hook",\n  "method": "POST"\n}' },
  { id: 'data_processing', name: 'Data Processing', defaultPayload: '{\n  "taskType": "data_processing",\n  "dataset": "s3://bucket/data.csv",\n  "operations": ["clean", "aggregate"]\n}' },
  { id: 'system', name: 'System Task', defaultPayload: '{\n  "taskType": "system",\n  "command": "backup_db"\n}' },
];

export function CreateJobDrawer({ isOpen, onClose, onSuccess }: CreateJobDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queues, setQueues] = useState<any[]>([]);
  const [isLoadingQueues, setIsLoadingQueues] = useState(true);

  // Form State
  const [jobName, setJobName] = useState('');
  const [taskType, setTaskType] = useState('email');
  const [queueId, setQueueId] = useState('');
  const [priority, setPriority] = useState('5');
  const [executionMode, setExecutionMode] = useState('IMMEDIATE');
  const [scheduleDate, setScheduleDate] = useState('');
  const [payloadText, setPayloadText] = useState(TASK_TYPES[0].defaultPayload);
  
  // Real-time Validation State
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'config' | 'payload'>('config');

  useEffect(() => {
    if (isOpen) {
      fetchQueues();
      setActiveTab('config');
    }
  }, [isOpen]);

  useEffect(() => {
    const selectedTask = TASK_TYPES.find(t => t.id === taskType);
    if (selectedTask) {
      setPayloadText(selectedTask.defaultPayload);
    }
  }, [taskType]);

  useEffect(() => {
    // Auto-select a compatible queue if possible
    if (queues.length > 0) {
      const matchedQueue = queues.find(q => {
        const qName = q.name.toLowerCase();
        const tId = taskType.toLowerCase();
        if (tId === 'email' && qName.includes('email')) return true;
        if (tId === 'pdf' && qName.includes('pdf')) return true;
        if (tId === 'webhook' && qName.includes('webhook')) return true;
        if (tId === 'data_processing' && (qName.includes('data') || qName.includes('process'))) return true;
        if (tId === 'system' && qName.includes('system')) return true;
        return false;
      });
      if (matchedQueue) {
        setQueueId(matchedQueue.id);
      } else if (!queueId || !queues.find(q => q.id === queueId)) {
        setQueueId(queues[0].id);
      }
    }
  }, [taskType, queues]);

  // Real-time JSON validation
  useEffect(() => {
    try {
      if (payloadText.trim() === '') {
         setPayloadError('Payload cannot be empty');
         return;
      }
      JSON.parse(payloadText);
      setPayloadError(null); // Valid JSON
    } catch (err: any) {
      setPayloadError('Invalid JSON format');
    }
  }, [payloadText]);

  const fetchQueues = async () => {
    setIsLoadingQueues(true);
    try {
      const res = await apiClient.get('/queues');
      const q = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setQueues(q);
      if (q.length > 0 && !queueId) {
        setQueueId(q[0].id);
      }
    } catch (e) {
      notify.error('Failed to load queues');
    } finally {
      setIsLoadingQueues(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Tab 1 Validation
    if (!jobName || !queueId) {
      setActiveTab('config');
      notify.error('Please fill in required fields: Job Name and Target Queue');
      return;
    }
    
    // Tab 2 Validation
    if (payloadError) {
      setActiveTab('payload');
      notify.error('Please fix the JSON payload errors before submitting');
      return;
    }

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (err) {
      setActiveTab('payload');
      notify.error('Invalid JSON payload');
      return;
    }

    // Schedule Validation
    if ((executionMode === 'SCHEDULED' || executionMode === 'DELAYED') && !scheduleDate) {
      setActiveTab('config');
      notify.error('Please select a schedule date/time');
      return;
    }

    setIsSubmitting(true);
    try {
      const reqPayload: any = {
        name: jobName,
        queueId: queueId,
        type: executionMode,
        payload: parsedPayload,
        priority: parseInt(priority, 10),
      };

      if (executionMode === 'SCHEDULED' || executionMode === 'DELAYED') {
        reqPayload.nextRunAt = new Date(scheduleDate).toISOString();
      }

      await jobsApi.createJob(reqPayload);
      notify.success('Job created successfully!');
      onSuccess();
      onClose();
      
      // Reset form on success only
      setJobName('');
      setExecutionMode('IMMEDIATE');
      setScheduleDate('');
      setActiveTab('config');
    } catch (e: any) {
      notify.error(e.response?.data?.error?.message || 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[800px] p-0 border-l-border/50 bg-background/95 backdrop-blur-xl flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <SheetHeader className="mb-2 pb-6 border-b border-border/50">
              <SheetTitle className="text-2xl font-bold flex items-center gap-2">
                <PlayCircle className="h-6 w-6 text-primary" />
                Create New Job
              </SheetTitle>
              <SheetDescription className="text-base mt-1">
                Configure and enqueue a new asynchronous workload across your cluster.
              </SheetDescription>
            </SheetHeader>
            
            {/* Switchable Tabs */}
            <div className="flex bg-muted/30 p-1.5 rounded-xl border border-border/50 mx-auto w-full max-w-md shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'config'
                    ? 'bg-background shadow-sm text-foreground border border-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <LayoutList className="h-4 w-4" />
                Core Configuration
                {(!jobName || !queueId || ((executionMode === 'SCHEDULED' || executionMode === 'DELAYED') && !scheduleDate)) && activeTab !== 'config' && (
                   <span className="w-2 h-2 rounded-full bg-yellow-500" title="Missing required fields" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('payload')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'payload'
                    ? 'bg-background shadow-sm text-foreground border border-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Code className="h-4 w-4" />
                Data Payload
                {payloadError && activeTab !== 'payload' && (
                   <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Invalid JSON payload" />
                )}
              </button>
            </div>
            
            <div className="mt-6">
              {activeTab === 'config' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                  
                  {/* Core Configuration Card */}
                  <section className="bg-card border border-border/50 rounded-xl p-5 space-y-5 shadow-sm">
                    <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-3">
                      Job Details
                    </h3>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        Job Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Generate Monthly Invoice"
                        value={jobName}
                        onChange={e => setJobName(e.target.value)}
                        className="w-full bg-background border border-border/50 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/50"
                      />
                      <p className="text-[11px] text-muted-foreground">A unique, readable identifier for this job instance.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task Type (Executor)</label>
                        <select
                          value={taskType}
                          onChange={e => setTaskType(e.target.value)}
                          className="w-full bg-background border border-border/50 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        >
                          {TASK_TYPES.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground">Sets the default payload schema for this task.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                          Target Queue <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={queueId}
                          onChange={e => setQueueId(e.target.value)}
                          disabled={isLoadingQueues}
                          className="w-full bg-background border border-border/50 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
                        >
                          <option value="" disabled>Select a target queue...</option>
                          {queues.map(q => (
                            <option key={q.id} value={q.id}>{q.name}</option>
                          ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground">Auto-selected based on compatibility with the chosen task type.</p>
                      </div>
                    </div>
                  </section>

                  {/* Execution Strategy Card */}
                  <section className="bg-card border border-border/50 rounded-xl p-5 space-y-5 shadow-sm">
                    <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-3">
                      Execution Strategy
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mode</label>
                        <select
                          value={executionMode}
                          onChange={e => setExecutionMode(e.target.value)}
                          className="w-full bg-background border border-border/50 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        >
                          <option value="IMMEDIATE">Immediate</option>
                          <option value="SCHEDULED">Scheduled</option>
                          <option value="DELAYED">Delayed</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority</label>
                        <select
                          value={priority}
                          onChange={e => setPriority(e.target.value)}
                          className="w-full bg-background border border-border/50 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        >
                          <option value="10">CRITICAL</option>
                          <option value="5">HIGH</option>
                          <option value="0">NORMAL</option>
                          <option value="-5">LOW</option>
                        </select>
                      </div>
                    </div>

                    {(executionMode === 'SCHEDULED' || executionMode === 'DELAYED') && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                          Schedule Date / Time <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={scheduleDate}
                          onChange={e => setScheduleDate(e.target.value)}
                          className="w-full bg-background border border-border/50 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all color-scheme-dark"
                        />
                        <p className="text-[11px] text-muted-foreground">When the job should be eligible for execution.</p>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeTab === 'payload' && (
                <div className="space-y-6 h-full animate-in fade-in slide-in-from-right-4 duration-300">
                  <section className="bg-card border border-border/50 rounded-xl p-5 space-y-4 shadow-sm flex flex-col min-h-[400px]">
                    <div className="flex items-center justify-between border-b border-border/50 pb-3">
                      <h3 className="text-sm font-semibold tracking-tight">
                        JSON Payload
                      </h3>
                      {payloadError ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 bg-red-400/10 px-2 py-1 rounded-md">
                          <AlertCircle className="h-3 w-3" /> Invalid JSON
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-green-400 bg-green-400/10 px-2 py-1 rounded-md">
                          <CheckCircle2 className="h-3 w-3" /> Valid JSON
                        </span>
                      )}
                    </div>
                    
                    <div className="flex-1 flex flex-col relative">
                      <textarea
                        value={payloadText}
                        onChange={e => setPayloadText(e.target.value)}
                        className={`flex-1 min-h-[300px] w-full bg-background border ${payloadError ? 'border-red-500/50 focus:ring-red-500/30' : 'border-border/50 focus:ring-primary/50'} rounded-md p-4 text-sm font-mono focus:outline-none focus:ring-2 transition-all custom-scrollbar leading-relaxed resize-none`}
                        spellCheck={false}
                        placeholder="Enter valid JSON payload..."
                      />
                      {payloadError && (
                        <p className="absolute bottom-[-22px] left-0 text-[11px] text-red-400">
                          Error: {payloadError}
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="p-6 border-t border-border/50 bg-card/80 backdrop-blur-xl flex gap-4 items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-background border border-border text-foreground text-sm font-semibold rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingQueues}
              className="flex items-center justify-center gap-2 px-8 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-md hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(var(--primary),0.3)] hover:shadow-[0_0_20px_rgba(var(--primary),0.5)]"
            >
              {isSubmitting ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</>
              ) : (
                <><PlayCircle className="h-4 w-4" /> Enqueue Job</>
              )}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
