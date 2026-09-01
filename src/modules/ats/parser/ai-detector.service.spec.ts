import { describe, it, expect, beforeEach } from 'vitest';
import { AiDetectorService } from './ai-detector.service.js';

describe('AiDetectorService', () => {
  let service: AiDetectorService;

  beforeEach(() => {
    service = new AiDetectorService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should detect explicit AI prompt leakage markers', () => {
    const aiText = `
      Certainly! Here is a tailored resume for the Senior Software Engineer position:
      [Insert Name] - [Insert Email]
      Experience:
      Built scalable cloud microservices.
    `;

    const result = service.detectAiContent(aiText);
    expect(result.isAiGenerated).toBe(true);
    expect(result.overallConfidence).toBe(99);
    expect(result.verdict).toBe('AI_GENERATED');
    expect(result.flaggedIndicators.length).toBeGreaterThan(0);
  });

  it('should detect AI-written bio and formulaic project descriptions', () => {
    const aiText = `
      Professional Summary:
      Results-driven professional with a proven track record of orchestrating synergies across distributed teams.
      Adept at leveraging cutting-edge cloud architectures to drive transformative business outcomes.

      Key Projects:
      • Spearheaded the orchestration of enterprise microservices resulting in a 40% boost in efficiency.
      • Instrumental in driving synergies across product engineering, delved into Kubernetes clusters.
    `;

    const result = service.detectAiContent(aiText);
    expect(result.isAiGenerated).toBe(true);
    expect(result.overallConfidence).toBeGreaterThanOrEqual(60);
    expect(result.sectionScores.summary).toBeGreaterThanOrEqual(50);
    expect(result.sectionScores.projects).toBeGreaterThanOrEqual(50);
    expect(result.verdict).toBe('AI_GENERATED');
  });

  it('should pass genuine human resume content', () => {
    const humanText = `
      Alex Rivers
      alex.rivers@example.com | (555) 123-4567 | San Francisco, CA
      github.com/alexrivers | linkedin.com/in/alexrivers

      Work Experience:
      Staff Software Engineer at Acme Corp (2021 - Present)
      - Maintained PostgreSQL clusters and tuned slow SQL queries reducing p99 latency to 12ms.
      - Wrote Go CLI tools used by 45 internal developers daily for staging deployments.
      - Refactored payment retry worker queue reducing dead-letter errors.

      Backend Developer at Beta Tech (2018 - 2021)
      - Implemented authentication microservice in TypeScript and NestJS.
      - Migrated user data from Redis to DynamoDB with zero downtime.

      Skills: TypeScript, Go, PostgreSQL, Redis, Docker, Git.
      Education: B.S. Computer Science, UC Berkeley.
    `;

    const result = service.detectAiContent(humanText);
    expect(result.isAiGenerated).toBe(false);
    expect(result.verdict).toBe('HUMAN_WRITTEN');
    expect(result.overallConfidence).toBeLessThan(50);
  });
});
