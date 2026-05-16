/**
 * PubMed eutils API 호출 — esearch + efetch.
 *
 * Phase 7 `13_pubmed_candidates.py` 의 핵심 로직 포팅.
 */

const NCBI = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const KEEP_UPPER = new Set([
  "JAMA", "BMJ", "PLOS", "PLoS", "AIDS", "USA", "UK", "EU",
  "DNA", "RNA", "MRI", "CT", "FDA", "NIH", "BMC", "NEJM",
]);
const MINOR_WORDS = new Set([
  "of", "in", "on", "for", "the", "a", "an", "and", "or", "but",
  "to", "with", "by", "as", "from", "at", "is", "vs",
]);

/** Title Case 정규화 — 저널명용 (Phase 7과 동일 규칙) */
function titleCaseJournal(s: string): string {
  if (!s) return s;
  const parts = s.split(/\s+/);
  return parts
    .map((w, i) => {
      const stripped = w.replace(/[.,;:()[\]]/g, "");
      if (KEEP_UPPER.has(stripped.toUpperCase()) || (w === w.toUpperCase() && w.length <= 5)) {
        return w;
      }
      const wl = w.toLowerCase();
      if (i === 0 || !MINOR_WORDS.has(wl)) {
        if (w[0] && /[a-zA-Z]/.test(w[0])) {
          return w[0].toUpperCase() + w.slice(1).toLowerCase();
        }
        return w;
      }
      return wl;
    })
    .join(" ");
}

export type PubmedCandidate = {
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  year: string;
  authors_short: string;
  doi: string;
  publication_types: string[];
  mesh_terms: string[];
  pubmed_url: string;
  doi_url: string;
  query_used?: string;
};

async function httpGetText(url: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "pibutenten-step2/1.0" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(tm);
  }
}

async function esearch(query: string, retmax: number): Promise<string[]> {
  const apiKey = process.env.NCBI_API_KEY?.trim() || "";
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmax: String(retmax),
    retmode: "json",
    sort: "relevance",
  });
  if (apiKey) params.set("api_key", apiKey);
  const url = `${NCBI}/esearch.fcgi?${params.toString()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await httpGetText(url);
      const j = JSON.parse(text) as {
        esearchresult?: { idlist?: string[] };
      };
      return j.esearchresult?.idlist ?? [];
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 + attempt * 1000));
        continue;
      }
      console.warn("esearch fail:", query.slice(0, 60), e);
      return [];
    }
  }
  // unreachable — 모든 분기가 위에서 return 처리
  return [];
}

function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}
function tagAll(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .trim();
}

function parseEfetchXml(xml: string): PubmedCandidate[] {
  const articles = tagAll(xml, "PubmedArticle");
  const out: PubmedCandidate[] = [];
  for (const art of articles) {
    const pmid = stripTags(tagText(art, "PMID") || "");

    const titleRaw = stripTags(tagText(art, "ArticleTitle") || "");
    const title = titleRaw ? `${titleRaw.replace(/\.$/, "")}.` : "";

    // Abstract: 여러 AbstractText concat (Label 있으면 prefix)
    const abstractMatches: string[] = [];
    const reAbs = /<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi;
    let m: RegExpExecArray | null;
    while ((m = reAbs.exec(art)) !== null) {
      const attrs = m[1];
      const txt = stripTags(m[2]);
      const labelMatch = attrs.match(/\bLabel="([^"]+)"/i);
      if (labelMatch && txt) {
        abstractMatches.push(`${labelMatch[1]}: ${txt}`);
      } else if (txt) {
        abstractMatches.push(txt);
      }
    }
    const abstractText = abstractMatches.join(" ");

    // Journal: ISOAbbreviation 우선, 없으면 Title
    const journalRaw =
      stripTags(tagText(art, "ISOAbbreviation") || "") ||
      stripTags(tagText(tagText(art, "Journal") || "", "Title") || "");
    const journal = titleCaseJournal(journalRaw);

    // Year
    let year = "";
    const yearTag = stripTags(tagText(art, "Year") || "");
    if (yearTag) {
      year = yearTag;
    } else {
      const medlineDate = stripTags(tagText(art, "MedlineDate") || "");
      const my = medlineDate.match(/\b(\d{4})\b/);
      if (my) year = my[1];
    }

    // Authors
    const authorsXml = tagText(art, "AuthorList") || "";
    const authorBlocks = tagAll(authorsXml, "Author");
    const authors: string[] = [];
    for (const ab of authorBlocks) {
      const ln = stripTags(tagText(ab, "LastName") || "");
      const init = stripTags(tagText(ab, "Initials") || "");
      if (ln) authors.push(`${ln} ${init}`.trim());
    }
    let authorsShort = "";
    if (authors.length > 0) {
      authorsShort = authors.slice(0, 3).join(", ");
      if (authors.length > 3) authorsShort += " et al.";
    }

    // DOI
    let doi = "";
    const reDoi = /<ArticleId\b([^>]*IdType="doi"[^>]*)>([\s\S]*?)<\/ArticleId>/gi;
    const md = reDoi.exec(art);
    if (md) doi = stripTags(md[2]);

    // Publication types (Journal Article 제외)
    const pubTypes: string[] = [];
    const ptXml = tagText(art, "PublicationTypeList") || "";
    for (const t of tagAll(ptXml, "PublicationType")) {
      const v = stripTags(t);
      if (v && v !== "Journal Article") pubTypes.push(v);
    }

    // MeSH terms
    const meshTerms: string[] = [];
    const meshXml = tagText(art, "MeshHeadingList") || "";
    for (const mh of tagAll(meshXml, "MeshHeading")) {
      const d = stripTags(tagText(mh, "DescriptorName") || "");
      if (d) meshTerms.push(d);
    }

    out.push({
      pmid,
      title,
      abstract: abstractText,
      journal,
      year,
      authors_short: authorsShort,
      doi,
      publication_types: pubTypes,
      mesh_terms: meshTerms,
      pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doi_url: doi ? `https://doi.org/${doi}` : "",
    });
  }
  return out;
}

