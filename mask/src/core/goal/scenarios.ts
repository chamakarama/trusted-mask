/**
 * Hand-mapped GoalSpecs for the 27 TrustED PETs proving-ground sharing scenarios
 * (metadata/scenarios.json), with the utility tasks (toolkit/pets_eval/utility/*.py) translated into
 * measures, groupings and required columns. Column names follow metadata/field_catalog.csv.
 *
 * SCENARIO_TEXTS holds three natural-language paraphrases per scenario: how a user might type the goal.
 * They are used for scenario matching, matching tests and goal-variant generation for training.
 */
import type { GoalSpec, LocationResolution, OutputForm, TaskKind, TextNeed, TimeResolution, TrustLevel } from "@/contracts";
import { withGoalId } from "./spec";

export const SCENARIO_SPEC_VERSION = "1.0.0";

export type ScenarioDataset =
  | "health" | "mobility" | "smart_city" | "energy" | "finance" | "cyber" | "education" | "public_admin" | "customer_service";

export interface ScenarioMeta {
  id: string;
  dataset: ScenarioDataset;
  title: string;
  recipient: string;
  purpose: string;
  utilityTasks: string[];
  privacyTargets: string;
}

interface ScenarioInput {
  meta: ScenarioMeta;
  kind: TaskKind;
  description: string;
  trust: TrustLevel;
  outputForm: OutputForm;
  measures: string[];
  groupings: string[];
  time?: TimeResolution;
  location?: LocationResolution;
  ageBandYears?: number;
  requiredFields: string[];
  linkage: GoalSpec["linkage"];
  textNeed: TextNeed;
  exclusions: string[];
  threats: string[];
  notes?: string[];
}

function build(s: ScenarioInput): GoalSpec {
  const resolution: GoalSpec["resolution"] = {};
  if (s.time) resolution.time = s.time;
  if (s.location) resolution.location = s.location;
  if (s.ageBandYears !== undefined) resolution.ageBandYears = s.ageBandYears;
  return withGoalId({
    version: 1,
    rawText: s.meta.purpose,
    task: { kind: s.kind, description: s.description },
    recipient: { description: s.meta.recipient, trustLevel: s.trust },
    outputForm: s.outputForm,
    measures: s.measures,
    groupings: s.groupings,
    resolution,
    requiredFields: s.requiredFields,
    linkage: s.linkage,
    textNeed: s.textNeed,
    exclusions: s.exclusions,
    threatAssumptions: s.threats,
    unresolved: [],
    provenance: {
      interpreter: "scenario",
      version: SCENARIO_SPEC_VERSION,
      scenarioMatch: s.meta.id,
      notes: [`hand-mapped from scenarios.json (${s.meta.utilityTasks.join(", ")}): ${s.meta.privacyTargets}`, ...(s.notes ?? [])],
    },
  });
}

const SPECIAL = "special_category";

