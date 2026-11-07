import { describe, expect, it } from "vitest";
import { GoalSpecSchema } from "@/contracts";
import { HeuristicGoalInterpreter, interpretGoalText } from "./heuristic";
import { CS_MANIFEST, STATS_MANIFEST } from "./testkit";

const run = (text: string, ctx: Partial<Parameters<typeof interpretGoalText>[1]> = {}) => interpretGoalText(text, { answers: {}, ...ctx });
const qids = (s: ReturnType<typeof run>) => s.unresolved.map((q) => q.id);

describe("HeuristicGoalInterpreter", () => {
  it("returns a valid, deterministic spec", async () => {
    const i = new HeuristicGoalInterpreter();
    const a = await i.interpret("Find contact reason trends with our cloud AI vendor", { answers: {} });
    const b = await i.interpret("Find contact reason trends with our cloud AI vendor", { answers: {} });
    expect(GoalSpecSchema.parse(a)).toBeTruthy();
    expect(a).toEqual(b);
    expect(i.id).toBe("heuristic");
    expect(a.provenance.interpreter).toBe("heuristic");
  });

  it("reads a short request: recipient, trust, task, text need, scenario", () => {
    const s = run("Find contact reason trends with our cloud AI vendor");
    expect(s.recipient.trustLevel).toBe("contractual");
    expect(s.recipient.description).toBe("cloud AI vendor");
    expect(s.task.kind).toBe("topic_mining");
    expect(s.textNeed).toBe("topic_only");
    expect(s.outputForm).toBe("text_corpus");
    expect(s.provenance.scenarioMatch).toBe("CS-S1");
    expect(s.resolution.time).toBe("hour");
    expect(s.exclusions).toContain("special_category");
    expect(s.unresolved).toEqual([]);
    expect(s.provenance.notes.some((n) => n.startsWith("recipient: 'cloud ai vendor' → contractual"))).toBe(true);
    expect(s.provenance.notes.some((n) => n.includes("filled") && n.includes("not stated"))).toBe(true);
  });

  it("does not copy the scenario over what the text states", () => {
    const s = run("Send transcripts to an external AI vendor for contact-reason trends, rounded to the day.");
    expect(s.provenance.scenarioMatch).toBe("CS-S1");
    expect(s.resolution.time).toBe("day");
  });

  it("keeps an explicit public recipient out of research/vendor readings", () => {
    expect(run("Publish weekly OD flows between areas by hour band for journey planners, researchers and citizens.").recipient.trustLevel).toBe("public");
    expect(run("Public-transport ridership study for the university research group").recipient.trustLevel).toBe("controlled_research");
    expect(run("Our team wants to share the logs with an external vendor").recipient.trustLevel).toBe("contractual");
  });

  it("handles audit and model-training text needs", () => {
    const audit = run("Score 300 calls a month for compliance at our QA partner");
    expect(audit.task.kind).toBe("quality_audit");
    expect(audit.textNeed).toBe("verbatim_evidence");
    const bot = run("Our data science team wants to train a chatbot on the transcripts");
    expect(bot.recipient.trustLevel).toBe("internal");
    expect(bot.task.kind).toBe("model_training");
    expect(bot.textNeed).toBe("fluent");
  });

  it("detects resolution words and ignores periods and frequencies", () => {
    expect(run("Publish counts per municipality, rounded to the week").resolution.time).toBe("week");
    expect(run("Give researchers exact times of arrival").resolution.time).toBe("exact");
    expect(run("Police want all plates over two weeks for an investigation").resolution.time).toBeUndefined();
    expect(run("Open data on load per 3-digit postcode").resolution.location).toBe("postcode3");
    expect(run("Publish statistics by 5-year age band").resolution.ageBandYears).toBe(5);
  });

  it("exclusions: explicit wish, automatic for external non-health tasks, none for health research", () => {
    const explicit = run("Internal dashboards on workload, no health data please");
    expect(explicit.exclusions).toEqual(["special_category"]);
    const auto = run("Share card transactions with an external vendor to build a fraud model");
    expect(auto.exclusions).toEqual(["special_category"]);
    expect(auto.provenance.notes.some((n) => n.startsWith("exclusions:"))).toBe(true);
    expect(run("University researchers study length of stay and diagnosis patterns").exclusions).toEqual([]);
  });

  it("an authority request does not get a trust level from wording", () => {
    const s = run("The police ask for every number plate for an investigation", { manifest: STATS_MANIFEST });
    expect(s.task.kind).toBe("other");
    expect(s.recipient.description.toLowerCase()).toContain("police");
  });
});

