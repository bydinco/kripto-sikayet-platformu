// Hand-written response shapes. `api-types.ts` (generated from the live
// OpenAPI doc) only has real types for request bodies/query params — the
// API controllers don't declare @ApiOkResponse DTOs yet, so every response
// schema there is `content?: never`. These mirror the actual JSON the API
// returns (known from apps/api's Prisma schema + services).

export type Role = 'USER' | 'ENTITY_OWNER' | 'EDITOR' | 'MODERATOR' | 'ADMIN';

export type EntityType =
  | 'COIN'
  | 'EXCHANGE'
  | 'DEX'
  | 'WALLET'
  | 'DEFI_PROTOCOL'
  | 'NFT_PROJECT'
  | 'LAUNCHPAD'
  | 'INFLUENCER'
  | 'SIGNAL_GROUP'
  | 'INVESTMENT_PLATFORM'
  | 'MINING_PLATFORM'
  | 'AIRDROP'
  | 'OTHER';

export type ReportCategory =
  | 'RUG_PULL'
  | 'WITHDRAWAL_BLOCKED'
  | 'ACCOUNT_FROZEN'
  | 'HIDDEN_FEES'
  | 'FALSE_PROMOTION'
  | 'UNDISCLOSED_SPONSORSHIP'
  | 'FAKE_GUARANTEE'
  | 'PHISHING_IMPERSONATION'
  | 'HONEYPOT'
  | 'FAKE_DEVICE'
  | 'FUNDS_LOST_AFTER_SETUP'
  | 'SUPPORT_UNRESPONSIVE'
  | 'DELIVERY_PROBLEM'
  | 'FAKE_AIRDROP'
  | 'PONZI_PATTERN'
  | 'OTHER';

export type ReportStatus =
  | 'PENDING'
  | 'NEEDS_EVIDENCE'
  | 'PUBLISHED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'REJECTED'
  | 'REMOVED';

export type EvidenceType =
  | 'TX_HASH'
  | 'WALLET_ADDRESS'
  | 'SCREENSHOT'
  | 'LINK'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'INVOICE';

export type LinkKind =
  | 'WEBSITE'
  | 'X'
  | 'TELEGRAM'
  | 'DISCORD'
  | 'YOUTUBE'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'GITHUB'
  | 'DOCS'
  | 'APP_STORE'
  | 'PLAY_STORE'
  | 'OTHER';

export type NoticeType = 'REMOVAL_REQUEST' | 'CORRECTION_REQUEST' | 'COURT_ORDER' | 'PRIVACY_REQUEST' | 'COPYRIGHT';

export type NoticeStatus = 'RECEIVED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';

export type ModerationAction =
  | 'APPROVE'
  | 'REQUEST_EVIDENCE'
  | 'REJECT'
  | 'REMOVE'
  | 'RESTORE'
  | 'FLAG_LEGAL'
  | 'EDIT';

export type StatusActorType = 'MODERATOR' | 'AUTHOR' | 'ENTITY' | 'SYSTEM';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH_RISK_SIGNAL' | 'CRITICAL_SIGNAL' | 'INSUFFICIENT_DATA';

export interface ApiUser {
  id: string;
  email?: string; // only present for the owner/an admin
  handle: string;
  role: Role;
  locale: string;
  country: string | null;
  trustScore: number;
  emailVerified: boolean;
  createdAt: string;
  deletedAt: string | null;
}

// responseRatePct/resolutionRatePct/avgResponseHours/avgSatisfaction are
// Prisma Decimal fields: Decimal.toJSON() serializes as a numeric STRING,
// not a JS number — parse with Number(...) before doing math on them.
export interface ApiEntityStats {
  totalReports: number;
  respondedReports: number;
  resolvedReports: number;
  responseRatePct: string;
  resolutionRatePct: string;
  avgResponseHours: string | null;
  avgSatisfaction: string | null;
  computedAt: string;
}

export interface ApiEntityLink {
  id: string;
  entityId: string;
  kind: LinkKind;
  url: string;
  handle: string | null;
  followers: number | null;
  verifiedByUs: boolean;
}