const INPUTS: ScenarioInput[] = [
  // ---------------------------------------------------------------- health
  {
    meta: { id: "HEALTH-S1", dataset: "health", title: "Secondary-use research in a controlled environment", recipient: "University research group studying ED crowding and revisits", purpose: "Analyse length of stay, revisits and diagnosis patterns", utilityTasks: ["H-U2", "H-U4", "H-U6", "H-U7", "H-U8"], privacyTargets: "No direct identifiers; consistent pseudonymous patient key; k>=5 on (age band, sex, municipality, arrival week); free text redacted." },
    kind: "research", description: "analyse length of stay, revisits and diagnosis patterns", trust: "controlled_research", outputForm: "row_level",
    measures: ["median length of stay by triage level", "diagnosis-group mix by municipality", "30-day revisit rate by age band", "CRP vs temperature by diagnosis group", "hour-of-day arrival curve"],
    groupings: ["triage", "municipality", "age", "icd10_primary"],
    time: "week", location: "municipality", ageBandYears: 10,
    requiredFields: ["triage", "los_minutes", "arrival_ts", "discharge_ts", "municipality", "icd10_primary", "readmit_30d", "patient_hetu", "age", "date_of_birth", "temp_c", "ed_visits.visit_id", "lab_results.visit_id", "lab_results.value", "test_code"],
    linkage: "across_tables", textNeed: "topic_only", exclusions: [],
    threats: ["researcher may link quasi-identifiers (age, sex, municipality, arrival time) with public directory, health news clips and social posts"],
    notes: ["arrival week follows the k>=5 target; the hour-of-day curve (H-U8) would need hour resolution, so it trades off against k-anonymity"],
  },
  {
    meta: { id: "HEALTH-S2", dataset: "health", title: "Public weekly dashboard", recipient: "Anyone (open data portal)", purpose: "Weekly ED load, influenza-like illness and injury trends by age band and municipality", utilityTasks: ["H-U1", "H-U8", "H-DP"], privacyTargets: "Aggregate only; DP with stated epsilon or suppression of cells <5 with complementary suppression." },
    kind: "statistics", description: "publish weekly ED load, influenza-like illness and injury trends", trust: "public", outputForm: "aggregate",
    measures: ["weekly ED visit counts", "weekly influenza-like-illness visits by 10-year age band", "injury trends by municipality", "hour-of-day arrival curve"],
    groupings: ["arrival_ts", "age", "municipality", "icd10_primary"],
    time: "week", location: "municipality", ageBandYears: 10,
    requiredFields: ["arrival_ts", "date_of_birth", "age", "icd10_primary", "municipality"],
    linkage: "none", textNeed: "none", exclusions: [],
    threats: ["any outsider with news clips, social posts and the public directory", "differencing attacks across weekly releases"],
  },
  {
    meta: { id: "HEALTH-S3", dataset: "health", title: "AI vendor training a triage-support model", recipient: "External AI vendor under a data-processing agreement", purpose: "Train a model predicting admission from triage-time information", utilityTasks: ["H-U3", "H-U5", "H-U2"], privacyTargets: "Synthetic or strongly generalised training table without free text; MIA AUC close to 0.5; DCR check." },
    kind: "model_training", description: "train a model predicting admission from triage-time information", trust: "contractual", outputForm: "row_level",
    measures: ["admission prediction from triage-time information", "distributions of systolic BP, heart rate, temperature and SpO2", "median length of stay by triage level"],
    groupings: ["triage"],
    ageBandYears: 5,
    requiredFields: ["disposition", "triage", "age", "sex", "arrival_mode", "icd10_primary", "systolic_bp", "heart_rate", "temp_c", "spo2", "los_minutes"],
    linkage: "none", textNeed: "none", exclusions: [],
    threats: ["vendor staff or a breach at the vendor", "membership inference on the training data", "memorised rare patients"],
  },
  // ---------------------------------------------------------------- mobility
  {
    meta: { id: "MOB-S1", dataset: "mobility", title: "Open data: public-transport origin-destination matrices", recipient: "Anyone (municipal open data portal, CC BY 4.0)", purpose: "Publish weekly OD flows between areas by hour band for journey planners, researchers and citizens.", utilityTasks: ["MOB-U1", "MOB-U2", "MOB-U3"], privacyTargets: "No row-level data; no card ids; suppress or noise OD cells < 10 trips; consider DP counts." },
    kind: "statistics", description: "publish weekly origin-destination flows between areas by hour band", trust: "public", outputForm: "aggregate",
    measures: ["weekday OD matrix area x area x hour band", "weekday boardings by line x hour", "daily boardings time series"],
    groupings: ["stop_id", "line", "ts"],
    time: "hour",
    requiredFields: ["card_id", "ts", "stop_id", "line"],
    linkage: "none", textNeed: "none", exclusions: [SPECIAL],
    threats: ["any outsider with the public directory, social check-ins and a fitness-app leak", "someone who sees a neighbour at a stop"],
    notes: ["trip chaining (linking taps of one card) happens before aggregation, inside the controller"],
  },
  {
    meta: { id: "MOB-S2", dataset: "mobility", title: "Urban planning consultancy: row-level journeys under contract", recipient: "Planning consultancy (processor under a data processing agreement)", purpose: "Redesign of the bus network: transfers, commuting corridors, peak loads.", utilityTasks: ["MOB-U1", "MOB-U2", "MOB-U4", "MOB-U5"], privacyTargets: "Keyed card pseudonyms rotated per week; no holder fields; times rounded to 5-15 min; trajectory unicity < 5 %." },
    kind: "research", description: "analyse transfers, commuting corridors and peak loads for the bus network redesign", trust: "contractual", outputForm: "row_level",
    measures: ["weekday OD matrix with transfers", "boardings by line x hour", "bike trip duration distribution", "home-area to work-area commuting flows"],
    groupings: ["stop_id", "line", "ts"],
    time: "15min",
    requiredFields: ["card_id", "ts", "stop_id", "line", "duration_s"],
    linkage: "within_table", textNeed: "none", exclusions: [SPECIAL],
    threats: ["curious analyst at the consultancy with the public directory and social check-ins trying to single out riders"],
    notes: ["linking the same card within a day is needed for transfers; across weeks it mostly adds risk"],
  },
  {
    meta: { id: "MOB-S3", dataset: "mobility", title: "Academic research on mobility and bikes", recipient: "University research group (controlled research environment)", purpose: "Study mode choice between bus and city bike, weather effects, commuting distances.", utilityTasks: ["MOB-U4", "MOB-U6", "MOB-U7", "MOB-U8"], privacyTargets: "No email-like accounts; GPS start/end snapped to >=250 m grid or zones; k>=5 on (home area, work area, card type)." },
    kind: "research", description: "study mode choice between bus and city bike, weather effects and commuting distances", trust: "controlled_research", outputForm: "row_level",
    measures: ["bike trip duration distribution", "bike starts by zone x hour band", "bike ridden-distance distribution", "card-type mix"],
    groupings: ["start_station", "start_ts", "card_type"],
    time: "hour", location: "postcode",
    requiredFields: ["duration_s", "distance_m", "start_station", "start_lat", "start_lon", "start_ts", "card_type"],
    linkage: "within_table", textNeed: "none", exclusions: [],
    threats: ["researcher with all public adversary files", "colleague knowledge of employer and arrival time"],
    notes: ["GPS snapped to a >=250 m grid or zones is approximated as postcode-level location"],
  },
  // ---------------------------------------------------------------- smart city
  {
    meta: { id: "CITY-S1", dataset: "smart_city", title: "Open data: city-centre footfall", recipient: "Anyone (open data portal)", purpose: "Publish hourly footfall by zone for businesses, events and citizens.", utilityTasks: ["CITY-U1", "CITY-U5"], privacyTargets: "Hourly zone-level counts only; suppress or noise counts < 5; no MACs, no SSIDs." },
    kind: "statistics", description: "publish hourly footfall by zone", trust: "public", outputForm: "aggregate",
    measures: ["footfall by zone x hour x weekday/weekend", "Black Friday uplift vs previous Friday"],
    groupings: ["zone", "sensor_id", "interval_start"],
    time: "hour",
    requiredFields: ["sensor_id", "zone", "interval_start", "device_count"],
    linkage: "none", textNeed: "none", exclusions: [SPECIAL],
    threats: ["outsider with public plate sightings who knows when a neighbour walks home"],
  },
  {
    meta: { id: "CITY-S2", dataset: "smart_city", title: "Share with the city-centre retail association", recipient: "Retail association (contract, marketing analytics)", purpose: "Dwell time, repeat visits, Black Friday and Christmas market effects, parking demand.", utilityTasks: ["CITY-U1", "CITY-U2", "CITY-U3", "CITY-U4", "CITY-U5", "CITY-U6"], privacyTargets: "Daily-rotating keyed pseudonyms for MACs and plates; drop SSIDs and payment fields; coarsen times to 15 min." },
    kind: "research", description: "analyse dwell time, repeat visits, event effects and parking demand", trust: "contractual", outputForm: "row_level",
    measures: ["footfall by zone x hour", "dwell-time distribution per device-day", "car-park occupancy by hour of day", "share of repeat visitors", "Black Friday uplift", "parking duration distribution"],
    groupings: ["zone", "car_park", "interval_start"],
    time: "15min",
    requiredFields: ["sensor_id", "interval_start", "device_count", "mac", "ts", "car_park", "plate", "entry_ts", "exit_ts"],
    linkage: "within_table", textNeed: "none", exclusions: [SPECIAL],
    threats: ["association member with its own loyalty-app device list and plate sightings"],
    notes: ["repeat-visitor share needs linkage across days; computing it inside the controller is the safer option"],
  },
  {
    meta: { id: "CITY-S3", dataset: "smart_city", title: "Request from police / parking enforcement", recipient: "Police or parking enforcement unit", purpose: "A request for all plates and payment details at P-Riverside over two weeks, 'for an investigation'.", utilityTasks: ["CITY-U3"], privacyTargets: "Show what a minimal, case-specific disclosure would contain versus the bulk request; log the disclosure." },
    kind: "other", description: "answer a bulk police request for plates and payment details (minimal case-specific disclosure)", trust: "internal", outputForm: "row_level",
    measures: ["car-park occupancy by hour of day", "case-specific plate events"],
    groupings: ["car_park"],
    requiredFields: ["car_park", "entry_ts", "exit_ts"],
    linkage: "none", textNeed: "none", exclusions: [SPECIAL],
    threats: ["function creep: data collected for parking fees reused for surveillance"],
    notes: ["scenario trust level is 'internal' (a disclosure inside the public sector); the protective answer is mostly to share less"],
  },
  // ---------------------------------------------------------------- energy
  {
    meta: { id: "ENERGY-S1", dataset: "energy", title: "Open data: neighbourhood electricity load", recipient: "Anyone (municipal open-data portal)", purpose: "Urban energy planning, journalism, research on heating transition.", utilityTasks: ["ENERGY-U1", "ENERGY-U2", "ENERGY-U3"], privacyTargets: "Aggregate >=10 metering points per cell; no individual series; consider DP noise on hourly sums." },
    kind: "statistics", description: "publish neighbourhood electricity load for planning, journalism and research", trust: "public", outputForm: "aggregate",
    measures: ["mean load per 3-digit postcode area x hour of day", "system peak hours", "temperature sensitivity by heating type"],
    groupings: ["postcode", "ts", "heating_type"],
    time: "hour", location: "postcode3",
    requiredFields: ["ts", "kwh", "postcode", "heating_type"],
    linkage: "none", textNeed: "none", exclusions: [SPECIAL],
    threats: ["public with vacation posts and the public directory", "neighbours who know their own consumption (differencing)"],
  },
  {
    meta: { id: "ENERGY-S2", dataset: "energy", title: "Row-level hourly data to a flexibility aggregator", recipient: "Demand-response aggregator (processor under contract)", purpose: "Identify flexible loads (heat pumps, EV) and forecast them.", utilityTasks: ["ENERGY-U2", "ENERGY-U4", "ENERGY-U5", "ENERGY-U6"], privacyTargets: "No names/addresses/contacts; keyed pseudonym for metering point; location >= 3-digit postcode; coarsen rare attributes." },
    kind: "model_training", description: "identify flexible loads and forecast them", trust: "contractual", outputForm: "row_level",
    measures: ["system peak hours", "heating-type classifier", "weekday load-profile clusters", "day-ahead load forecast per meter"],
    groupings: ["metering_point_id", "ts", "heating_type"],
    time: "hour", location: "postcode3",
    requiredFields: ["metering_point_id", "ts", "kwh", "heating_type", "postcode", "ev_charger", "solar_pv_kw"],
    linkage: "across_tables", textNeed: "none", exclusions: [SPECIAL],
    threats: ["curious insider at the aggregator with the public directory and vacation posts", "neighbour knowledge"],
    notes: ["series must stay linkable over time for forecasting"],
  },
  {
    meta: { id: "ENERGY-S3", dataset: "energy", title: "Energy-poverty research dataset", recipient: "University research group (controlled research environment)", purpose: "Relate heating type, payment problems and winter consumption.", utilityTasks: ["ENERGY-U3", "ENERGY-U4", "ENERGY-U7"], privacyTargets: "k>=5 on {postcode area, heating_type, floor area band, ev, solar}; remove or noise medical flag; daily values may suffice." },
    kind: "research", description: "relate heating type, payment problems and winter consumption", trust: "controlled_research", outputForm: "row_level",
    measures: ["temperature sensitivity by heating type", "heating-type classifier", "winter consumption by late-payment group x electric heating"],
    groupings: ["heating_type", "late_payment_count", "postcode"],
    time: "day", location: "postcode3",
    requiredFields: ["metering_point_id", "ts", "kwh", "heating_type", "late_payment_count", "floor_area_m2"],
    linkage: "across_tables", textNeed: "none", exclusions: [SPECIAL],
    threats: ["researcher with the public directory", "broker profiles"],
  },
  // ---------------------------------------------------------------- finance
  {
    meta: { id: "FIN-S1", dataset: "finance", title: "Cross-bank fraud consortium", recipient: "Fraud data-sharing consortium of several banks", purpose: "Pool card transactions to detect fraud patterns that span banks.", utilityTasks: ["FIN-U1", "FIN-U5"], privacyTargets: "Keyed tokens with consortium key for PAN/device/IP so cards link across banks; drop names/contacts; time to minute; no raw PAN." },
    kind: "fraud_security", description: "detect fraud patterns that span banks", trust: "contractual", outputForm: "row_level",
    measures: ["fraud detection on card transactions", "AML rule hits (structuring, rapid pass-through)"],
    groupings: ["card_pan", "mcc", "channel", "merchant_country"],
    time: "minute",
    requiredFields: ["ts", "amount_eur", "mcc", "channel", "merchant_country", "card_pan", "device_id", "ip_address", "is_fraud", "booking_ts", "from_iban", "to_iban"],
    linkage: "across_tables", textNeed: "none", exclusions: [],
    threats: ["consortium member analyst with receipt photos and the public directory", "merchant knowledge"],
    notes: ["linkability across banks is the point: random tokens would destroy it"],
  },
  {
    meta: { id: "FIN-S2", dataset: "finance", title: "External AI vendor builds a fraud / spending model", recipient: "AI vendor (processor)", purpose: "Train and evaluate a fraud model and a spending-category model.", utilityTasks: ["FIN-U1", "FIN-U4", "FIN-U6"], privacyTargets: "No direct identifiers; tokenised card; sensitive MCCs grouped; k-anonymity on customer profile; consider synthetic data." },
    kind: "model_training", description: "train and evaluate a fraud model and a spending-category model", trust: "contractual", outputForm: "row_level",
    measures: ["fraud model on card transactions", "card spending-profile segmentation", "mean monthly card spend by income band x age band"],
    groupings: ["card_pan", "mcc", "income_band"],
    ageBandYears: 10,
    requiredFields: ["ts", "amount_eur", "mcc", "channel", "merchant_country", "card_pan", "is_fraud", "income_band", "birth_date", "customer_id"],
    linkage: "across_tables", textNeed: "none", exclusions: [SPECIAL],
    threats: ["vendor staff with public receipts and the directory", "merchant knowledge and broker profiles"],
  },
  {
    meta: { id: "FIN-S3", dataset: "finance", title: "Statistics office: consumer spending statistics", recipient: "National statistics office / public release", purpose: "Monthly spending by category and region; payday and seasonal effects.", utilityTasks: ["FIN-U2", "FIN-U3", "FIN-U6"], privacyTargets: "Aggregates with >=10 cardholders per cell; dominance rule; DP noise on sums." },
    kind: "statistics", description: "publish monthly spending by category and region", trust: "public", outputForm: "aggregate",
    measures: ["spend by MCC group x merchant city x month", "spend by day of month (payday effect)", "mean monthly card spend by income band x age band"],
    groupings: ["mcc", "merchant_city", "ts", "income_band"],
    time: "month", location: "municipality", ageBandYears: 10,
    requiredFields: ["ts", "amount_eur", "mcc", "merchant_city", "income_band", "birth_date"],
    linkage: "none", textNeed: "none", exclusions: [SPECIAL],
    threats: ["anyone with public receipts", "differencing between releases"],
  },
  // ---------------------------------------------------------------- cyber
  {
    meta: { id: "CYBER-S1", dataset: "cyber", title: "Outsource 24/7 monitoring to an external MSSP", recipient: "Managed security service provider under a data processing agreement", purpose: "Detect and investigate threats across sign-in, VPN, proxy, DNS, EDR and e-mail telemetry", utilityTasks: ["CYBER-U1", "CYBER-U2", "CYBER-U3", "CYBER-U4", "CYBER-U5", "CYBER-U6", "CYBER-U7", "CYBER-U9", "CYBER-U10", "CYBER-U11"], privacyTargets: "Keyed pseudonyms for users, hosts and internal IPs consistent across tables; secrets and e-mails removed from URLs and command lines; sensitive web categories generalised." },
    kind: "fraud_security", description: "detect and investigate threats across sign-in, VPN, proxy, DNS, EDR and e-mail telemetry", trust: "contractual", outputForm: "row_level",
    measures: ["impossible-travel detection", "MFA-fatigue detection", "password-spray detection", "exfiltration detection", "phishing chain detection", "lateral movement detection", "insider download detection", "sign-in volume by hour", "alert triage statistics"],
    groupings: ["upn", "src_ip", "domain", "hostname", "rule_name"],
    time: "exact",
    requiredFields: ["upn", "ts_utc", "result", "mfa_result", "src_ip", "geo_city", "domain", "bytes_sent", "sender", "recipients", "hostname", "severity", "rule_name", "analyst_verdict"],
    linkage: "across_tables", textNeed: "topic_only", exclusions: [SPECIAL],
    threats: ["curious MSSP analyst with the company staff page and OSINT trying to learn who is who or what employees browse"],
    notes: ["detection rules work on sub-hour windows (MFA fatigue: 30 min), so timestamps stay exact; random per-row tokens would break cross-log detections"],
  },
  {
    meta: { id: "CYBER-S2", dataset: "cyber", title: "Share indicators with the national CERT / sector ISAC", recipient: "National CERT and other logistics companies (threat-intelligence sharing community)", purpose: "Share attacker infrastructure and TTPs from campaigns C1 and C2 so others can block them", utilityTasks: ["CYBER-U3", "CYBER-U4", "CYBER-U8"], privacyTargets: "Only external attacker IoCs; no employee identifiers, internal IPs or hostnames; victim count only as aggregate." },
    kind: "fraud_security", description: "share attacker infrastructure and TTPs so others can block them", trust: "controlled_research", outputForm: "row_level",
    measures: ["indicators of compromise (attacker IPs, domains, user agents, hashes)", "password-spray sources", "exfiltration destinations"],
    groupings: ["campaign_id", "src_ip", "domain"],
    time: "exact",
    requiredFields: ["src_ip", "domain", "device_name", "user_agent", "sha256", "mitre_technique", "ts_utc", "campaign_id"],
    linkage: "none", textNeed: "none", exclusions: [SPECIAL],
    threats: ["other community members are competitors: staff, customers and internal network layout are out of scope"],
    notes: ["attacker IPs are not employee personal data and must stay exact"],
  },
  {
    meta: { id: "CYBER-S3", dataset: "cyber", title: "Publish an open research dataset for detection research", recipient: "Anyone (public download)", purpose: "Benchmark for detection of phishing chains, spraying and insider exfiltration", utilityTasks: ["CYBER-U1", "CYBER-U2", "CYBER-U3", "CYBER-U5", "CYBER-U6", "CYBER-U9", "CYBER-U10"], privacyTargets: "No identifiers or secrets; prefix-preserving IP anonymisation; coarsened timestamps; sensitive categories removed; no unique employees; text removed or fully redacted." },
    kind: "fraud_security", description: "publish a benchmark for detecting phishing chains, spraying and insider exfiltration", trust: "public", outputForm: "row_level",
    measures: ["impossible-travel detection", "MFA-fatigue detection", "password-spray detection", "phishing chain detection", "lateral movement detection", "cross-log join consistency", "sign-in volume by hour"],
    groupings: ["upn", "src_ip", "domain"],
    time: "15min",
    requiredFields: ["upn", "ts_utc", "result", "mfa_result", "src_ip", "domain", "sender", "recipients", "hostname", "severity", "attack_label", "campaign_id"],
    linkage: "across_tables", textNeed: "none", exclusions: [SPECIAL],
    threats: ["motivated outsider with the staff page and breach/OSINT data trying to identify employees, their browsing, sick leave or the insider"],
    notes: ["labelled campaigns must stay detectable after protection"],
  },
  // ---------------------------------------------------------------- education
  {
    meta: { id: "EDU-S1", dataset: "education", title: "Statistics publication for the education authority", recipient: "Public (published statistics tables)", purpose: "Publish grade, completion and drop-out statistics by school, programme, sex and language group.", utilityTasks: ["EDU-U1", "EDU-U5", "EDU-U6", "EDU-U3"], privacyTargets: "No cell below 5 unless noise-protected; no microdata; consistent totals across tables." },
    kind: "statistics", description: "publish grade, completion and drop-out statistics", trust: "public", outputForm: "aggregate",
    measures: ["mean grade by school x subject", "matriculation grade distribution by subject", "drop-out rate by programme", "gender gap in maths grades"],
    groupings: ["school_code", "course_code", "programme", "sex", "home_language", "subject_code"],
    requiredFields: ["school_code", "course_code", "grade", "grade_scale", "subject_code", "programme", "status", "sex", "home_language"],
    linkage: "none", textNeed: "none", exclusions: [SPECIAL],
    threats: ["anyone with graduation lists and sports rosters", "differencing between tables"],
    notes: ["small schools and programmes are the hard part"],
  },
  {
    meta: { id: "EDU-S2", dataset: "education", title: "Ed-tech vendor training a drop-out early-warning model", recipient: "External ed-tech company under a data processing agreement", purpose: "Train a model that predicts drop-out risk from grades and absences.", utilityTasks: ["EDU-U2", "EDU-U4"], privacyTargets: "No identifiers or free text; religion/S2/support removed or justified; k>=5 on (school, programme, start year, sex, birth year)." },
    kind: "model_training", description: "train a model that predicts drop-out risk from grades and absences", trust: "contractual", outputForm: "row_level",
    measures: ["drop-out prediction from grades and absences", "correlation of unexcused absence hours with mean grade"],
    groupings: ["student_id", "school_code", "programme"],
    requiredFields: ["student_id", "status", "grade", "unexcused_hours", "school_code", "programme", "sex", "birth_date", "start_date"],
    linkage: "across_tables", textNeed: "none", exclusions: [SPECIAL],
    threats: ["vendor staff with classmate-level knowledge and public lists"],
    notes: ["keyed pseudonyms must keep the student_id join across tables"],
  },
  {
    meta: { id: "EDU-S3", dataset: "education", title: "Researcher studying grade gaps", recipient: "University research group in a controlled environment", purpose: "Analyse gender and language-group gaps in maths and matriculation results.", utilityTasks: ["EDU-U3", "EDU-U5", "EDU-U1"], privacyTargets: "k>=10 on quasi-identifiers or synthetic microdata; no notes text." },
    kind: "research", description: "analyse gender and language-group gaps in maths and matriculation results", trust: "controlled_research", outputForm: "row_level",
    measures: ["gender gap in maths module grades", "matriculation grade distribution by subject", "mean grade by school x subject"],
    groupings: ["sex", "home_language", "course_code", "subject_code", "school_code"],
    requiredFields: ["student_id", "sex", "home_language", "course_code", "grade", "subject_code", "school_code"],
    linkage: "across_tables", textNeed: "none", exclusions: [],
    threats: ["researcher with public lists", "spontaneous recognition in small schools"],
  },
  // ---------------------------------------------------------------- public administration
  {
    meta: { id: "PUB-S1", dataset: "public_admin", title: "Open data publication of citizen feedback", recipient: "Public (open data portal, CC BY)", purpose: "Publish requests with category, time, area, status and the text so residents and journalists can follow service quality.", utilityTasks: ["PUB-U1", "PUB-U2", "PUB-U3", "PUB-U4"], privacyTargets: "No direct identifiers in any column or text; locations coarsened (250 m grid or street level); time to the hour or day; no account ids." },
    kind: "statistics", description: "publish service requests with category, time, area, status and text", trust: "public", outputForm: "row_level",
    measures: ["request counts by area x category x month", "median resolution time by category", "hotspot map", "category classifier on description text"],
    groupings: ["postcode", "category", "ts_created"],
    time: "hour", location: "street",
    requiredFields: ["ts_created", "ts_closed", "category", "status", "postcode", "lat", "lon", "description"],
    linkage: "none", textNeed: "topic_only", exclusions: [SPECIAL],
    threats: ["anyone: neighbours, forum users and the permit registry"],
    notes: ["the text holds most of the value and most of the risk"],
  },
  {
    meta: { id: "PUB-S2", dataset: "public_admin", title: "Internal analytics team", recipient: "Service centre's own analysts", purpose: "Dashboards on workload, response times and repeat issues.", utilityTasks: ["PUB-U1", "PUB-U2", "PUB-U5", "PUB-U6"], privacyTargets: "Keyed pseudonyms for reporters (stable); no contact details; text redacted." },
    kind: "operations", description: "dashboards on workload, response times and repeat issues", trust: "internal", outputForm: "row_level",
    measures: ["request counts by area x category x month", "median resolution time by category", "share of requests from repeat reporters", "permit counts by municipality x project type x quarter"],
    groupings: ["category", "postcode", "municipality", "project_type"],
    requiredFields: ["ts_created", "ts_closed", "category", "postcode", "reporter_account_id", "submitted_date", "municipality", "project_type"],
    linkage: "within_table", textNeed: "topic_only", exclusions: [],
    threats: ["curious colleague with insider knowledge"],
  },
  {
    meta: { id: "PUB-S3", dataset: "public_admin", title: "Research group studying service equity", recipient: "University research group", purpose: "Do response times differ between areas and languages?", utilityTasks: ["PUB-U1", "PUB-U2", "PUB-U3"], privacyTargets: "k>=5 on (postcode, category, month, language); no text or redacted text; aggregated reporter activity." },
    kind: "research", description: "test whether response times differ between areas and languages", trust: "controlled_research", outputForm: "row_level",
    measures: ["request counts by area x category x month", "median resolution time by category", "hotspot map"],
    groupings: ["postcode", "category", "language"],
    time: "month", location: "postcode3",
    requiredFields: ["ts_created", "ts_closed", "category", "postcode", "language", "lat", "lon"],
    linkage: "none", textNeed: "none", exclusions: [],
    threats: ["researchers with public forum posts and the permit registry"],
  },
  // ---------------------------------------------------------------- customer service
  {
    meta: { id: "CS-S1", dataset: "customer_service", title: "Transcripts to an external LLM analytics vendor", recipient: "Cloud AI vendor (processor, outside the EU possible)", purpose: "Topic mining, contact-reason trends and agent-quality insights on all channels.", utilityTasks: ["CS-U1", "CS-U3", "CS-U5", "CS-U4"], privacyTargets: "No residual direct identifiers in text (recall >= 0.98 on NATIONAL_ID, PAYMENT_CARD, IBAN, SECRET); remove HEALTH mentions; consistent pseudonyms within a conversation; timestamps to the hour." },
    kind: "topic_mining", description: "topic mining, contact-reason trends and agent-quality insights", trust: "contractual", outputForm: "text_corpus",
    measures: ["contact-reason (intent) mix", "contact-reason trends", "average handle time by intent", "intent classifier on transcript text", "ordinary vocabulary retained"],
    groupings: ["intent", "channel"],
    time: "hour",
    requiredFields: ["turns.text", "intent", "handle_time_s", "channel", "started_ts"],
    linkage: "none", textNeed: "topic_only", exclusions: [SPECIAL],
    threats: ["vendor staff and model logs see all text", "insider linkage with a leaked customer list or breach dumps", "processing outside the EU"],
    notes: ["keep the intent signal: do not delete whole utterances"],
  },
  {
    meta: { id: "CS-S2", dataset: "customer_service", title: "Train an internal intent model / chatbot", recipient: "Aallokko data science team (internal)", purpose: "Train an intent classifier and response suggestions.", utilityTasks: ["CS-U1", "CS-U2", "CS-U5"], privacyTargets: "Identifiers replaced by typed placeholders or realistic surrogates; no secrets or card numbers anywhere." },
    kind: "model_training", description: "train an intent classifier and response suggestions", trust: "internal", outputForm: "text_corpus",
    measures: ["intent classifier on conversation text", "sentiment vs CSAT relationship", "ordinary vocabulary retained"],
    groupings: ["intent"],
    requiredFields: ["turns.text", "intent", "sentiment", "csat"],
    linkage: "none", textNeed: "fluent", exclusions: [],
    threats: ["model memorisation: verbatim identifiers in training text can be regurgitated by a generative model"],
    notes: ["surrogates (fake names) preserve fluency better than [REDACTED]"],
  },
  {
    meta: { id: "CS-S3", dataset: "customer_service", title: "Quality-audit samples to an outsourced BPO", recipient: "Quality assurance partner", purpose: "Score 500 conversations a month for compliance (identity verification done, card numbers refused).", utilityTasks: ["CS-U4", "CS-U6", "CS-U7"], privacyTargets: "Mask identifiers but keep evidence that verification happened ([NATIONAL_ID] placeholder); drop customer_id; started_ts to week." },
    kind: "quality_audit", description: "score conversations for compliance (identity verification done, card numbers refused)", trust: "contractual", outputForm: "text_corpus",
    measures: ["compliance score per conversation", "average handle time by intent", "contact volumes by channel x language", "first-contact resolution rate by intent"],
    groupings: ["intent", "channel", "language"],
    time: "week",
    requiredFields: ["turns.text", "intent", "handle_time_s", "channel", "language", "resolved"],
    linkage: "none", textNeed: "verbatim_evidence", exclusions: [SPECIAL],
    threats: ["auditors are human readers who may recognise neighbours or public figures", "linkage via customer_id and timestamps"],
    notes: ["the auditor must still see that the agent stopped a card number being read out"],
  },
];