async function efetch(pmids: string[]): Promise<PubmedCandidate[]> {
  if (!pmids.length) return [];
  const apiKey = process.env.NCBI_API_KEY?.trim() || "";
  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    rettype: "abstract",
    retmode: "xml",
  });
  if (apiKey) params.set("api_key", apiKey);
  const url = `${NCBI}/efetch.fcgi?${params.toString()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const xml = await httpGetText(url, 25000);
      return parseEfetchXml(xml);
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 + attempt * 1000));
        continue;
      }
      console.warn("efetch fail:", e);
      return [];
    }
  }
  // unreachable — 모든 분기가 위에서 return 처리
  return [];
}

/**
 * PMID 1개로 직접 efetch — 운영자가 PMID를 알 때 reference 객체 생성용.
 *
 * 반환: 한 개의 PubmedCandidate (정상) 또는 null (없음/오류).
 */
export async function fetchPubmedByPmid(
  pmid: string,
): Promise<PubmedCandidate | null> {
  const cleaned = (pmid || "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const results = await efetch([cleaned]);
  if (!results.length) return null;
  return results[0];
}

/**
 * 카드의 pubmed_search_keywords 리스트로 시도 — 첫 결과가 있는 쿼리의 후보 반환.
 * RPS 제한 회피용 sleep 포함 (NCBI: 키 없으면 ~3req/s).
 */
export async function fetchPubmedCandidates(
  keywords: string[],
  retmax: number,
): Promise<PubmedCandidate[]> {
  const apiKey = process.env.NCBI_API_KEY?.trim() || "";
  const sleep = apiKey ? 110 : 400;
  for (const q of keywords) {
    const query = (q || "").trim();
    if (!query) continue;
    const ids = await esearch(query, retmax);
    await new Promise((r) => setTimeout(r, sleep));
    if (!ids.length) continue;
    const cands = await efetch(ids);
    await new Promise((r) => setTimeout(r, sleep));
    if (cands.length > 0) {
      return cands.map((c) => ({ ...c, query_used: query }));
    }
  }
  return [];
}
