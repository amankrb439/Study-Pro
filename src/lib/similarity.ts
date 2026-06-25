/**
 * Utility to detect if two chapter titles are semantically similar.
 * This handles Hindi/English bilingual text, prefix numbers (1., 2., 22. etc),
 * and minor text variations.
 */
export function areChaptersSimilar(t1: string, t2: string): boolean {
  const clean = (text: string) => {
    // Remove numbers and periods/spaces/dashes at the start (e.g., "1. ", "12. ", "1 - ")
    return text.replace(/^\d+[\s\.\-\)]+/, "").toLowerCase().trim();
  };

  const clean1 = clean(t1);
  const clean2 = clean(t2);

  if (clean1 === clean2) return true;
  if (!clean1 || !clean2) return false;

  // Extract English words
  const getEnglishWords = (text: string) => {
    const matches = text.match(/[a-zA-Z]+/g) || [];
    return matches.map(w => w.toLowerCase()).filter(w => w.length > 2);
  };

  // Extract Hindi words
  const getHindiWords = (text: string) => {
    const matches = text.match(/[\u0900-\u097F]+/g) || [];
    return matches.map(w => w.toLowerCase()).filter(w => w.length > 1);
  };

  const eng1 = getEnglishWords(clean1);
  const eng2 = getEnglishWords(clean2);
  const hin1 = getHindiWords(clean1);
  const hin2 = getHindiWords(clean2);

  // If both have English words, check for substantial word overlaps
  const stopWords = new Set(["and", "the", "for", "with", "from", "its", "new", "of", "in"]);
  const filteredEng1 = eng1.filter(w => !stopWords.has(w));
  const filteredEng2 = eng2.filter(w => !stopWords.has(w));
  
  if (filteredEng1.length > 0 && filteredEng2.length > 0) {
    const commonEng = filteredEng1.filter(w => filteredEng2.includes(w));
    const unionEng = new Set([...filteredEng1, ...filteredEng2]).size;
    const jaccardEng = commonEng.length / unionEng;
    if (jaccardEng >= 0.6) {
      return true;
    }
  }

  // If both have Hindi words, check for substantial Hindi overlaps
  const stopWordsHin = new Set(["और", "तथा", "एवं", "का", "के", "की", "में", "से", "पर"]);
  const filteredHin1 = hin1.filter(w => !stopWordsHin.has(w));
  const filteredHin2 = hin2.filter(w => !stopWordsHin.has(w));

  if (filteredHin1.length > 0 && filteredHin2.length > 0) {
    const commonHin = filteredHin1.filter(w => filteredHin2.includes(w));
    const unionHin = new Set([...filteredHin1, ...filteredHin2]).size;
    const jaccardHin = commonHin.length / unionHin;
    if (jaccardHin >= 0.6) {
      return true;
    }
  }

  return false;
}
