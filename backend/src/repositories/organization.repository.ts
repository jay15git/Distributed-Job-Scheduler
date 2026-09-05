import { TransactionClient } from '../database/db';

export class OrganizationRepository {
  constructor(private readonly db: TransactionClient) {}

  async createOrganization(data: { name: string; slug: string }) {
    return this.db.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
      },
    });
  }

  async getOrganizationById(orgId: string) {
    return this.db.organization.findUnique({
      where: { id: orgId, deletedAt: null },
    });
  }

  async softDeleteOrganization(orgId: string, deletedBy: string) {
    return this.db.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  // ==========================================
  // ORGANIZATION MEMBERS
  // ==========================================

  async addMember(data: { organizationId: string; userId: string; role: 'SUPER_ADMIN' | 'ORG_ADMIN' | 'PROJECT_ADMIN' | 'DEVELOPER' | 'VIEWER' }) {
    return this.db.organizationMember.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        role: data.role,
      },
    });
  }

  async getMember(organizationId: string, userId: string) {
    return this.db.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
    });
  }

  async listMembers(organizationId: string) {
    return this.db.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });
  }

  // ==========================================
  // ORGANIZATION INVITATIONS
  // ==========================================

  async createInvitation(data: { organizationId: string; email: string; tokenHash: string; role: 'SUPER_ADMIN' | 'ORG_ADMIN' | 'PROJECT_ADMIN' | 'DEVELOPER' | 'VIEWER'; invitedBy: string; expiresAt: Date }) {
    return this.db.organizationInvitation.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        tokenHash: data.tokenHash,
        role: data.role,
        invitedBy: data.invitedBy,
        expiresAt: data.expiresAt,
        status: 'PENDING',
      },
    });
  }

  async getInvitationByTokenHash(tokenHash: string) {
    return this.db.organizationInvitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });
  }

  async updateInvitationStatus(id: string, status: 'ACCEPTED' | 'EXPIRED' | 'REVOKED') {
    return this.db.organizationInvitation.update({
      where: { id },
      data: {
        status,
        ...(status === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
      },
    });
  }

  async listInvitations(organizationId: string) {
    return this.db.organizationInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
