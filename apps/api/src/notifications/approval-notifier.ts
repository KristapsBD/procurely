import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import { PushOutbox } from './push-outbox';
import { PUSH_SENDER, type PushMessage, type PushSender } from './push-sender';

type Tx = Prisma.TransactionClient;

type TokenRow = { token: string };
const rowsToTokens = (rows: TokenRow[]) => rows.map((r) => r.token);

interface Notice {
  kind: PushMessage['data']['kind'];
  title: string;
  body: string;
  tokens: (tx: Tx) => Promise<string[]>;
}

/**
 * Tells approvers a requisition awaits them and the requester how it was decided. Called after
 * the change committed and never awaited by the request: a notification that cannot be
 * delivered is logged and lost, and the approval stands. Who receives is decided inside the
 * database (push_tokens_for_* run as the acting person), and only devices registered for the
 * requisition's company qualify. The text is fixed, so no supplier, amount or company name
 * leaves the API.
 */
@Injectable()
export class ApprovalNotifier implements OnModuleDestroy {
  private readonly log = new Logger(ApprovalNotifier.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly db: TenantDb,
    private readonly outbox: PushOutbox,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Called by the requester after submitting. */
  approvalRequested(scope: CompanyRequestScope, requisitionId: string): void {
    this.dispatch(scope, requisitionId, {
      kind: 'approval-requested',
      title: 'Approval needed',
      body: 'A requisition is waiting for your decision.',
      tokens: async (tx) =>
        rowsToTokens(
          await tx.$queryRaw<
            TokenRow[]
          >`SELECT push_tokens_for_approval(${requisitionId}::uuid) AS token`,
        ),
    });
  }

  /** Called by the approver or admin who decided. */
  decided(
    scope: CompanyRequestScope,
    requisitionId: string,
    outcome: 'APPROVED' | 'REJECTED',
  ): void {
    this.dispatch(scope, requisitionId, {
      kind: 'requisition-decided',
      title:
        outcome === 'APPROVED'
          ? 'Requisition approved'
          : 'Requisition rejected',
      body: 'Open Procurely to read the decision.',
      tokens: async (tx) =>
        rowsToTokens(
          await tx.$queryRaw<
            TokenRow[]
          >`SELECT push_tokens_for_decision(${requisitionId}::uuid) AS token`,
        ),
    });
  }

  /** Resolves when every notification started so far has been handled. For tests and shutdown. */
  async idle(): Promise<void> {
    await Promise.all([...this.inFlight]);
  }

  onModuleDestroy(): Promise<void> {
    return this.idle();
  }

  private dispatch(
    scope: CompanyRequestScope,
    requisitionId: string,
    notice: Notice,
  ): void {
    const work = this.deliver(scope, requisitionId, notice)
      .catch((error: unknown) => {
        this.log.warn(
          `Could not send ${notice.kind} for requisition ${requisitionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      })
      .finally(() => this.inFlight.delete(work));
    this.inFlight.add(work);
  }

  private async deliver(
    scope: CompanyRequestScope,
    requisitionId: string,
    notice: Notice,
  ): Promise<void> {
    const tokens = await this.db.run(scope, notice.tokens);
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      title: notice.title,
      body: notice.body,
      data: { kind: notice.kind, requisitionId, companyId: scope.companyId },
    }));
    if (messages.length === 0) return;
    if (this.config.devLoginEnabled) this.outbox.record(messages);
    await this.sender.send(messages);
  }
}
