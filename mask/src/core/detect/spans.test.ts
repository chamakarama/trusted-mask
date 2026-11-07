import { describe, expect, it } from "vitest";
import { createRulesSpanDetector, withinEdits } from "./spans";

const det = createRulesSpanDetector();
/** [label, text] pairs of every span found */
const found = (text: string, prev?: string) => det.detect(text, prev ? { previousText: prev } : undefined).map((s) => [s.label, text.slice(s.start, s.end)]);
const has = (text: string, label: string, value: string, prev?: string) => expect(found(text, prev)).toContainEqual([label, value]);
const none = (text: string, label?: string) => expect(found(text).filter(([l]) => !label || l === label)).toEqual([]);

describe("person names", () => {
  it("cue phrases in fi / sv / en, lowercase ASR included", () => {
    has("Moi, nimeni on Matti Rintamäki. Wifi on tosi hidas", "PERSON", "Matti Rintamäki");
    has("hej jag heter viktor ilvesranta", "PERSON", "viktor ilvesranta");
    has("Hello, my name is Ivan Morozov.", "PERSON", "Ivan Morozov");
    has("aallokko hyvää päivää täällä puhuu kaija", "PERSON", "kaija");
    has("hei tässä maria kesäkallio miksi minua on laskutettu", "PERSON", "maria kesäkallio");
    has("Asiakas Ksenia Sokolova (49019743) otti yhteyttä", "PERSON", "Ksenia Sokolova");
    has("Ystävällisin terveisin Juho Laiho Aallokko asiakaspalvelu", "PERSON", "Juho Laiho");
  });
  it("relatives: only the name, not the relation word", () => {
    has("Äitini Pirkko hoitaa laskut", "PERSON", "Pirkko");
  });
  it("agent initials in notes", () => {
    has("Puhelu: reititinongelma. Ei jatkotoimia. /IKAU", "PERSON", "IKAU");
  });
  it("common words that are also names are not persons; Aallokko and the bot Aava are not persons", () => {
    none("onneksi lunta tuli niin paljon", "PERSON");
    none("Tervetuloa Aallokon chattiin! Olen Aava, virtuaaliavustaja.", "PERSON");
  });
});

describe("national ID", () => {
  it("typed, partial and spoken forms", () => {
    has("Verified with ID code 020782-918P. Credit issued.", "NATIONAL_ID", "020782-918P");
    has("henkilötunnus yksi kuusi, nolla kuusi, kuusi kuusi, viiva, yhdeksän kolme yksi, seitsemän", "NATIONAL_ID",
      "yksi kuusi, nolla kuusi, kuusi kuusi, viiva, yhdeksän kolme yksi, seitsemän");
    has("zero two, zero seven, eight two, dash, nine one eight, p", "NATIONAL_ID", "zero two, zero seven, eight two, dash, nine one eight, p");
    has("personbeteckningen är 050949 streck 957 0", "NATIONAL_ID", "050949 streck 957 0");
    has("sara heinänen hetu on nolla kolme, nolla yhdeksän, nolla yksi, aa, yhdeksän kolme kuusi, äm", "NATIONAL_ID",
      "nolla kolme, nolla yhdeksän, nolla yksi, aa, yhdeksän kolme kuusi, äm");
    has("-921n", "NATIONAL_ID", "-921n");
  });
});