describe("Finnish and Swedish", () => {
  it("Finnish: external AI vendor, topic mining", () => {
    const s = run("Haluamme jakaa asiakaspalvelun keskustelut ulkoiselle tekoälytoimittajalle yhteydenottosyiden trendien löytämiseksi.");
    expect(s.recipient.trustLevel).toBe("contractual");
    expect(s.task.kind).toBe("topic_mining");
    expect(s.textNeed).toBe("topic_only");
    expect(s.provenance.scenarioMatch).toBe("CS-S1");
  });

  it("Finnish: university research on ED revisits", () => {
    const s = run("Yliopiston tutkimusryhmä tutkii päivystyksen hoitoaikoja ja uusintakäyntejä.");
    expect(s.recipient.trustLevel).toBe("controlled_research");
    expect(s.task.kind).toBe("research");
    expect(s.linkage).toBe("within_table");
    expect(s.provenance.scenarioMatch).toBe("HEALTH-S1");
  });

  it("Finnish: public weekly statistics by municipality and age group", () => {
    const s = run("Julkaistaan viikoittaiset tilastot päivystyskäynneistä kunnittain ja ikäryhmittäin avoimena datana.", { manifest: STATS_MANIFEST });
    expect(s.recipient.trustLevel).toBe("public");
    expect(s.task.kind).toBe("statistics");
    expect(s.outputForm).toBe("aggregate");
    expect(s.resolution.time).toBe("week");
    expect(s.resolution.location).toBe("municipality");
    expect(s.groupings).toEqual(expect.arrayContaining(["municipality", "age_band"]));
  });

  it("Finnish: internal chatbot training and outsourced quality audit", () => {
    const bot = run("Sisäinen data science -tiimimme kouluttaa chatbotin asiakaspalvelukeskusteluista.");
    expect(bot.recipient.trustLevel).toBe("internal");
    expect(bot.task.kind).toBe("model_training");
    expect(bot.textNeed).toBe("fluent");
    const qa = run("Lähetämme kuukausittain otoksen keskusteluista ulkoistetulle laadunvarmistuskumppanille, joka arvioi vaatimustenmukaisuuden.");
    expect(qa.recipient.trustLevel).toBe("contractual");
    expect(qa.task.kind).toBe("quality_audit");
    expect(qa.textNeed).toBe("verbatim_evidence");
  });

  it("Swedish (best effort): open weekly statistics per municipality", () => {
    const s = run("Publicera veckovis statistik över akutbesök per kommun som öppna data.", { manifest: STATS_MANIFEST });
    expect(s.recipient.trustLevel).toBe("public");
    expect(s.task.kind).toBe("statistics");
    expect(s.resolution.time).toBe("week");
    expect(s.groupings).toContain("municipality");
  });
});

describe("questions only when the answer changes protection", () => {
  it("asks who receives the data when no recipient is stated and nothing matches", () => {
    const s = run("Analyse handle time by channel", { manifest: CS_MANIFEST });
    expect(qids(s)).toContain("recipient");
    expect(s.unresolved.find((q) => q.id === "recipient")!.options!.map((o) => o.value)).toEqual(["internal", "contractual", "controlled_research", "public"]);
  });

  it("asks about text only when text columns exist and the task does not imply it", () => {
    expect(qids(run("Analyse handle time by channel for our internal team", { manifest: CS_MANIFEST }))).toContain("text_need");
    expect(qids(run("Analyse handle time by channel for our internal team", { manifest: STATS_MANIFEST }))).not.toContain("text_need");
    expect(qids(run("Find contact reason trends with our cloud AI vendor", { manifest: CS_MANIFEST }))).not.toContain("text_need");
  });

  it("asks about linkage for ambiguous row-level tasks only", () => {
    expect(qids(run("Analyse handle time by channel for our internal team", { manifest: CS_MANIFEST }))).toContain("linkage");
    expect(qids(run("Analyse repeat contacts per customer for our internal team", { manifest: CS_MANIFEST }))).not.toContain("linkage");
    expect(qids(run("Publish weekly counts of conversations by channel as open data", { manifest: CS_MANIFEST }))).not.toContain("linkage");
  });

  it("asks about time precision when timestamps exist, time matters and no resolution is given", () => {
    expect(qids(run("Analyse contact volume trends by channel for our internal team", { manifest: CS_MANIFEST }))).toContain("time_resolution");
    expect(qids(run("Analyse hourly contact volume trends by channel for our internal team", { manifest: CS_MANIFEST }))).not.toContain("time_resolution");
    expect(qids(run("Analyse contact volume trends by channel for our internal team", { manifest: STATS_MANIFEST }))).not.toContain("time_resolution");
  });

  it("still asks for the recipient when only a scenario supplied it", () => {
    const s = run("Parking enforcement wants every licence plate and card payment from the Riverside car park for the last two weeks.");
    expect(s.provenance.scenarioMatch).toBe("CITY-S3");
    expect(s.recipient.trustLevel).toBe("internal"); // provisional, from the scenario
    expect(qids(s)).toContain("recipient");
    expect(run("Parking enforcement wants every licence plate for an investigation", { answers: { recipient: "contractual" } }).recipient.trustLevel).toBe("contractual");
  });

  it("an unfamiliar external company is not read as internal", () => {
    const s = run("We want to give the conversations to a startup that builds a chatbot for us");
    expect(s.recipient.trustLevel).toBe("contractual");
    expect(s.task.kind).toBe("model_training");
  });

  it("a clear request with a manifest asks nothing", () => {
    expect(run("Publish weekly counts of conversations by channel as open data", { manifest: CS_MANIFEST }).unresolved).toEqual([]);
  });
});

