import { Request, Response } from 'express';
import { prisma as db } from '../database/db';
import * as cronParser from 'cron-parser';

export class ScheduledJobController {
  /**
   * Register a recurring schedule. The cron materializer turns each due
   * occurrence into a real Job row targeted at queueId (or the project's
   * defaultQueueId).
   */
  static async create(req: Request, res: Response) {
    const { projectId, name, cronExpression, timezone, payload, queueId } = req.body;

    if (!projectId || !name || !cronExpression) {
      return res.status(400).json({ error: 'projectId, name and cronExpression are required' });
    }

    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (queueId) {
      const queue = await db.queue.findUnique({ where: { id: queueId } });
      if (!queue) {
        return res.status(404).json({ error: 'Queue not found' });
      }
      if (queue.projectId !== projectId) {
        return res.status(400).json({ error: 'Queue does not belong to the given project' });
      }
    }

    let nextRunAt: Date;
    try {
      nextRunAt = cronParser
        .parseExpression(cronExpression, { tz: timezone || 'UTC' })
        .next()
        .toDate();
    } catch {
      return res.status(400).json({ error: `Invalid cron expression: ${cronExpression}` });
    }

    const schedule = await db.scheduledJob.create({
      data: {
        projectId,
        name,
        cronExpression,
        timezone: timezone || 'UTC',
        payload: payload ?? {},
        queueId: queueId || null,
        nextRunAt,
      },
    });
    res.status(201).json(schedule);
  }

  static async list(req: Request, res: Response) {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) {
      where.projectId = String(projectId);
    }
    if (req.apiKey) {
      where.projectId = req.apiKey.projectId;
    } else if (req.user) {
      const memberships = await db.organizationMember.findMany({
        where: { userId: req.user.id },
        select: { organizationId: true },
      });
      where.project = { organizationId: { in: memberships.map(m => m.organizationId) } };
    }
    const schedules = await db.scheduledJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(schedules);
  }

  static async get(req: Request, res: Response) {
    const schedule = await db.scheduledJob.findUnique({ where: { id: req.params.id } });
    if (!schedule) return res.status(404).json({ error: 'Scheduled job not found' });
    res.json(schedule);
  }

  /**
   * Pause / resume / retire a schedule. Status is a free-form string column;
   * the materializer only consumes 'ACTIVE'.
   */
  static async updateStatus(req: Request, res: Response) {
    const { status } = req.body;
    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ACTIVE or PAUSED' });
    }
    const schedule = await db.scheduledJob.findUnique({ where: { id: req.params.id } });
    if (!schedule) return res.status(404).json({ error: 'Scheduled job not found' });

    const data: any = { status };
    if (status === 'ACTIVE') {
      // Recompute next fire time so a resumed schedule doesn't dump
      // every missed occurrence at once.
      data.nextRunAt = cronParser
        .parseExpression(schedule.cronExpression, { tz: schedule.timezone })
        .next()
        .toDate();
    }
    res.json(await db.scheduledJob.update({ where: { id: req.params.id }, data }));
  }
}
