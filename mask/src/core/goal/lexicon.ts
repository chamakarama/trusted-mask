/**
 * Cue lexicons for the heuristic goal interpreter. English first, Finnish (stems with "*") second,
 * Swedish best-effort. Patterns are matched on normalised (lowercase, NFKC) text.
 */
import type { TaskKind, TimeResolution, TrustLevel, LocationResolution } from "@/contracts";
import type { ScenarioDataset } from "./scenarios";
import { cue } from "./text";

/** Phrases that contain trust words but do not name a recipient ("public transport", "public directory"). */
export const NEUTRALISE: RegExp[] = [
  /public[\s-]*transport\w*/gu, /public[\s-]*(directory|figures?|receipts?|sources?|lists?|holidays?|sector)/gu,
  /julkinen liikenne\w*/gu, /julkis(en|ta) liikente\w*/gu, /kollektivtrafik\w*/gu, /allmän(na)? kollektiv\w*/gu,
  /research question\w*/gu,
];

export interface TrustCue { trust: TrustLevel; strength: 2 | 1; re: RegExp; label: string }

export const TRUST_CUES: TrustCue[] = [
  // public
  { trust: "public", strength: 2, label: "public release", re: cue(["open data*", "open-data*", "open dataset", "data portal", "portal", "anyone", "everyone", "general public", "the public", "citizens", "residents", "journalist*", "public download", "public release", "publicly", "online for", "statistics office", "statistical office", "tilastokeskus*", "avoin* data*", "avoimek*", "avoimena", "kaikille", "kuka tahansa", "kansalais*", "asukk*", "öppna data", "allmänhet*", "offentligg*"]) },
  { trust: "public", strength: 1, label: "publication", re: cue(["publish*", "public", "release*", "julkai*", "julkis*", "julkinen", "julkiseksi", "publicer*", "offentlig*"]) },
  // controlled research
  { trust: "controlled_research", strength: 2, label: "research recipient", re: cue(["universit*", "researcher*", "research group*", "research team*", "academic*", "academia", "phd", "secure environment", "secure processing environment", "findata", "cert", "isac", "threat-intelligence sharing community", "threat intelligence sharing community", "sharing community", "yliopisto*", "tutkija*", "tutkimusryhm*", "korkeakoulu*", "akateemi*", "universitet*", "forskare*", "forskargrupp*"]) },
  { trust: "controlled_research", strength: 1, label: "research purpose", re: cue(["research", "study", "studying", "studies", "tutkimu*", "tutki*", "forskning*", "studie*"]) },
  // contractual
  { trust: "contractual", strength: 2, label: "external processor", re: cue(["vendor*", "startup*", "start-up*", "company", "companies", "saas", "cloud service*", "processor*", "consultan*", "consultant*", "partner*", "bpo", "outsourc*", "contractor*", "subcontractor*", "third party", "third-party", "supplier*", "service provider*", "mssp", "aggregator*", "consortium*", "association*", "firm", "ed-tech company", "edtech company", "agency", "soc vendor", "palveluntarjoaja*", "alihankkij*", "kumppani*", "konsult*", "ulkoist*", "toimittajalle", "toimittajan", "käsittelijä*", "yhteistyökumppani*", "leverantör*", "underleverantör*", "partner*", "konsultbyrå*"]) },
  { trust: "contractual", strength: 1, label: "external / contract", re: cue(["external*", "contract*", "dpa", "data processing agreement", "under contract", "ulkopuoli*", "ulkoinen", "ulkoise*", "sopimu*", "extern*", "avtal*"]) },
  // internal
  { trust: "internal", strength: 1, label: "own department", re: cue(["department*", "the board", "management", "osasto*", "johto*", "johtoryhm*", "avdelning*", "ledningsgrupp*"]) },
  { trust: "internal", strength: 2, label: "internal team", re: cue(["internal*", "in-house", "omaan käyttöön", "oma tiimi*", "omalle tiimille", "oman tiimi*", "inhouse", "our own", "our team", "our analysts", "own analysts", "ourselves", "data science team", "analytics team", "our data scientists", "colleagues", "service centre's own", "service center's own", "sisäi*", "oma tiimi*", "omalle tiimille", "omille", "omat analyytik*", "talon sisä*", "intern*", "vårt team", "egna analytiker"]) },
];