export const SCENARIO_META: Record<string, ScenarioMeta> = Object.fromEntries(INPUTS.map((s) => [s.meta.id, s.meta]));
export const SCENARIO_GOALS: Record<string, GoalSpec> = Object.fromEntries(INPUTS.map((s) => [s.meta.id, build(s)]));
export const SCENARIO_IDS: string[] = INPUTS.map((s) => s.meta.id);

/** Three paraphrases per scenario: varied length, formality and order; some name the recipient, some the output. */
export const SCENARIO_TEXTS: Record<string, string[]> = {
  "HEALTH-S1": [
    "Give the university research group our ED visits so they can analyse length of stay, revisits and diagnosis patterns.",
    "Researchers studying emergency department crowding need patient-level visit and lab data in the secure environment; they look at 30-day revisits by age band and CRP by diagnosis group.",
    "Academic study of ED crowding: length of stay by triage level, revisit rates, diagnosis mix per municipality.",
  ],
  "HEALTH-S2": [
    "Publish a weekly dashboard of ED load, influenza-like illness and injury trends by age band and municipality on the open data portal.",
    "Open data: weekly emergency department visit counts by age group and municipality for anyone to download.",
    "We want to release weekly flu and injury statistics from the ED to the public.",
  ],
  "HEALTH-S3": [
    "An external AI vendor under a DPA will train a model that predicts admission from triage-time information.",
    "Send triage data to the vendor so they can build an admission prediction model.",
    "Train a triage-support model with our AI supplier: predict whether a patient is admitted, using vitals, triage level, age and sex.",
  ],
  "MOB-S1": [
    "Publish weekly origin-destination flows between areas by hour band as open data for journey planners and citizens.",
    "Open data release of public-transport OD matrices, CC BY, weekly.",
    "Anyone should be able to download aggregated bus trip flows between districts per hour.",
  ],
  "MOB-S2": [
    "Row-level journeys to the planning consultancy under a data processing agreement for the bus network redesign: transfers, commuting corridors and peak loads.",
    "Our consultant needs tap data to analyse transfers and commuting corridors so they can redesign bus routes.",
    "Share card taps with an external planning firm (processor) to study peak loads and transfers between lines.",
  ],
  "MOB-S3": [
    "University researchers want to study mode choice between bus and city bike, weather effects and commuting distances.",
    "Academic mobility research: bike trip durations and distances, card type mix, bike demand by zone and hour.",
    "Give the research group in the secure environment bike trips and bus taps for a study on commuting.",
  ],
  "CITY-S1": [
    "Publish hourly footfall by zone on the open data portal for businesses, events and citizens.",
    "Open data: city-centre pedestrian counts per zone and hour, including the Black Friday weekend.",
    "Release footfall counts to the public, aggregated per hour and zone.",
  ],
  "CITY-S2": [
    "Share data with the city-centre retail association under contract: dwell time, repeat visits, Black Friday and Christmas market effects and parking demand.",
    "The retail association wants marketing analytics on how long visitors stay, how often they come back and parking occupancy.",
    "Give our business partner wifi and parking data to analyse repeat visitors and dwell time around the Christmas market.",
  ],
  "CITY-S3": [
    "The police are asking for all plates and payment details at P-Riverside over two weeks for an investigation.",
    "Parking enforcement wants every licence plate and card payment from the Riverside car park for the last two weeks.",
    "Law enforcement request: disclose ANPR plate reads and payment data for one car park, 'for an investigation'.",
  ],
  "ENERGY-S1": [
    "Publish neighbourhood electricity load as open data for energy planning, journalism and heating-transition research.",
    "Open data portal: hourly electricity consumption per postcode area, at least 10 meters per cell.",
    "Anyone can download aggregated hourly load by neighbourhood.",
  ],
  "ENERGY-S2": [
    "Row-level hourly meter data to a demand-response aggregator under contract so they can identify flexible loads like heat pumps and EV chargers and forecast them.",
    "The flexibility aggregator (our processor) needs consumption series per metering point to forecast load.",
    "Share hourly kWh readings with an external partner that builds load forecasts and spots heat pumps.",
  ],
  "ENERGY-S3": [
    "University energy-poverty study: relate heating type, payment problems and winter consumption.",
    "Researchers in a secure environment want to analyse whether households with late payments and electric heating use less energy in winter.",
    "Energy poverty research dataset for an academic group: winter consumption by heating type and late payment group.",
  ],
  "FIN-S1": [
    "Pool card transactions with the cross-bank fraud consortium to detect fraud patterns that span banks.",
    "Our fraud data-sharing consortium with other banks needs the same card to link across banks.",
    "Share transactions and transfers with partner banks to catch fraud and money laundering together.",
  ],
  "FIN-S2": [
    "An AI vendor (processor) will train and evaluate a fraud model and a spending-category model.",
    "Send card transactions to an external vendor to build a fraud detection model and spending segmentation.",
    "Train a fraud classifier with our ML vendor on card transactions and customer profiles.",
  ],
  "FIN-S3": [
    "Monthly consumer spending statistics by category and region for the national statistics office to publish.",
    "Publish monthly card spending by merchant category and city, including payday and seasonal effects.",
    "Statistics office release: spending per category, region and month for the public.",
  ],
  "CYBER-S1": [
    "Outsource 24/7 security monitoring to an external MSSP: detect and investigate threats across sign-in, VPN, proxy, DNS, EDR and e-mail logs.",
    "Our managed security service provider needs our logs to hunt for phishing, password spraying and insider exfiltration.",
    "Share sign-in and proxy telemetry with the SOC vendor under a DPA so they can detect attacks.",
  ],
  "CYBER-S2": [
    "Share attacker infrastructure and TTPs from campaigns C1 and C2 with the national CERT and the sector ISAC so others can block them.",
    "Send indicators of compromise (attacker IPs, phishing domains, user agents) to the threat-intelligence sharing community.",
    "Give the ISAC our IoCs from the recent phishing campaign, nothing about our staff.",
  ],
  "CYBER-S3": [
    "Publish an open research dataset of our security logs as a benchmark for detecting phishing chains, password spraying and insider exfiltration.",
    "Anyone should be able to download the log dataset for detection research.",
    "Release a public intrusion-detection benchmark built from our sign-in, VPN and proxy logs.",
  ],
  "EDU-S1": [
    "Publish grade, completion and drop-out statistics by school, programme, sex and language group.",
    "Statistics tables for the education authority to publish: mean grades per school and subject, drop-out rate by programme.",
    "Public release of matriculation grade distributions and drop-out rates per school.",
  ],
  "EDU-S2": [
    "An external ed-tech company under a DPA will train a model that predicts drop-out risk from grades and absences.",
    "Share student data with our ed-tech vendor to build an early-warning model for dropping out.",
    "Drop-out prediction: the vendor trains a classifier on grades, absences and student background.",
  ],
  "EDU-S3": [
    "A university research group wants to analyse gender and language-group gaps in maths and matriculation results.",
    "Researchers studying grade gaps between boys and girls and between language groups.",
    "Give the education researchers in the secure environment grades and matriculation results for a study on achievement gaps.",
  ],
  "PUB-S1": [
    "Publish citizen feedback requests with category, time, area, status and the text on the open data portal so residents and journalists can follow service quality.",
    "Open data: all service requests including the description text, with location coarsened.",
    "We want to put our feedback data online for anyone, with the request text, category and area.",
  ],
  "PUB-S2": [
    "Dashboards for our own analysts on workload, response times and repeat issues.",
    "The service centre's internal analytics team needs workload and response-time dashboards, including repeat reporters.",
    "Internal use: track how many requests each category gets, how fast we close them and who reports repeatedly.",
  ],
  "PUB-S3": [
    "University research group studying service equity: do response times differ between areas and languages?",
    "Researchers want to know whether response times to service requests differ by area and language.",
    "Equity research on our service requests for an academic team: resolution time by postcode, category and language.",
  ],
  "CS-S1": [
    "Send transcripts to an external LLM analytics vendor for topic mining, contact-reason trends and agent-quality insights.",
    "Find contact reason trends with our cloud AI vendor.",
    "The AI vendor needs all chat and call conversations so they can mine themes and see why customers contact us.",
  ],
  "CS-S2": [
    "Train an internal intent classifier and response suggestions on our customer service conversations.",
    "Our data science team wants to train a chatbot on the transcripts.",
    "Build an intent model in-house from chat logs.",
  ],
  "CS-S3": [
    "Quality-audit samples to our outsourced BPO: score 500 conversations a month for compliance.",
    "The QA partner checks that agents verified identity and refused card numbers.",
    "Send a monthly sample of customer service conversations to the external quality assurance partner for compliance scoring.",
  ],
};
