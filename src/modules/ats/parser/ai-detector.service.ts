import { Injectable } from '@nestjs/common';

export interface AiDetectionResult {
  isAiGenerated: boolean;
  overallConfidence: number; // 0 to 100
  verdict: 'AI_GENERATED' | 'HUMAN_WRITTEN';
  sectionScores: {
    summary: number;
    projects: number;
    experience: number;
  };
  flaggedIndicators: string[];
  reason?: string;
}

@Injectable()
export class AiDetectorService {
  // Explicit AI artifacts and leakage markers
  private readonly AI_LEAKAGE_PATTERNS = [
    /as an ai( language model)?/i,
    /here (is|are) (a|the|your) (tailored|customized|crafted)? (resume|cv|summary)/i,
    /certainly!? here (is|are)/i,
    /\[insert (company|job|name|metric|date|title|url|phone)\]/i,
    /<insert (company|job|name|metric|date|title|url|phone)>/i,
    /i hope this resume helps you/i,
    /feel free to adjust any (details|metrics|sections)/i,
  ];

  // Characteristic AI/ChatGPT resume buzzwords and structural phrases
  private readonly AI_SIGNATURE_PHRASES = [
    'results-driven professional with a proven track record',
    'dynamic and results-oriented',
    'adept at leveraging cutting-edge',
    'spearheaded the orchestration of',
    'instrumental in driving synergies',
    'pivotal role in fostering',
    'harnessed the power of',
    'delved into',
    'testament to my commitment',
    'comprehensive suite of',
    'facilitated cross-functional collaboration',
    'seamlessly integrated',
    'spearheaded the development of scalable',
    'proven track record of facilitating',
    'fostering a culture of innovation',
    'demonstrated expertise in architecting',
    'navigating complex challenges',
    'driving transformative business outcomes',
    'passionate and forward-thinking',
  ];

  // Formulaic action + generic outcome + arbitrary percentage pattern
  private readonly FORMULAIC_AI_BULLET_PATTERN =
    /\b(spearheaded|orchestrated|leveraged|championed|revolutionized|streamlined)\b.*?\b(resulting in|driving|delivering|boosting|achieving)\b.*?\b(\d{1,3}%\s*(increase|boost|improvement|reduction|growth))\b/i;

  /**
   * Analyzes text across sections (Summary/Bio, Projects, Experience) for AI-generated writing.
   */
  detectAiContent(rawText: string): AiDetectionResult {
    const text = rawText || '';
    const flaggedIndicators: string[] = [];

    // 1. Check for hard AI leakage markers
    for (const pattern of this.AI_LEAKAGE_PATTERNS) {
      if (pattern.test(text)) {
        flaggedIndicators.push(`Explicit AI prompt residue detected: "${text.match(pattern)?.[0]}"`);
      }
    }

    if (flaggedIndicators.length > 0) {
      return {
        isAiGenerated: true,
        overallConfidence: 99,
        verdict: 'AI_GENERATED',
        sectionScores: { summary: 99, projects: 99, experience: 99 },
        flaggedIndicators,
        reason: 'Explicit AI generator prompt leakage detected in resume content',
      };
    }

    // 2. Extract sections
    const sections = this.extractSections(text);

    // 3. Score Summary / Bio
    const summaryScore = this.scoreTextSection(sections.summary, 'Summary/Bio', flaggedIndicators);

    // 4. Score Projects
    const projectsScore = this.scoreTextSection(sections.projects, 'Projects', flaggedIndicators);

    // 5. Score Work Experience
    const experienceScore = this.scoreTextSection(sections.experience, 'Experience', flaggedIndicators);

    // 6. Sentence burstiness / structural uniformity analysis
    const burstinessScore = this.analyzeBurstiness(text);
    if (burstinessScore.isLowBurstiness && text.length > 200) {
      flaggedIndicators.push('Unnaturally uniform sentence cadence and low structural variance (AI signature)');
    }

    // 7. Calculate aggregate confidence
    const maxSectionScore = Math.max(summaryScore, projectsScore, experienceScore);
    const avgScore = (summaryScore * 0.35 + projectsScore * 0.35 + experienceScore * 0.3);
    const overallConfidence = Math.min(
      100,
      Math.round(Math.max(maxSectionScore, avgScore + (burstinessScore.isLowBurstiness ? 15 : 0))),
    );

    // Threshold: >= 60% confidence or high individual section AI score flags AI content
    const isAiGenerated = overallConfidence >= 60 || summaryScore >= 75 || projectsScore >= 75;

    let reason: string | undefined;
    if (isAiGenerated) {
      if (summaryScore >= 75) {
        reason = 'AI-written content detected in Professional Summary / Bio section';
      } else if (projectsScore >= 75) {
        reason = 'AI-generated bullet points and formulaic descriptions detected in Projects section';
      } else if (experienceScore >= 75) {
        reason = 'AI-assisted writing patterns detected in Work Experience descriptions';
      } else {
        reason = 'High density of AI-signature phrasing and formulaic writing detected across resume';
      }
    }

    return {
      isAiGenerated,
      overallConfidence,
      verdict: isAiGenerated ? 'AI_GENERATED' : 'HUMAN_WRITTEN',
      sectionScores: {
        summary: summaryScore,
        projects: projectsScore,
        experience: experienceScore,
      },
      flaggedIndicators,
      reason,
    };
  }