/** Police and enforcement requests: recipient named, trust level deliberately not inferred. */
export const AUTHORITY_CUE = cue(["police", "law enforcement", "parking enforcement", "enforcement unit", "authorit* request*", "poliisi*", "polis*"]);

export const TRUST_LABEL: Record<TrustLevel, string> = {
  internal: "internal team",
  contractual: "external processor under contract",
  controlled_research: "researchers in a controlled environment",
  public: "the public",
};

export interface TaskCue { kind: TaskKind; weight: number; re: RegExp }

export const TASK_CUES: TaskCue[] = [
  { kind: "topic_mining", weight: 3, re: cue(["topic*", "theme*", "contact reason*", "contact-reason*", "reasons for contact", "why customers", "why people contact", "what customers call about", "call driver*", "text mining", "mine themes", "aihe*", "teema*", "yhteydenottosy*", "yhteydenoton sy*", "ämne*", "kontaktorsak*"]) },
  { kind: "topic_mining", weight: 1, re: cue(["trend*", "mine", "mining", "insight*", "trendi*"]) },
  { kind: "model_training", weight: 3, re: cue(["train*", "classifier*", "chatbot*", "machine learning", "ml model*", "predict*", "prediction*", "forecast*", "early-warning", "early warning", "response suggestion*", "intent model*", "koulut*", "luokittelij*", "ennust*", "botti*", "chatbot*", "träna*", "prognos*", "maskininlärning*"]) },
  { kind: "model_training", weight: 4, re: cue(["model*", "malli*", "modell*"]) },
  { kind: "quality_audit", weight: 3, re: cue(["audit*", "compliance", "qa", "quality assurance", "quality-audit*", "score conversations", "score calls", "scoring", "check that agent*", "checks that agent*", "verified identity", "auditoi*", "laadunvarmistu*", "vaatimustenmukais*", "laatuarvio*", "granskning*", "kvalitetsgransk*"]) },
  { kind: "quality_audit", weight: 1, re: cue(["quality", "review sample*", "laatu*", "laadu*", "kvalitet*"]) },
  { kind: "statistics", weight: 3, re: cue(["statistic*", "od matri*", "matrices", "counts", "aggregate*", "aggregated", "tables", "open data*", "tilast*", "koont*", "statistik*"]) },
  { kind: "statistics", weight: 2, re: cue(["publish*", "release*", "julkai*", "publicer*"]) },
  { kind: "operations", weight: 3, re: cue(["workload*", "dashboard*", "response time*", "response-time*", "staffing", "backlog", "how fast", "kpi*", "operational", "työkuorm*", "kojelau*", "vasteai*", "käsittelyai*", "arbetsbelastning*"]) },
  { kind: "operations", weight: 1, re: cue(["track*", "monitor*", "seuran*", "seura*"]) },
  { kind: "fraud_security", weight: 3, re: cue(["fraud*", "security", "threat*", "attack*", "phishing", "intrusion*", "malware", "soc", "mssp", "money laundering", "aml", "ioc*", "indicators of compromise", "exfiltration", "password spray*", "cert", "isac", "ttp*", "petos*", "tietoturv*", "kyberturv*", "hyökkä*", "uhk*", "rahanpes*", "bedräger*", "säkerhet*"]) },
  { kind: "research", weight: 3, re: cue(["research*", "study", "studying", "studies", "researcher*", "equity", "gap*", "tutki*", "forsk*", "studie*"]) },
  { kind: "research", weight: 1, re: cue(["analys*", "analyz*", "analyti*", "relate", "relationship*", "effect*", "differ*", "correlat*", "patterns", "analysoi*", "selvit*", "analyy*"]) },
  { kind: "other", weight: 5, re: cue(["police", "law enforcement", "parking enforcement", "for an investigation", "disclose", "disclosure", "bulk request", "poliisi*", "polis*"]) },
];

