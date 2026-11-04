import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { ZodError, type z } from 'zod';
import { PROBLEM_DEFAULTS, type ErrorCode } from '@fs/api-contract';

export class ProblemError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly issues?: unknown[],
    readonly messages?: { fr?: string; en?: string },
  ) {
    super(detail ?? code);
  }
}

export function sendProblem(reply: FastifyReply, err: ProblemError) {
  const d = PROBLEM_DEFAULTS[err.code];
  return reply
    .status(d.status)
    .type('application/problem+json')
    .send({
      type: `https://feasibility.studio/problems/${err.code.toLowerCase()}`,
      title: d.en,
      status: d.status,
      code: err.code,
      detail: err.detail,
      message_fr: err.messages?.fr ?? d.fr,
      message_en: err.messages?.en ?? d.en,
      ...(err.issues ? { issues: err.issues } : {}),
    });
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Error, req, reply) => {
    if (error instanceof ProblemError) return sendProblem(reply, error);
    if (error instanceof ZodError) {
      return sendProblem(
        reply,
        new ProblemError(
          'VALIDATION_FAILED',
          'Request validation failed',
          error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
    }
    const fe = error as FastifyError;
    if (fe.statusCode === 413 || fe.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return sendProblem(reply, new ProblemError('UPLOAD_TOO_LARGE'));
    }
    if (fe.statusCode && fe.statusCode < 500) {
      return sendProblem(reply, new ProblemError('VALIDATION_FAILED', fe.message));
    }
    req.log.error({ err: error }, 'unhandled error');
    return sendProblem(reply, new ProblemError('INTERNAL'));
  });
}

/** Parses input with a zod schema; failures become VALIDATION_FAILED problems. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  return schema.parse(input);
}
