import { describe, it, expect, beforeEach } from 'vitest';
import { ResumeParserService } from './resume-parser.service.js';

describe('ResumeParserService', () => {
  let service: ResumeParserService;

  beforeEach(() => {
    service = new ResumeParserService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse structured skills, contact details, and experience from text', () => {
    const text = `
      Jane Doe
      Email: jane.doe@example.com
      Phone: (415) 555-0199
      LinkedIn: https://linkedin.com/in/janedoe
      GitHub: https://github.com/janedoe

      Summary:
      Senior backend developer with 6+ years of experience building microservices.

      Skills: TypeScript, NestJS, PostgreSQL, Redis, Docker, Kubernetes, AWS, React.

      Education: Bachelor of Science in Computer Science
    `;

    const parsed = service.parseResumeText(text);

    expect(parsed.candidateInfo.email).toBe('jane.doe@example.com');
    expect(parsed.candidateInfo.phone).toBe('(415) 555-0199');
    expect(parsed.candidateInfo.linkedinUrl).toContain('janedoe');
    expect(parsed.candidateInfo.githubUrl).toContain('janedoe');
    expect(parsed.skills).toContain('TypeScript');
    expect(parsed.skills).toContain('NestJS');
    expect(parsed.skills).toContain('PostgreSQL');
    expect(parsed.skills).toContain('AWS');
    expect(parsed.experienceYears).toBe(6);
    expect(parsed.education).toContain("Bachelor's Degree");
  });

  it('should calculate high ATS score for matching job requirements', () => {
    const parsed = {
      rawText: 'Senior engineer specializing in TypeScript, React, and Node.js with 5 years of experience',
      candidateInfo: {},
      skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
      experienceYears: 5,
      education: ["Bachelor's Degree"],
    };

    const job = {
      title: 'Senior TypeScript Engineer',
      description: 'Looking for a Senior TypeScript developer with React, Node.js, and PostgreSQL expertise',
      department: 'Engineering',
      experienceMin: 4,
      experienceMax: 7,
    };

    const result = service.calculateAtsScore(parsed, job);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.matchedSkills).toContain('TypeScript');
    expect(result.matchedSkills).toContain('React');
    expect(result.experienceMatchScore).toBe(100);
  });
});