describe("answers and previous edits", () => {
  it("answers resolve their questions and set the fields", () => {
    const text = "Analyse contact volume trends by channel";
    const first = run(text, { manifest: CS_MANIFEST });
    expect(qids(first)).toEqual(["recipient", "text_need", "linkage", "time_resolution"]);
    const answered = run(text, { manifest: CS_MANIFEST, answers: { recipient: "internal", text_need: "none", linkage: "within_table", time_resolution: "day" } });
    expect(answered.unresolved).toEqual([]);
    expect(answered.recipient.trustLevel).toBe("internal");
    expect(answered.textNeed).toBe("none");
    expect(answered.linkage).toBe("within_table");
    expect(answered.resolution.time).toBe("day");
    expect(answered.goalId).not.toBe(first.goalId);
  });

  it("ignores invalid answers", () => {
    const s = run("Analyse handle time by channel", { manifest: CS_MANIFEST, answers: { recipient: "everyone!" } });
    expect(qids(s)).toContain("recipient");
  });

  it("keeps user-edited fields when the same text is re-interpreted", () => {
    const text = "Find contact reason trends with our cloud AI vendor";
    const first = run(text);
    const edited = { ...first, textNeed: "verbatim_evidence" as const, groupings: ["intent", "language"] };
    const again = run(text, { previous: edited });
    expect(again.textNeed).toBe("verbatim_evidence");
    expect(again.groupings).toEqual(["intent", "language"]);
    expect(again.provenance.notes.some((n) => n.startsWith("kept your edits"))).toBe(true);
    // a different text starts fresh
    expect(run("Find contact reason trends with our cloud AI vendor, by channel", { previous: edited }).textNeed).toBe("topic_only");
  });

  it("answers override a previous edit of the same field", () => {
    const text = "Analyse handle time by channel";
    const first = run(text, { manifest: CS_MANIFEST });
    const edited = { ...first, recipient: { ...first.recipient, trustLevel: "public" as const } };
    const s = run(text, { manifest: CS_MANIFEST, previous: edited, answers: { recipient: "internal" } });
    expect(s.recipient.trustLevel).toBe("internal");
  });
});

describe("column matching against the manifest", () => {
  it("matches groupings and mentions by column-name tokens", () => {
    const s = run("Our internal team needs average handle time by intent and channel", { manifest: CS_MANIFEST });
    expect(s.groupings).toEqual(["intent", "channel"]);
    expect(s.requiredFields).toEqual(expect.arrayContaining(["handle_time_s", "intent", "channel"]));
  });

  it("does not map 'contact reason' to intent by synonym", () => {
    const s = run("Our internal team analyses volumes by contact reason", { manifest: CS_MANIFEST });
    expect(s.groupings).toEqual(["contact reason"]);
    expect(s.requiredFields).not.toContain("intent");
  });

  it("'per customer' matches customer_id; language prefers the exact column", () => {
    const s = run("Internal analysis of repeat contacts per customer by language", { manifest: CS_MANIFEST });
    expect(s.groupings).toEqual(["customer_id", "language"]);
  });

  it("scenario columns are filtered to the uploaded dataset", () => {
    const s = run("Find contact reason trends with our cloud AI vendor", { manifest: CS_MANIFEST });
    expect(s.groupings).toEqual(["intent", "channel"]);
    for (const f of s.requiredFields) expect(["text", "turns.text", "intent", "handle_time_s", "channel", "started_ts"]).toContain(f);
  });
});
