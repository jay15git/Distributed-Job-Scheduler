export interface JobExecutor {
  type: string;
  execute(payload: any): Promise<any>;
}

export class ExecutorRegistry {
  private executors: Map<string, JobExecutor> = new Map();

  register(executor: JobExecutor) {
    if (this.executors.has(executor.type)) {
      throw new Error(`Executor for type ${executor.type} is already registered.`);
    }
    this.executors.set(executor.type, executor);
  }

  get(type: string): JobExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor found for job type: ${type}`);
    }
    return executor;
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.executors.keys());
  }
}

// Example Mock Executors

export class EmailExecutor implements JobExecutor {
  type = 'email';
  async execute(payload: any) {
    console.log(`[EmailExecutor] Sending email to ${payload.to}`);
    // Simulate work
    await new Promise(r => setTimeout(r, 500));
    return { success: true, messageId: 'sim-msg-123' };
  }
}

export class PdfExecutor implements JobExecutor {
  type = 'pdf';
  async execute(payload: any) {
    console.log(`[PdfExecutor] Generating PDF from ${payload.template}`);
    // Simulate work
    await new Promise(r => setTimeout(r, 1500));
    return { success: true, url: 'https://cdn.example.com/sim.pdf' };
  }
}

export class WebhookExecutor implements JobExecutor {
  type = 'webhook';
  async execute(payload: any) {
    console.log(`[WebhookExecutor] POSTing to ${payload.url}`);
    // Simulate work
    await new Promise(r => setTimeout(r, 200));
    return { success: true, statusCode: 200 };
  }
}

export class DataProcessingExecutor implements JobExecutor {
  type = 'data_processing';
  async execute(payload: any) {
    console.log(`[DataProcessingExecutor] Processing dataset: ${payload.dataset}`);
    // Simulate work
    await new Promise(r => setTimeout(r, 2500));
    return { success: true, processedRows: 15420, outputUrl: 's3://bucket/out.csv' };
  }
}

export class SystemExecutor implements JobExecutor {
  type = 'system';
  async execute(payload: any) {
    console.log(`[SystemExecutor] Running system task: ${payload.command}`);
    // Simulate work
    await new Promise(r => setTimeout(r, 1000));
    return { success: true, exitCode: 0, stdout: 'Backup completed successfully.' };
  }
}

export class CustomExecutor implements JobExecutor {
  type = 'custom';
  async execute(payload: any) {
    console.log(`[CustomExecutor] Running custom script`);
    await new Promise(r => setTimeout(r, 1000));
    if (payload.shouldFail) {
      throw new Error('Simulated custom executor failure');
    }
    return { success: true, data: payload };
  }
}

export class ImmediateExecutor implements JobExecutor {
  type = 'IMMEDIATE';
  async execute(payload: any) {
    console.log(`[ImmediateExecutor] Executing immediate job with payload:`, payload);
    await new Promise(r => setTimeout(r, 100)); // short delay
    return { success: true, executed: true };
  }
}