describe("contact details", () => {
  it("typed and spelled e-mails", () => {
    has("Tarkistan vielä: sähköpostisi on essi.tervojarvi@aurapost.example, pitääkö paikkansa", "EMAIL", "essi.tervojarvi@aurapost.example");
    has("just to confirm your email is noor dot hussein at inbox dot example", "EMAIL", "noor dot hussein at inbox dot example");
    has("iida alaviiva kukkonen ät postilaatikko piste example", "EMAIL", "iida alaviiva kukkonen ät postilaatikko piste example");
    has("viktoraberg snabel-a inbox punkt example", "EMAIL", "viktoraberg snabel-a inbox punkt example");
    none("You can reach the router admin page at 192.168.1.1. The default password is on the label", "EMAIL");
  });
  it("phones in any format, spoken digits and fragments", () => {
    has("Onko numero 040 711 3232 edelleen oikea?", "PHONE", "040 711 3232");
    has("soittakaa minulle numeroon +358412317081.", "PHONE", "+358412317081");
    has("onko numero nolla neljä yksi, kolme kahdeksan seitsemän, yhdeksän nolla kaksi kolme edelleen oikea", "PHONE",
      "nolla neljä yksi, kolme kahdeksan seitsemän, yhdeksän nolla kaksi kolme");
    has("Är noll fyra fem, åtta fyra åtta, fyra noll åtta fyra fortfarande rätt?", "PHONE", "noll fyra fem, åtta fyra åtta, fyra noll åtta fyra");
    has("2857058", "PHONE", "2857058");
  });
  it("prices and generic gateways are not identifiers", () => {
    none("liittymäni pitäisi maksaa vain 19,90 €");
    none("Reitittimen osoite on 192.168.1.1", "IP_ADDRESS");
    has("I can see your public IP 100.87.146.234, the line is up", "IP_ADDRESS", "100.87.146.234");
  });
});

describe("finance and account numbers", () => {
  it("IBAN typed and spoken", () => {
    has("tilinumero on FI49 9123 4567 8901 23", "IBAN", "FI49 9123 4567 8901 23");
    has("f i yksi neljä, yhdeksän viisi kolme neljä, viisi yksi kaksi kolme, kahdeksan neljä kahdeksan yksi, nolla kahdeksan", "IBAN",
      "f i yksi neljä, yhdeksän viisi kolme neljä, viisi yksi kaksi kolme, kahdeksan neljä kahdeksan yksi, nolla kahdeksan");
  });
  it("cards: full Luhn numbers and last-4 references", () => {
    has("maksan kortilla 4242 4242 4242 4242 voimassa 02/29", "PAYMENT_CARD", "4242 4242 4242 4242");
    has("veloitus on kortilla, joka päättyy 9717.", "PAYMENT_CARD", "9717");
    has("the direct charge is on the card ending 2394.", "PAYMENT_CARD", "2394");
  });
  it("customer and invoice numbers, also with typos and spoken digits", () => {
    has("asiakasnumeroni on 46450965, nimellä ari k", "ACCOUNT_NUMBER", "46450965");
    has("Asiakasnmueroni on 4229 6788", "ACCOUNT_NUMBER", "4229 6788");
    has("katsoin laskun kaksi viisi kaksi, kahdeksan yhdeksän seitsemän, neljä yksi kaksi, yksi. Siinä on lisäpalvelu", "ACCOUNT_NUMBER",
      "kaksi viisi kaksi, kahdeksan yhdeksän seitsemän, neljä yksi kaksi, yksi");
    has("Kan jag få kundnummer? mitt kundnummer är 41234567", "ACCOUNT_NUMBER", "41234567");
  });
});

describe("secrets, devices, property, plates, URLs, usernames", () => {
  it("secrets after cue words, typos included", () => {
    has("wifin salasana on varmaan Kesä2024", "SECRET", "Kesä2024");
    has("PIN-koodi on 4830", "SECRET", "4830");
    has("mitt lösenord är bengt53# om det hjälper", "SECRET", "bengt53#");
    has("Slaasanani on KoiraHalli7 jos se auttaa", "SECRET", "KoiraHalli7");
    has("wifi password is prrobably Salasana123", "SECRET", "Salasana123");
  });
  it("device ids, property ids, plates, URLs and usernames", () => {
    has("IMEI 35979 01952 09278", "DEVICE_ID", "35979 01952 09278");
    has("imei kolme viisi neljä kolme yksi, kolme neljä kaksi kahdeksan kaksi, yhdeksän nolla nolla viisi yhdeksän", "DEVICE_ID",
      "kolme viisi neljä kolme yksi, kolme neljä kaksi kahdeksan kaksi, yhdeksän nolla nolla viisi yhdeksän");
    has("Mökin kiinteistötunnus on 445-412-3-77, osoite Rinnekatu 3", "PROPERTY_ID", "445-412-3-77");
    has("asemaan pitää liittää auto rekkari xct-561", "LICENSE_PLATE", "xct-561");
    has("Lähetin salasanan vaihtolinkin: https://oma.aallokko.example/reset?token=455e3738&email=a%40b.example", "URL",
      "https://oma.aallokko.example/reset?token=455e3738&email=a%40b.example");
    none("Ohjeet löytyvät osoitteesta https://www.aallokko.example/tuki", "URL");
    has("Käyttäjätunnukseni on emiliak99.", "USERNAME", "emiliak99");
  });
});

