import { OrganizationRepository } from '../repositories/organization.repository';

import crypto from 'crypto';
import { Role } from '@prisma/client';

export class OrganizationService {
  constructor(private readonly orgRepo: OrganizationRepository) {}

  async createOrganization(
    data: { name: string; slug: string },
    creatorUserId: string
  ) {
    const org = await this.orgRepo.createOrganization({
      name: data.name,
      slug: data.slug,
    });

    await this.orgRepo.addMember({
      organizationId: org.id,
      userId: creatorUserId,
      role: Role.ORG_ADMIN,
    });

    return org;
  }

  async getOrganization(orgId: string) {
    const org = await this.orgRepo.getOrganizationById(orgId);
    if (!org) {
      throw new Error('Organization not found'); // Should be a custom error type in real app
    }
    return org;
  }

  async inviteMember(data: {
    organizationId: string;
    email: string;
    role: Role;
    invitedBy: string;
  }) {
    const org = await this.getOrganization(data.organizationId);

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Token expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.orgRepo.createInvitation({
      organizationId: org.id,
      email: data.email,
      role: data.role,
      tokenHash,
      invitedBy: data.invitedBy,
      expiresAt,
    });

    // In a real application, send an email here containing the raw `token`
    // e.g., emailService.sendInvitation(data.email, token);

    return { token }; // Return raw token for the API response (to simulate email)
  }

  async acceptInvitation(
    token: string,
    userId: string,
    userEmail: string
  ) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await this.orgRepo.getInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new Error('Invalid or expired invitation token');
    }

    if (invitation.status !== 'PENDING') {
      throw new Error('Invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      await this.orgRepo.updateInvitationStatus(invitation.id, 'EXPIRED');
      throw new Error('Invitation has expired');
    }

    if (invitation.email !== userEmail) {
      throw new Error('Invitation email does not match user email');
    }

    // Check if user is already a member
    const existingMember = await this.orgRepo.getMember(invitation.organizationId, userId);
    if (existingMember) {
      // User is already a member, just mark as accepted
      await this.orgRepo.updateInvitationStatus(invitation.id, 'ACCEPTED');
      return existingMember;
    }

    // Add member
    const member = await this.orgRepo.addMember({
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
    });

    await this.orgRepo.updateInvitationStatus(invitation.id, 'ACCEPTED');

    return member;
  }

  async listMembers(organizationId: string) {
    return this.orgRepo.listMembers(organizationId);
  }

  async revokeInvitation(invitationId: string) {
    return this.orgRepo.updateInvitationStatus(invitationId, 'REVOKED');
  }

  async listInvitations(organizationId: string) {
    return this.orgRepo.listInvitations(organizationId);
  }
}