export interface ApiContractAudit {
  id: string;
  ownerRenounced: boolean | null;
  isHoneypot: boolean | null;
  liquidityLocked: boolean | null;
  liquidityUsd: string | null;
  top10HolderPct: string | null;
  buyTaxPct: string | null;
  sellTaxPct: string | null;
  isProxy: boolean | null;
  scannedAt: string;
}

export interface ApiCoin {
  id: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
  audits: ApiContractAudit[];
}

export interface ApiEntity {
  id: string;
  type: EntityType;
  status: string;
  slug: string;
  name: string;
  summary: string | null;
  logoUrl: string | null;
  country: string | null;
  foundedAt: string | null;
  tags: string[];
  verified: boolean;
  verifiedAt: string | null;
  ownerId: string | null;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  stats: ApiEntityStats | null;
  links: ApiEntityLink[];
  coin: ApiCoin | null;
}

export interface ApiReport {
  id: string;
  entityId: string;
  authorId: string;
  category: ReportCategory;
  title: string;
  body: string;
  locale: string;
  lossUsd: string | null;
  incidentAt: string | null;
  status: ReportStatus;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string;
  resolvedAt: string | null;
  satisfactionRating: number | null;
  satisfactionNote: string | null;
  resolutionRequestedAt: string | null;
  // Present only when a MODERATOR/ADMIN fetches this report: the statuses
  // the state machine allows next for their role.
  allowedTransitions?: ReportStatus[];
}

export type ReportStatusCounts = Record<ReportStatus, number>;

export interface ApiReportStatusHistory {
  id: string;
  reportId: string;
  fromStatus: ReportStatus;
  toStatus: ReportStatus;
  actorId: string;
  actorType: StatusActorType;
  reason: string | null;
  createdAt: string;
}

export interface ApiModerationLog {
  id: string;
  reportId: string | null;
  postId: string | null;
  moderatorId: string;
  action: ModerationAction;
  reason: string | null;
  createdAt: string;
}

export interface ApiNotice {
  id: string;
  type: NoticeType;
  status: NoticeStatus;
  reportId: string | null;
  postId: string | null;
  entityId: string | null;
  submitterName: string;
  submitterEmail: string;
  claim: string;
  legalBasis: string | null;
  courtOrderRef: string | null;
  receivedAt: string;
  dueAt: string | null;
  decidedAt: string | null;
  decision: string | null;
  handlerId: string | null;
}

export interface ApiRiskFactorDef {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: string; // Decimal -> string, see ApiEntityStats note
  maxPoints: number;
  dataSource: string | null;
}

export interface ApiRiskModel {
  id: string;
  entityType: EntityType;
  version: number;
  methodology: string | null;
  active: boolean;
  publishedAt: string | null;
  factors?: ApiRiskFactorDef[];
}

export interface ApiRiskScoreFactor {
  id: string;
  points: string; // Decimal -> string
  rawValue: string | null;
  note: string | null;
  factor: ApiRiskFactorDef;
}

export interface ApiRiskScore {
  id: string;
  entityId: string;
  modelId: string;
  score: number | null; // null when level is INSUFFICIENT_DATA
  level: RiskLevel;
  confidence: number;
  computedAt: string;
  factors: ApiRiskScoreFactor[];
  model: ApiRiskModel;
  // Present only on GET /scoring/top.
  entity?: { id: string; name: string; slug: string; type: EntityType };
}

export interface ApiEvidence {
  id: string;
  reportId: string;
  type: EvidenceType;
  value: string | null;
  fileUrl: string | null;
  chainId: string | null;
  verifiedOnChain: boolean;
  approved: boolean;
  createdAt: string;
}

export interface ApiEntityResponse {
  id: string;
  reportId: string;
  entityId: string;
  authorId: string;
  body: string;
  isDispute: boolean;
  createdAt: string;
  disputed: boolean;
}

export interface LoginResult {
  accessToken: string;
  user: ApiUser;
}

export interface RefreshResult {
  accessToken: string;
}

export interface ApiErrorBody {
  message: string | string[];
  error?: string;
  statusCode?: number;
  existingReportId?: string;
}