  private scoreTextSection(sectionText: string, sectionName: string, indicators: string[]): number {
    if (!sectionText || sectionText.trim().length < 40) {
      return 0;
    }

    const lower = sectionText.toLowerCase();
    let score = 0;
    let matchedPhrases = 0;

    for (const phrase of this.AI_SIGNATURE_PHRASES) {
      if (lower.includes(phrase)) {
        matchedPhrases++;
        indicators.push(`AI phrase in ${sectionName}: "${phrase}"`);
      }
    }

    // Bullet-level formulaic checks
    const bullets = sectionText.split(/\n|•|\*/).filter((b) => b.trim().length > 20);
    let formulaicBullets = 0;

    for (const bullet of bullets) {
      if (this.FORMULAIC_AI_BULLET_PATTERN.test(bullet)) {
        formulaicBullets++;
        indicators.push(`Formulaic AI bullet in ${sectionName}: "${bullet.trim().substring(0, 70)}..."`);
      }
    }

    score += matchedPhrases * 25;
    score += formulaicBullets * 30;

    return Math.min(100, score);
  }

  private extractSections(text: string): { summary: string; projects: string; experience: string } {
    const summaryMatch = text.match(/(?:summary|about\s*me|bio|profile)[\s\S]*?(?=(?:experience|employment|projects|education|skills|$))/i);
    const projectsMatch = text.match(/(?:projects|key\s*projects|personal\s*projects)[\s\S]*?(?=(?:experience|education|skills|certifications|$))/i);
    const expMatch = text.match(/(?:experience|work\s*history|employment)[\s\S]*?(?=(?:projects|education|skills|certifications|$))/i);

    return {
      summary: summaryMatch ? summaryMatch[0] : text.substring(0, 300),
      projects: projectsMatch ? projectsMatch[0] : '',
      experience: expMatch ? expMatch[0] : text,
    };
  }

  private analyzeBurstiness(text: string): { isLowBurstiness: boolean; stdDev: number } {
    const sentences = text
      .split(/[.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    if (sentences.length < 5) {
      return { isLowBurstiness: false, stdDev: 0 };
    }

    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const mean = lengths.reduce((acc, l) => acc + l, 0) / lengths.length;
    const variance =
      lengths.reduce((acc, l) => acc + Math.pow(l - mean, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    // AI generated text typically has a very uniform sentence length (low std dev < 4.0 with length > 12)
    const isLowBurstiness = stdDev < 4.0 && mean > 12;

    return { isLowBurstiness, stdDev };
  }
}
