import { scheduledJob } from "../_shared/jobs.ts";
import { buildMarketEvidence } from "../_shared/marketEvidence.ts";
import {
  analyseVerifiedFacts,
  modelConfigurations,
  ModelError,
} from "../_shared/marketAnalyst.ts";
import { parseAiInput } from "../_shared/analysis.ts";
export async function handler(req: Request) {
  return scheduledJob(req, "generate-market-report", async (db) => {
    if (!modelConfigurations().length)
      return { rows: 0, status: "partial", code: "ai_not_configured" };
    const input = parseAiInput({
      question:
        "Подготовь проверяемое заключение по всему доступному рынку металлов, отделив факты, риски, сценарии и недостающие сведения.",
      period: "3M",
    });
    const evidence = await buildMarketEvidence(db, input);
    try {
      const result = await analyseVerifiedFacts(db, {
        facts: evidence.facts,
        question: input.question,
        scope: {
          period: input.period,
          start: evidence.start.slice(0, 10),
          end: evidence.end.slice(0, 10),
          coverage: evidence.coverage,
        },
        automatic: true,
      });
      return {
        rows: result.cached ? 0 : 1,
        details: { cached: result.cached, model: result.report.model },
      };
    } catch (e) {
      if (e instanceof ModelError)
        return { rows: 0, status: "partial", code: e.code };
      throw e;
    }
  });
}
