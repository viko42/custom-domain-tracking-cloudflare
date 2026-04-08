import type { SubdomainStatus } from "./subdomain.js";

export interface TrackingOpenEvent {
  type: "tracking.open";
  trackingId: string;
  hostname: string;
  timestamp: string;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  payload: Record<string, unknown>;
}

export interface TrackingClickEvent {
  type: "tracking.click";
  linkId: string;
  destinationUrl: string;
  hostname: string;
  timestamp: string;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  payload: Record<string, unknown>;
}

export interface DomainVerifiedEvent {
  type: "domain.verified";
  hostname: string;
  cfCustomHostnameId: string;
  timestamp: string;
}

export interface DomainFailedEvent {
  type: "domain.failed";
  hostname: string;
  cfCustomHostnameId: string;
  errors: string[];
  timestamp: string;
}

export interface DomainHeartbeatEvent {
  type: "domain.heartbeat";
  hostname: string;
  cfCustomHostnameId: string;
  timestamp: string;
}

export interface DomainDisconnectedEvent {
  type: "domain.disconnected";
  hostname: string;
  cfCustomHostnameId: string;
  previousStatus: SubdomainStatus;
  timestamp: string;
}

export type WebhookEvent =
  | TrackingOpenEvent
  | TrackingClickEvent
  | DomainVerifiedEvent
  | DomainFailedEvent
  | DomainHeartbeatEvent
  | DomainDisconnectedEvent;

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  sentAt: string;
}
