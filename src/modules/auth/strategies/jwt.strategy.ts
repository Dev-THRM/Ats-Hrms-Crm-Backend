import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    const secret =
      configService?.get<string>('JWT_SECRET') ||
      process.env.JWT_SECRET ||
      'fallback_secret';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: true,
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
              select: { activePlans: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }

    const activePlans = user.organization.subscriptions.flatMap(
      (s) => s.activePlans,
    );

    return {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      organizationSlug: user.organization.slug,
      roleId: user.roleId,
      roleType: user.role.type,
      permissions: user.role.permissions,
      activePlans,
    };
  }
}