export const TASK_LABEL: Record<TaskKind, string> = {
  topic_mining: "find topics and contact-reason trends",
  model_training: "train a model",
  quality_audit: "audit quality and compliance",
  statistics: "publish aggregate statistics",
  research: "research analysis on row-level data",
  operations: "operational dashboards and workload analysis",
  fraud_security: "detect fraud or security threats",
  other: "other use",
};

export const DOMAIN_CUES: Record<ScenarioDataset, RegExp> = {
  health: cue(["patient*", "hospital*", "emergency department", "ed", "diagnos*", "length of stay", "triage*", "revisit*", "admission*", "admitted", "influenza*", "flu", "ili", "clinical", "lab", "crp", "vital*", "injur*", "health*", "medical", "potila*", "sairaal*", "päivystyk*", "päivystys*", "diagnoo*", "terveyd*", "terveys*", "hoitoaj*", "influenssa*", "sjukhus*", "akuten"]),
  mobility: cue(["bus", "buses", "transit", "public-transport", "journey*", "tap", "taps", "travel card*", "bike*", "city bike*", "commut*", "origin-destination", "od", "stop", "stops", "rider*", "passenger*", "trip", "trips", "mode choice", "bussi*", "joukkoliiken*", "kaupunkipyör*", "pyörä*", "pysäk*", "matkakort*", "nousu*", "resenär*", "cykel*"]),
  smart_city: cue(["footfall", "pedestrian*", "wifi", "wi-fi", "mac", "macs", "probe*", "parking", "plate", "plates", "anpr", "car park*", "dwell*", "black friday", "christmas market", "city-centre", "city centre", "city center", "visitor*", "jalankulk*", "pysäköin*", "rekisterikilp*", "kävijä*", "parkering*"]),
  energy: cue(["electricity", "energy", "meter", "meters", "metering*", "kwh", "load", "loads", "consumption", "heating*", "heat pump*", "ev charger*", "solar", "demand-response", "demand response", "flexib*", "household*", "sähkö*", "energia*", "lämmit*", "mittar*", "sähkönkulutu*", "elförbrukning*", "energi*"]),
  finance: cue(["bank", "banks", "card transaction*", "transaction*", "fraud*", "payment*", "spending", "spend", "merchant*", "aml", "money laundering", "transfer", "cardholder*", "pankk*", "korttitapahtum*", "maksu*", "petos*", "rahanpes*", "transaktion*", "kortti*"]),
  cyber: cue(["sign-in*", "signin*", "login*", "vpn", "proxy", "dns", "edr", "telemetry", "log", "logs", "security", "mssp", "soc", "threat*", "phishing", "attack*", "ioc*", "indicators of compromise", "cert", "isac", "malware", "intrusion*", "password spray*", "exfiltration", "insider", "tietoturv*", "kyberturv*", "loki*", "hyökkä*", "tietomurto*"]),
  education: cue(["student*", "pupil*", "school*", "grade*", "drop-out*", "dropout*", "dropping out", "absence*", "matriculation", "exam*", "teacher*", "ed-tech", "edtech", "education*", "maths", "math", "opiskelij*", "oppila*", "koulu*", "arvosan*", "keskeyt*", "poissaol*", "ylioppila*", "elev*", "skol*", "betyg*"]),
  public_admin: cue(["service request*", "citizen feedback", "feedback", "complaint*", "service centre*", "service center*", "reporter*", "building permit*", "permit*", "requests", "palautte*", "palvelupyyn*", "rakennuslup*", "felanmäl*"]),
  customer_service: cue(["conversation*", "transcript*", "customer service", "contact centre", "contact center", "call centre", "call center", "chat", "chats", "call", "calls", "contact reason*", "contact-reason*", "intent*", "agent*", "csat", "handle time", "chatbot*", "customer support", "bpo", "keskustelu*", "asiakaspalvelu*", "puhelu*", "kundtjänst*", "samtal*"]),
};

