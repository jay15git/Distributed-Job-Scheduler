import { ProjectRepository } from '../repositories/project.repository';
import { Role, Environment } from '@prisma/client';

export class ProjectService {
  constructor(private readonly projectRepo: ProjectRepository) {}

  async createProject(data: {
    organizationId: string;
    name: string;
    description?: string;
    environment?: Environment;
    creatorUserId: string;
  }) {
    // Note: Caller should ensure the organization exists and creator has permission to create a project
    const project = await this.projectRepo.createProject({
      organizationId: data.organizationId,
      name: data.name,
      description: data.description,
      environment: data.environment,
      createdBy: data.creatorUserId,
    });

    // Creator becomes PROJECT_ADMIN by default
    await this.projectRepo.addMember({
      projectId: project.id,
      userId: data.creatorUserId,
      role: Role.PROJECT_ADMIN,
    });

    return project;
  }

  async getProject(projectId: string) {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }

  async addMember(data: {
    projectId: string;
    userId: string;
    role: Role;
    joinedBy?: string;
    invitedViaOrganization?: boolean;
  }) {
    const project = await this.getProject(data.projectId);

    // Check if user is already a member
    const existingMember = await this.projectRepo.getMember(project.id, data.userId);
    if (existingMember) {
      throw new Error('User is already a member of this project');
    }

    return this.projectRepo.addMember(data);
  }

  async removeMember(projectId: string, userId: string) {
    const project = await this.getProject(projectId);
    
    // Check if member exists
    const existingMember = await this.projectRepo.getMember(project.id, userId);
    if (!existingMember) {
      throw new Error('User is not a member of this project');
    }

    return this.projectRepo.removeMember(projectId, userId);
  }

  async listMembers(projectId: string) {
    return this.projectRepo.listMembers(projectId);
  }
}
