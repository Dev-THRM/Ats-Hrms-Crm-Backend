import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppPlan } from '@prisma/client';
import { REQUIRES_PLAN_KEY } from '../decorators/requires-plan.decorator.js';

@Injectable()
export class PlanGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredPlans = this.reflector.getAllAndOverride<(AppPlan | string)[]>(
      REQUIRES_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no plan restriction is set on the route/controller, allow access
    if (!requiredPlans || requiredPlans.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Access denied: User is not authenticated for plan verification',
      );
    }

    const userActivePlans: string[] = (user.activePlans || []).map((p: any) =>
      String(p).toUpperCase(),
    );

    // Check if at least one of the required plans is active in the organization's subscription
    const hasRequiredPlan = requiredPlans.some((requiredPlan) =>
      userActivePlans.includes(String(requiredPlan).toUpperCase()),
    );

    if (!hasRequiredPlan) {
      const planNames = requiredPlans.map(String).join(' / ');
      throw new ForbiddenException(
        `Access denied: Your organization does not have an active subscription for the [${planNames}] module. Please upgrade your subscription to access this feature.`,
      );
    }

    return true;
  }
}
