/**
 * Vocabulary shared with the challenge package (metadata/taxonomy.md).
 * Detection output uses exactly these strings so organiser tooling can score it.
 */
import { z } from "zod";

export const PRIVACY_ROLES = [
  "direct_identifier",
  "quasi_identifier",
  "sensitive_attribute",
  "technical_identifier",
  "record_key",
  "free_text",
  "non_sensitive",
  "unknown",
] as const;
export const PrivacyRoleSchema = z.enum(PRIVACY_ROLES);
export type PrivacyRole = z.infer<typeof PrivacyRoleSchema>;

export const SUBTYPES = [
  "PERSON_NAME", "NATIONAL_ID", "EMAIL", "PHONE", "STREET_ADDRESS", "POSTCODE", "MUNICIPALITY", "GPS_COORDINATE",
  "LOCATION_NAME", "BIRTH_DATE", "AGE", "SEX", "LANGUAGE", "NATIONALITY", "IBAN", "PAYMENT_CARD", "CUSTOMER_ID",
  "ACCOUNT_ID", "EMPLOYEE_ID", "STUDENT_ID", "PATIENT_ID", "CARD_ID", "DEVICE_ID", "IP_ADDRESS", "MAC_ADDRESS",
  "IMEI", "HOSTNAME", "USERNAME", "URL", "USER_AGENT", "LICENSE_PLATE", "PROPERTY_ID", "METER_ID", "TIMESTAMP",
  "DATE", "DURATION", "HEALTH_DATA", "DIAGNOSIS_CODE", "FINANCIAL_DATA", "EDUCATION_DATA", "SOCIAL_DATA",
  "OCCUPATION", "ORG_NAME", "MEASUREMENT", "CATEGORY", "AGGREGATE", "SECRET", "FREE_TEXT", "RECORD_ID", "OTHER",
] as const;
export const SubtypeSchema = z.enum(SUBTYPES);
export type Subtype = z.infer<typeof SubtypeSchema>;

export const SPAN_LABELS = [
  "PERSON", "NATIONAL_ID", "EMAIL", "PHONE", "ADDRESS", "LOCATION", "DATE", "AGE", "IBAN", "PAYMENT_CARD",
  "ACCOUNT_NUMBER", "IP_ADDRESS", "LICENSE_PLATE", "ORG", "URL", "USERNAME", "SECRET", "HEALTH", "DEVICE_ID", "PROPERTY_ID",
] as const;
export const SpanLabelSchema = z.enum(SPAN_LABELS);
export type SpanLabel = z.infer<typeof SpanLabelSchema>;

/** Span labels that identify a person on their own or are secrets: never allowed to survive verbatim. */
export const HARD_SPAN_LABELS: readonly SpanLabel[] = [
  "NATIONAL_ID", "EMAIL", "PHONE", "IBAN", "PAYMENT_CARD", "SECRET", "ACCOUNT_NUMBER", "DEVICE_ID", "IP_ADDRESS",
  "USERNAME", "LICENSE_PLATE", "PROPERTY_ID", "URL",
];

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"] as const;
export const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof ConfidenceSchema>;
