import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { JobStatus, ApplicationStatus, InterviewStatus } from '@prisma/client';

@Injectable()
export class AtsDashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Aggregates real-time KPIs, funnel analytics, candidate source distribution,
   * recent applications, and upcoming interviews for an organization.
   */
  async getDashboardMetrics(organizationId: string) {
    const now = new Date();

    const [
      activeJobsCount,
      totalJobsCount,
      totalCandidates,
      activeApplications,
      hiredCount,
      rejectedCount,
      upcomingInterviewsCount,
      applicationsByStage,
      candidatesBySource,
      recentApplications,
      upcomingInterviews,
    ] = await Promise.all([
      // 1. Active jobs
      this.prisma.job.count({
        where: { organizationId, status: JobStatus.OPEN },
      }),
      // 2. Total jobs
      this.prisma.job.count({
        where: { organizationId },
      }),
      // 3. Total candidates
      this.prisma.candidate.count({
        where: { organizationId },
      }),
      // 4. Active applications
      this.prisma.application.count({
        where: { organizationId, status: ApplicationStatus.ACTIVE },
      }),
      // 5. Hired count
      this.prisma.application.count({
        where: { organizationId, status: ApplicationStatus.HIRED },
      }),
      // 6. Rejected count
      this.prisma.application.count({
        where: { organizationId, status: ApplicationStatus.REJECTED },
      }),
      // 7. Upcoming scheduled interviews
      this.prisma.interview.count({
        where: {
          organizationId,
          status: InterviewStatus.SCHEDULED,
          scheduledAt: { gte: now },
        },
      }),
      // 8. Applications grouped by current stage
      this.prisma.application.findMany({
        where: { organizationId },
        select: {
          currentStage: {
            select: {
              name: true,
            },
          },
          status: true,
        },
      }),
      // 9. Candidates grouped by source
      this.prisma.candidate.findMany({
        where: { organizationId },
        select: {
          source: true,
        },
      }),
      // 10. Top 5 recent applications
      this.prisma.application.findMany({
        where: { organizationId },
        take: 5,
        orderBy: { appliedAt: 'desc' },
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
              department: true,
            },
          },
          currentStage: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      // 11. Top 5 upcoming interviews
      this.prisma.interview.findMany({
        where: {
          organizationId,
          status: InterviewStatus.SCHEDULED,
          scheduledAt: { gte: now },
        },
        take: 5,
        orderBy: { scheduledAt: 'asc' },
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
            },
          },
          interviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    // Aggregate pipeline funnel stage counts
    const stageCounts: Record<string, number> = {};
    for (const app of applicationsByStage) {
      const stageName = app.currentStage?.name || 'Applied';
      stageCounts[stageName] = (stageCounts[stageName] || 0) + 1;
    }

    const pipelineFunnel = Object.entries(stageCounts).map(([stage, count]) => ({
      stage,
      count,
    }));

    // Aggregate candidate source distribution
    const sourceCounts: Record<string, number> = {};
    for (const cand of candidatesBySource) {
      const src = cand.source || 'CAREER_PORTAL';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }

    const sourcesBreakdown = Object.entries(sourceCounts).map(([source, count]) => ({
      source,
      count,
      percentage: totalCandidates > 0 ? Math.round((count / totalCandidates) * 100) : 0,
    }));

    return {
      kpis: {
        activeJobsCount,
        totalJobsCount,
        totalCandidates,
        activeApplications,
        hiredCount,
        rejectedCount,
        upcomingInterviewsCount,
      },
      pipelineFunnel,
      sourcesBreakdown,
      recentApplications: recentApplications.map((app) => ({
        id: app.id,
        candidateName: `${app.candidate.firstName} ${app.candidate.lastName}`,
        candidateEmail: app.candidate.email,
        jobTitle: app.job.title,
        department: app.job.department,
        currentStage: app.currentStage.name,
        status: app.status,
        atsScore: app.atsScore,
        appliedAt: app.appliedAt,
      })),
      upcomingInterviews: upcomingInterviews.map((item) => ({
        id: item.id,
        title: item.title,
        candidateName: `${item.candidate.firstName} ${item.candidate.lastName}`,
        jobTitle: item.job.title,
        scheduledAt: item.scheduledAt,
        durationMinutes: item.durationMinutes,
        meetingLink: item.meetingLink,
        interviewer: item.interviewer
          ? `${item.interviewer.firstName} ${item.interviewer.lastName}`
          : 'Unassigned',
      })),
    };
  }
}