export const TIME_CUES: { res: TimeResolution; re: RegExp }[] = [
  { res: "exact", re: cue(["exact time*", "exact timestamp*", "precise time*", "to the second", "second-level", "full timestamp*", "tarkat ajat", "tarkka aika*", "tarkalla ajalla", "exakta tider"]) },
  { res: "minute", re: cue(["to the minute", "minute-level", "per minute", "minuutin tarkkuu*", "minuutilleen", "minuten"]) },
  { res: "15min", re: cue(["15 min*", "15-min*", "15min*", "quarter-hour*", "quarter hour*", "5-15 min*", "varttitunn*", "vartin"]) },
  { res: "hour", re: cue(["hour", "hours", "hourly", "hour band*", "hour-of-day", "hour of day", "by the hour", "tunneittain", "tunnin", "tunti*", "kellonaj*", "timme*", "timvis"]) },
  { res: "day", re: cue(["daily", "per day", "by day", "day-level", "each day", "päivittäi*", "päivätaso*", "päivän tarkkuu*", "dagligen", "per dag"]) },
  { res: "week", re: cue(["weekly", "week", "weeks", "per week", "by week", "viikoittai*", "viiko*", "viikkotaso*", "veckovis", "vecka", "veckor"]) },
  { res: "month", re: cue(["monthly", "month", "months", "per month", "by month", "kuukausittai*", "kuukauden", "kuukausi*", "månadsvis", "månad*"]) },
  { res: "year", re: cue(["yearly", "annual*", "per year", "by year", "vuosittai*", "årsvis", "per år"]) },
];

/** Time phrases that describe a period or frequency, not the resolution the analysis needs. */
export const TIME_NOISE: RegExp[] = [
  /\b(over|for|during|in|last|past|the last|next)\s+(the\s+)?(two|three|four|\d+|a few|several|couple of)\s+(weeks?|months?|days?|hours?|years?)/gu,
  /\b(a|per|each|every)\s+(month|week)\s*(?=$|[.,;)])/gu,
  /\b\d+\s+\w+\s+(a|per)\s+(month|week|day)\b/gu,
  /\b(birth|start|academic|school|calendar|fiscal)\s+year\b/gu,
  /\bhour[\s-]*of[\s-]*day[\s-]*arrival\b/gu,
  /\b24\/7\b/gu,
  /\b(two|kaksi|kahden)\s+(weeks|viikon)\b/gu,
];

/** Phrases that contain location words but are not a resolution ("city centre", "city bike"). */
export const LOCATION_NOISE: RegExp[] = [/city[\s-]*(cent(re|er)|bikes?)/gu, /street[\s-]*address\w*/gu, /no (exact )?(locations?|addresses|coordinates)/gu];

export const LOCATION_CUES: { res: LocationResolution; re: RegExp }[] = [
  { res: "exact", re: cue(["exact location*", "exact address*", "coordinates", "gps point*", "full address*", "tarkka sijainti*", "tarkat koordinaatit"]) },
  { res: "street", re: cue(["street level", "street-level", "street", "streets", "katutaso*", "kadun tarkkuu*", "gatunivå"]) },
  { res: "postcode3", re: cue(["3-digit postcode*", "three-digit postcode*", "3 digit postcode*", "postcode area*", "postal area*", "postcode prefix*", "kolminumeroi*", "postinumeroalue*"]) },
  { res: "postcode", re: cue(["postcode*", "postal code*", "zip code*", "zip", "postinumero*", "postnummer*"]) },
  { res: "municipality", re: cue(["municipalit*", "city", "cities", "town", "kunta", "kunnittain", "kunnan", "kunnat", "kunni*", "kaupungei*", "kommun*"]) },
  { res: "region", re: cue(["region*", "county", "province", "maakun*", "alueittain", "region*", "län"]) },
];

