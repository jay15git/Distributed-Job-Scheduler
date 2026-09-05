import { Environment, ProjectStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';

export class ProjectRepository {
  constructor(private readonly db: TransactionClient) {}

  async createProject(data: {
    organizationId: string;
    name: string;
    description?: string;
    environment?: Environment;
    createdBy: string;
  }) {
    return this.db.project.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description,
        environment: data.environment ?? Environment.DEVELOPMENT,
        status: ProjectStatus.ACTIVE,
        createdBy: data.createdBy,
      },
    });
  }

  async getProjectById(projectId: string) {
    return this.db.project.findUnique({
      where: { id: projectId, deletedAt: null },
    });
  }

  async softDeleteProject(projectId: string, deletedBy: string) {
    return this.db.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  // ==========================================
  // PROJECT MEMBERS
  // ==========================================

  async addMember(data: { projectId: string; userId: string; role: 'SUPER_ADMIN' | 'ORG_ADMIN' | 'PROJECT_ADMIN' | 'DEVELOPER' | 'VIEWER'; joinedBy?: string; invitedViaOrganization?: boolean }) {
    return this.db.projectMember.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        role: data.role,
        joinedBy: data.joinedBy,
        invitedViaOrganization: data.invitedViaOrganization ?? false,
      },
    });
  }

  async getMember(projectId: string, userId: string) {
    return this.db.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }

  async listMembers(projectId: string) {
    return this.db.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });
  }

  async removeMember(projectId: string, userId: string) {
    return this.db.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }
}
