import { describe, expect, it } from "vitest";
import * as V from "./validators";

describe("validators (port of petpilot/validators.py)", () => {
  it("HETU with checksum, century signs and birth date", () => {
    expect(V.isHetu("131052-308T")).toBe(true);
    expect(V.isHetu("131052-308U")).toBe(false);
    expect(V.isHetu("131052A308T")).toBe(true); // century sign is not part of the checksum
    expect(V.isHetu("131052308T")).toBe(true);  // without sign
    expect(V.isHetu("321052-308T")).toBe(false);
    expect(V.hetuBirthdate("131052-308T")).toBe("1952-10-13");
    expect(V.hetuBirthdate("010203A123B")).toBe("2003-02-01");
    expect(V.hetuCheckChar("131052308")).toBe("T");
  });
  it("IBAN mod-97", () => {
    expect(V.isIban("FI21 1234 5600 0007 85")).toBe(true);
    expect(V.isIban("FI21 1234 5600 0007 86")).toBe(false);
    expect(V.isIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
  });
  it("Luhn payment cards and masked cards", () => {
    expect(V.luhnOk("4242424242424242")).toBe(true);
    expect(V.isPaymentCard("4242 4242 4242 4242")).toBe(true);
    expect(V.isPaymentCard("4242 4242 4242 4241")).toBe(false);
    expect(V.isPaymentCard("9246 0000 0000 0006")).toBe(false); // Luhn-valid travel card id, not a payment card
    expect(V.isPaymentCard("**** **** **** 1234")).toBe(true);
  });
  it("email, phone, plate, MAC, IP, hostname, hash, URL", () => {
    expect(V.isEmail("aino.v@kotiposti.example")).toBe(true);
    expect(V.isEmail("aino.v@")).toBe(false);
    expect(V.isPhone("+358 40 344 1391")).toBe(true);
    expect(V.isPhone("040-3441391")).toBe(true);
    expect(V.isPhone("12345")).toBe(false);
    expect(V.isPlate("ABC-123")).toBe(true);
    expect(V.isPlate("ABCD-123")).toBe(false);
    expect(V.isMac("00:1A:2b:3C:4d:5E")).toBe(true);
    expect(V.ipKind("100.72.13.5")).toBe("ip");
    expect(V.ipKind("10.0.0.0/8")).toBe("net");
    expect(V.ipKind("256.1.1.1")).toBe(null);
    expect(V.ipKind("2001:db8::1")).toBe("ip");
    expect(V.isHostname("LT-AINVIR-0423")).toBe(true);
    expect(V.hashKind("d41d8cd98f00b204e9800998ecf8427e")).toBe("md5");
    expect(V.isUrl("https://oma.example/reset?token=abc")).toBe(true);
  });
  it("dates, timestamps, periods and temporal parsing", () => {
    expect(V.parseDate("15.3.2025")).toBe("2025-03-15");
    expect(V.parseDate("2025-02-30")).toBe(null);
    expect(V.parseDate("1.1.99")).toBe("1999-01-01");
    expect(V.isTimestamp("2025-09-27 15:47:10")).toBe(true);
    expect(V.isPeriod("2025-Q3")).toBe(true);
    expect(V.parseTemporal("2025-09-27 15:47:10")).toEqual({ iso: "2025-09-27T15:47:10", hasTime: true });
    expect(V.parseTemporal("15.3.2025")).toEqual({ iso: "2025-03-15", hasTime: false });
  });
  it("addresses, person and organisation names", () => {
    expect(V.isStreetAddress("Koivukatu 12 B 14, 20100 Turku")).toBe(true);
    expect(V.isStreetAddress("Koivukatu")).toBe(false);
    expect(V.isPersonName("Aino Virtanen")).toBe(true);
    expect(V.isPersonName("Meridian Logistics Oy")).toBe(false);
    expect(V.isOrgName("Meridian Logistics Oy")).toBe(true);
    expect(V.isPersonName("Bus stop 12")).toBe(false);
  });
});