export const AGE_BAND_CUES: { years: number; re: RegExp }[] = [
  { years: 5, re: cue(["5-year age*", "five-year age*", "5 year age*", "viiden vuoden ikä*", "5 vuoden ikä*"]) },
  { years: 10, re: cue(["10-year age*", "ten-year age*", "10 year age*", "age band*", "age group*", "age-group*", "ikäryhm*", "ikäluok*", "åldersgrupp*"]) },
];

export const TEXT_NONE_CUE = cue(["no text", "no free text", "without text", "without free text", "without the text", "drop the text", "remove the text", "text removed", "no notes", "no notes text", "without notes", "not the text", "no comments", "ei tekstiä", "ilman tekstiä", "ilman vapaata tekstiä", "ilman vapaatekstiä", "utan text", "ingen fritext"]);
/** Words that name the text itself. */
export const TEXT_MENTION_CUE = cue(["text", "texts", "free text", "free-text", "description text", "descriptions", "notes", "comments", "e-mail bodies", "wording", "utterance*", "teksti*", "vapaateksti*", "muistiinpano*", "kuvaukse*", "kuvaukset", "fritext*"]);
/** Words that name text-bearing records; they imply text only when the task reads them. */
export const TEXT_RECORD_CUE = cue(["transcript*", "conversation*", "chat", "chats", "chat log*", "messages", "tickets", "calls", "keskustelu*", "viesti*", "puhelu*", "samtal*"]);
export const TEXT_FLUENT_CUE = cue(["chatbot*", "intent classifier*", "intent model*", "response suggestion*", "language model*", "llm", "generative", "fine-tun*", "natural text", "fluent", "realistic", "botti*", "kielimalli*", "luonteva*"]);
export const TEXT_EVIDENCE_CUE = cue(["evidence", "verbatim", "see that", "show that", "verified identity", "verification", "card numbers refused", "refused card", "näkee että", "todiste*", "bevis*"]);
export const TEXT_TOPIC_CUE = cue(["topic*", "theme*", "contact reason*", "contact-reason*", "aihe*", "teema*", "ämne*"]);

export const LINK_ACROSS_CUE = cue(["join*", "across tables", "across banks", "across logs", "cross-log", "across all tables", "link across", "linked across", "linkable across", "same card across", "consistent pseudonym*", "consistent across", "stable pseudonym*", "together with lab*", "visit and lab", "combine*", "yhdist*", "liitet*", "taulujen välillä", "koppla*", "sammanför*"]);
export const LINK_WITHIN_CUE = cue(["repeat*", "revisit*", "per customer", "per person", "per patient", "per user", "per device", "per card", "per meter", "per metering point", "same person", "same customer", "same card", "same patient", "same user", "returning", "come back", "how often they come back", "over time", "trajector*", "series", "follow the same", "link", "linkable", "toistuv*", "uusintakäyn*", "palaav*", "saman asiakkaan", "samaa asiakasta", "saman henkilön", "aikasarj*", "återkommande", "samma kund"]);
export const LINK_NONE_CUE = cue(["no linkage", "no need to link", "don't need to link", "do not need to link", "not linkable", "unlinkable", "independent rows", "no link", "ei tarvitse yhdistää", "ei linkitystä"]);

export const SPECIAL_EXCLUDE_CUE = cue(["no health", "without health", "remove health", "exclude health", "drop health", "no medical", "without medical", "no special categor*", "without special categor*", "exclude special categor*", "no sensitive", "no art. 9", "no article 9", "ei terveys*", "ilman terveys*", "poista terveys*", "ei erityis*", "ilman erityis*", "ingen hälso*", "utan hälso*"]);
export const SPECIAL_NEEDED_CUE = cue(["diagnos*", "health", "medical", "clinical", "patient*", "symptom*", "illness*", "influenza*", "flu", "injur*", "triage*", "vital*", "terveys*", "terveyd*", "diagnoo*", "potila*", "sairau*", "hälsa*", "diagnos*"]);

