import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import {
  AuthResponse,
  AuthTokens,
  UserSummary,
} from './interfaces/auth-response.interface.js';
import {
  JwtPayload,
  JwtRefreshPayload,
} from './interfaces/jwt-payload.interface.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  /**
   * Check if organization slug is available for registration.
   */
  async checkSlugAvailability(
    slug: string,
  ): Promise<{ slug: string; available: boolean }> {
    if (!slug || !slug.trim()) {
      throw new BadRequestException('slug query parameter is required');
    }
    const cleanSlug = slug.toLowerCase().trim();
    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug: cleanSlug },
      select: { id: true },
    });
    return {
      slug: cleanSlug,
      available: !existingOrg,
    };
  }

  /**
   * Register a new Organization, default Roles, Subscription, and Owner User.
   */
  async register(
    dto: RegisterDto,
    initialPlan?: string,
  ): Promise<AuthResponse> {
    const slug = dto.organizationSlug.toLowerCase().trim();
    const email = dto.email.toLowerCase().trim();

    // Check if organization slug is already taken
    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrg) {
      throw new ConflictException(
        `Organization with slug '${slug}' already exists`,
      );
    }

    // Determine initial plans based on query param if passed
    let selectedPlans: AppPlan[] = [AppPlan.ATS, AppPlan.HRMS, AppPlan.CRM];
    if (initialPlan) {
      const upperPlan = initialPlan.toUpperCase().trim();
      if (Object.values(AppPlan).includes(upperPlan as AppPlan)) {
        selectedPlans = [upperPlan as AppPlan];
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    // Atomically create Organization, Roles, Subscription, and Owner User
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          slug,
        },
      });

      // 2. Create Default System Roles
      const superAdminRole = await tx.role.create({
        data: {
          name: 'Super Admin',
          description: 'Full organizational access and settings',
          type: SystemRoleType.SUPER_ADMIN,
          isSystem: true,
          organizationId: org.id,
          permissions: ['*'],
        },
      });

      await tx.role.createMany({
        data: [
          {
            name: 'Admin',
            description: 'Organizational administrator',
            type: SystemRoleType.ADMIN,
            isSystem: true,
            organizationId: org.id,
            permissions: [
              'org:read',
              'users:*',
              'jobs:*',
              'candidates:*',
              'interviews:*',
            ],
          },
          {
            name: 'Recruiter',
            description: 'ATS Recruiter managing jobs and candidates',
            type: SystemRoleType.RECRUITER,
            isSystem: true,
            organizationId: org.id,
            permissions: [
              'jobs:read',
              'jobs:create',
              'jobs:update',
              'candidates:*',
              'interviews:*',
            ],
          },
          {
            name: 'Manager',
            description: 'Hiring manager or team manager',
            type: SystemRoleType.MANAGER,
            isSystem: true,
            organizationId: org.id,
            permissions: [
              'jobs:read',
              'candidates:read',
              'candidates:evaluate',
              'interviews:read',
            ],
          },
          {
            name: 'Employee',
            description: 'Standard employee account',
            type: SystemRoleType.EMPLOYEE,
            isSystem: true,
            organizationId: org.id,
            permissions: ['profile:read', 'profile:update'],
          },
        ],
      });

      // 3. Create Subscription with initial trial containing requested plans
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

      const subscription = await tx.subscription.create({
        data: {
          organizationId: org.id,
          activePlans: selectedPlans,
          status: 'TRIALING',
          trialEndsAt: trialEndDate,
          maxUsers: 25,
        },
      });

      // 4. Create Owner User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim() || null,
          organizationId: org.id,
          roleId: superAdminRole.id,
        },
        include: {
          role: true,
          organization: true,
        },
      });

      return { user, org, role: superAdminRole, subscription, activePlans: selectedPlans };
    });

    const tokens = await this.generateTokens({
      sub: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      roleId: result.role.id,
      roleType: result.role.type,
      permissions: result.role.permissions,
      activePlans: result.activePlans,
    });

    await this.updateRefreshTokenHash(result.user.id, tokens.refreshToken);

    return {
      user: this.formatUserSummary(result.user, result.role, result.org, result.activePlans),
      tokens,
    };
  }

  /**
   * Authenticate user by email, password, and optional organization slug.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();

    // Query user by email
    const users = await this.prisma.user.findMany({
      where: {
        email,
        ...(dto.organizationSlug
          ? { organization: { slug: dto.organizationSlug.toLowerCase().trim() } }
          : {}),
      },
      include: {
        role: true,
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            },
          },
        },
      },
    });

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (users.length > 1 && !dto.organizationSlug) {
      throw new BadRequestException(
        'Multiple organizations found for this email. Please specify your organizationSlug via body or query parameter ?organizationSlug=...',
      );
    }

    const user = users[0];

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive. Contact your administrator.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const activePlans = user.organization.subscriptions.flatMap((s) => s.activePlans);

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roleId: user.roleId,
      roleType: user.role.type,
      permissions: user.role.permissions,
      activePlans,
    });

    // Update refresh token hash and last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await bcrypt.hash(tokens.refreshToken, 10),
        lastLoginAt: new Date(),
      },
    });

    return {
      user: this.formatUserSummary(user, user.role, user.organization, activePlans),
      tokens,
    };
  }

  /**
   * Rotate access and refresh tokens.
   */
  async refreshTokens(dto: RefreshTokenDto): Promise<AuthTokens> {
    if (!dto.refreshToken) {
      throw new BadRequestException('refreshToken is required via body or query parameter');
    }

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify<JwtRefreshPayload>(dto.refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: true,
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    // Verify refresh token hash
    const isTokenMatch = await bcrypt.compare(
      dto.refreshToken,
      user.refreshTokenHash,
    );
    if (!isTokenMatch) {
      // Possible token reuse attack: revoke refresh token
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Access denied: Token revoked');
    }

    const activePlans = user.organization.subscriptions.flatMap((s) => s.activePlans);

    // Generate new pair
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roleId: user.roleId,
      roleType: user.role.type,
      permissions: user.role.permissions,
      activePlans,
    });

    // Update stored refresh token hash
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return tokens;
  }

  /**
   * Logout user by clearing refresh token hash.
   */
  async logout(
    userId: string,
    allDevices?: boolean,
  ): Promise<{ message: string; allDevices: boolean }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return {
      message: 'Logged out successfully',
      allDevices: allDevices ?? false,
    };
  }

  /**
   * Get current authenticated user details.
   */
  async getMe(
    userId: string,
    options?: { includePermissions?: boolean; includeOrg?: boolean },
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activePlans = user.organization.subscriptions.flatMap((s) => s.activePlans);
    const summary = this.formatUserSummary(user, user.role, user.organization, activePlans);

    if (options?.includePermissions === false) {
      summary.role.permissions = [];
    }

    return summary;
  }

  /**
   * Helper to generate Access and Refresh JWT tokens.
   */
  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessSecret = this.configService.get<string>('JWT_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secrets are not configured properly');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      this.jwtService.signAsync(
        { sub: payload.sub, organizationId: payload.organizationId },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiresIn as any,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Helper to store hashed refresh token for revocation support.
   */
  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

  /**
   * Format UserSummary object.
   */
  private formatUserSummary(
    user: any,
    role: any,
    organization: any,
    activePlans: AppPlan[],
  ): UserSummary {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: {
        id: role.id,
        name: role.name,
        type: role.type,
        permissions: role.permissions,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        activePlans,
      },
    };
  }
}