describe("places, dates, ages, organisations, health", () => {
  it("addresses with postcode and town; locations", () => {
    has("Osoitteeksi minulla näkyy Kirkkokuja 21 A 3, 21420 Lieto, onko se ajan tasalla", "ADDRESS", "Kirkkokuja 21 A 3, 21420 Lieto");
    has("Olin lomalla Thaimaassa ja nyt laskussa on datamaksuja", "LOCATION", "Thaimaassa");
    has("Kotikuntani on Turku, ja kotona kuuluvuus on huono", "LOCATION", "Turku");
  });
  it("dates and ages tied to the person", () => {
    has("olen syntynyt 23.3.1980", "DATE", "23.3.1980");
    has("I was born on July 3", "DATE", "July 3");
    has("Olen 83-vuotias enkä osaa", "AGE", "83");
    has("äitini on 84 vuotta, hoidan hänen asioitaan", "AGE", "84");
    has("My mum is 92, I handle her account", "AGE", "92");
    none("klo 14.30. soitan uudelleen", "DATE");
  });
  it("organisations: employers, operators, banks; not Aallokko", () => {
    has("Työnantajani Meridian Logistics Oy maksaa puolet", "ORG", "Meridian Logistics Oy");
    has("numero on jumissa, vanha operaattori on Saarni Net. Mitä tapahtuu", "ORG", "Saarni Net");
    has("työpaikkani öö on lehvä huolto oy ja tarvitsen", "ORG", "lehvä huolto oy");
    none("Aallokko Telecom Oy asiakaspalvelu", "ORG");
  });
  it("health remarks as clauses", () => {
    has("Anteeksi jos olen hidas, äitini sairastaa muistisairautta.", "HEALTH", "äitini sairastaa muistisairautta");
    has("I couldn't deal with this earlier because I've been on sick leave for depression.", "HEALTH", "I've been on sick leave for depression");
    has("Asiakas kertoi: minulla on kuulolaite, enkä kuule puhelimessa kunnolla.", "HEALTH", "minulla on kuulolaite, enkä kuule puhelimessa kunnolla");
  });
});

describe("engine properties", () => {
  it("bounded edit distance", () => {
    expect(withinEdits("asiakasnmueroni", "asiakasnumeroni", 2)).toBe(true);
    expect(withinEdits("passwword", "password", 1)).toBe(true);
    expect(withinEdits("customer", "password", 2)).toBe(false);
  });
  it("is deterministic and never returns overlapping spans", () => {
    const text = "Hei, Aino Virtanen tässä. Hetu 210814A966S, puh 040 344 1391, aino.v@kotiposti.example, Koivukatu 12 B 14, 20100 Turku. Kortti 4242 4242 4242 4242.";
    const a = det.detect(text), b = det.detect(text);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i]!.start).toBeGreaterThanOrEqual(a[i - 1]!.end);
    expect(a.map((s) => s.label)).toEqual(["PERSON", "NATIONAL_ID", "PHONE", "EMAIL", "ADDRESS", "PAYMENT_CARD"]);
  });
  it("uses the previous turn to type a fragment", () => {
    has("kaksi neljä", "NATIONAL_ID", "kaksi neljä", "Voisitko kertoa henkilötunnuksesi, niin löydän tietosi?");
  });
});