export const OUTPUT_AGGREGATE_CUE = cue(["aggregate*", "aggregated", "counts", "statistic*", "tables", "matrices", "matrix", "dashboard*", "no row-level", "no microdata", "summary", "summaries", "totals", "koonti*", "tilast*", "summat", "aggregera*"]);
export const OUTPUT_ROW_CUE = cue(["row-level", "row level", "microdata", "records", "record-level", "individual rows", "raw rows", "rivitaso*", "mikroaineisto*"]);
export const OUTPUT_TEXT_CUE = cue(["transcript*", "conversation*", "chat log*", "chats", "text corpus", "corpus", "e-mails", "keskustelu*", "puhelu*", "samtal*"]);

/** Finnish / Swedish grouping concepts mapped to English phrases for column matching. */
export const FOREIGN_GROUPINGS: { re: RegExp; phrase: string }[] = [
  { re: cue(["kunnittain", "kunnan mukaan", "kunnittaisesti", "per kommun", "kommunvis"]), phrase: "municipality" },
  { re: cue(["ikäryhmittäin", "ikäryhmän mukaan", "ikäluokittain", "iän mukaan", "åldersgrupp*"]), phrase: "age band" },
  { re: cue(["kanavittain", "kanavan mukaan", "per kanal"]), phrase: "channel" },
  { re: cue(["kielittäin", "kielen mukaan", "kieliryhmittäin", "per språk"]), phrase: "language" },
  { re: cue(["sukupuolittain", "sukupuolen mukaan", "per kön"]), phrase: "sex" },
  { re: cue(["kouluittain", "koulun mukaan", "per skola"]), phrase: "school" },
  { re: cue(["postinumeroittain", "postinumeroalueittain", "postinumeron mukaan"]), phrase: "postcode" },
  { re: cue(["kategorioittain", "luokittain", "kategorian mukaan", "per kategori"]), phrase: "category" },
  { re: cue(["alueittain", "alueen mukaan"]), phrase: "area" },
  { re: cue(["syyn mukaan", "yhteydenottosyittäin", "yhteydenottosyyn mukaan"]), phrase: "contact reason" },
  { re: cue(["aiheittain", "aiheen mukaan"]), phrase: "topic" },
  { re: cue(["triageluokittain", "kiireellisyysluokittain", "triagen mukaan"]), phrase: "triage" },
  { re: cue(["diagnoosiryhmittäin", "diagnoosin mukaan"]), phrase: "diagnosis group" },
];

/** Nouns that make a phrase read as an analysis (used to pick measures out of the request). */
export const MEASURE_NOUN_CUE = cue(["time*", "rate*", "count*", "trend*", "mix", "distribution*", "volume*", "load*", "revisit*", "length of stay", "reason*", "topic*", "theme*", "pattern*", "flow*", "demand", "statistic*", "grade*", "gap*", "effect*", "consumption", "spending", "spend", "footfall", "dwell*", "visit*", "occupancy", "corridor*", "transfer*", "peak*", "curve*", "share", "risk", "profile*", "segment*", "forecast*", "prediction*", "classifier*", "model*", "insight*", "quality", "compliance", "duration*", "distance*", "choice", "result*", "completion", "drop-out*", "dropout*", "matri*", "intent*", "sentiment", "csat", "handle time", "workload*", "issue*", "detection*", "fraud*", "threat*", "attack*", "suggestion*", "indicator*", "benchmark*", "chatbot*", "aika*", "ajat", "määr*", "trendi*", "jakaum*", "kuorm*", "sy*", "aihe*", "teema*", "malli*", "ennuste*", "kulutu*", "arvosan*", "käyn*", "luku*", "osuu*", "tilast*", "tid*", "antal*", "fördelning*"]);
