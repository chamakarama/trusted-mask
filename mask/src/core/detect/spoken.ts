/** Spoken-number and spelled-out vocabulary for Finnish, Swedish and English ASR / chat text. */

export const DIGIT_WORDS: ReadonlyMap<string, string> = new Map<string, string>([
  // Finnish (incl. common ASR spellings without diacritics)
  ["nolla", "0"], ["yksi", "1"], ["kaksi", "2"], ["kolme", "3"], ["neljä", "4"], ["nelja", "4"], ["viisi", "5"], ["kuusi", "6"],
  ["seitsemän", "7"], ["seitseman", "7"], ["kahdeksan", "8"], ["yhdeksän", "9"], ["yhdeksan", "9"],
  // Swedish ("en" is too ambiguous; only "ett")
  ["noll", "0"], ["ett", "1"], ["två", "2"], ["tva", "2"], ["tre", "3"], ["fyra", "4"], ["fem", "5"], ["sex", "6"], ["sju", "7"],
  ["åtta", "8"], ["atta", "8"], ["nio", "9"],
  // English
  ["zero", "0"], ["oh", "0"], ["one", "1"], ["two", "2"], ["three", "3"], ["four", "4"], ["five", "5"], ["six", "6"],
  ["seven", "7"], ["eight", "8"], ["nine", "9"],
]);

/** Words that are digits but also very common ordinary words: never start a spoken run on their own. */
export const WEAK_DIGIT_WORDS: ReadonlySet<string> = new Set(["oh", "one", "sex", "ett", "tre", "fem", "två", "six"]);

/** Separator words inside a spoken identifier ("viiva", "streck", "dash"). */
export const SEP_WORDS: ReadonlySet<string> = new Set(["viiva", "väliviiva", "streck", "bindestreck", "dash", "hyphen", "miinus", "minus"]);

/** Letter names used when spelling a HETU century sign / check character or an IBAN country code. */
export const LETTER_WORDS: ReadonlyMap<string, string> = new Map<string, string>([
  // Finnish
  ["aa", "A"], ["bee", "B"], ["see", "C"], ["dee", "D"], ["ee", "E"], ["äf", "F"], ["hoo", "H"], ["jii", "J"], ["koo", "K"],
  ["äl", "L"], ["äm", "M"], ["än", "N"], ["pee", "P"], ["är", "R"], ["äs", "S"], ["tee", "T"], ["uu", "U"], ["vee", "V"],
  ["kaksoisvee", "W"], ["äks", "X"], ["yy", "Y"],
  // Swedish
  ["be", "B"], ["ce", "C"], ["de", "D"], ["eff", "F"], ["hå", "H"], ["ji", "J"], ["kå", "K"], ["ell", "L"], ["emm", "M"],
  ["enn", "N"], ["pe", "P"], ["ärr", "R"], ["ess", "S"], ["te", "T"], ["ve", "V"], ["ex", "X"],
  // English
  ["cee", "C"], ["ef", "F"], ["aitch", "H"], ["jay", "J"], ["kay", "K"], ["el", "L"], ["em", "M"], ["en", "N"], ["ar", "R"],
  ["you", "U"], ["why", "Y"], ["double-u", "W"],
]);

/** Filler words that ASR inserts in the middle of a spoken number. */
export const FILLERS: ReadonlySet<string> = new Set([
  "tota", "toota", "öö", "ööh", "öh", "äh", "niinku", "elikkä", "eli", "siis", "joo", "no", "um", "uh", "erm", "er", "like",
  "alltså", "liksom", "typ", "eh", "hmm",
]);

/** Spelled-out e-mail connectors. */
export const EMAIL_AT: ReadonlySet<string> = new Set(["ät", "at", "snabel-a", "@", "miukumauku", "kissanhäntä"]);
export const EMAIL_DOT: ReadonlySet<string> = new Set(["piste", "dot", "punkt"]);
export const EMAIL_JOIN: ReadonlySet<string> = new Set(["piste", "dot", "punkt", "alaviiva", "underscore", "understreck", "viiva", "dash", "streck", "väliviiva", "bindestreck", "_", "-"]);
