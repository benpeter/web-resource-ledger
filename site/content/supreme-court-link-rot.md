---
layout: layouts/doc.njk
title: Link Rot in Supreme Court Opinions
description: We checked all 1,242 web addresses the US Supreme Court cited in its opinions from 2005 to 2024. Of those with a clear answer, 41% no longer work.
---

# Link rot in Supreme Court opinions

The Supreme Court of the United States lists every web address its opinions cite, term by term, on its page [Online Sources Cited in Opinions](https://www.supremecourt.gov/opinions/urls_cited.aspx). On 26 November 2026 we checked all of them, from the October 2005 term to the October 2024 term: 1,242 citations, 1,209 different addresses.

Of the citations where the site gave a clear answer, 41% no longer lead anywhere. For the opinions of 2005 to 2009 it is 76%. Pages cited in the last two terms are already gone in more than one case in eight.

## Results

We loaded each address once, followed redirects, and sorted the answer into one of three outcomes:

- Still there: the site answers with the page (HTTP 2xx) at the cited address or one it redirects to.
- Gone: the site answers "not found" (404 or 410), the domain no longer exists, or the address redirects to the site's home page, which is how many sites retire a page.
- Can't tell: the site refuses automated requests (mostly HTTP 403), doesn't answer within 30 seconds, or fails with a server error. We tried these a second time with a browser's headers; what still refused stays here.

| Terms | Citations | Still there | Gone | Can't tell | Gone, of clear answers |
|---|---|---|---|---|---|
| 2005-2009 | 243 | 46 | 142 | 55 | 76% |
| 2010-2014 | 327 | 137 | 112 | 78 | 45% |
| 2015-2019 | 282 | 155 | 53 | 74 | 25% |
| 2020-2024 | 389 | 210 | 72 | 107 | 26% |
| All | 1,241 | 548 | 379 | 314 | 41% |

One citation in the Court's list is a title without an address, so the table counts 1,241. Per term, the share of clear answers that are gone runs from 85% (2006) to 12% (2016 and 2023). The 2020 term stands out at 44%: one opinion, *Collins v. Yellen*, cites 12 documents of the Federal Housing Finance Agency that are all gone, and six gone citations in *FDA v. American College of Obstetricians and Gynecologists* are mostly COVID-19 pages from the CDC and Maryland's governor.

Government sites don't keep their pages better than others. Of the citations to `.gov` addresses with a clear answer, 45% are gone, against 37% for all other sites.

## A working address is not the same page

An address that still answers can show something else. The Court keeps a PDF copy of each cited page, so we compared 50 randomly chosen pages that still answer with those copies, counting how many of the copy's eight-word phrases are still on the live page. For 24 the comparison didn't work: the copy is a scan without text, or the site refused us. Of the other 26, seven still carry at least 80% of the copied text, and 13 carry less than a fifth.

That second number overstates the change somewhat. A few sites build their text in the browser with JavaScript, which a plain download doesn't see. But the cases we opened by hand show what happens. The Federal Election Commission's page on public funding of presidential elections now redirects to a new page on the same subject, with different text. A press release from the Louisiana governor's newsroom now shows the governor's home page at the same address, so it counts as "still there" while the release is gone.

## Compared with earlier work

In 2014, Jonathan Zittrain, Kendra Albert and Lawrence Lessig found that 50% of the URLs in Supreme Court opinions no longer led to the cited information ([*Legal Information Management* 14 (2014), 88-99](https://doi.org/10.1017/S1472669614000255)). Their count included pages that answer with different content. Ours counts only addresses that fail outright, plus redirects to a home page, and still reaches 41% of clear answers over a longer span. With changed content added, as the sample suggests, the share of citations that no longer show what the Court read is well above that.

## Keeping what you cite

The Court's own copies are why these citations can still be followed. Anyone citing a web page can do the same when they cite it. [Perma.cc](https://perma.cc), from the Harvard Law School Library Innovation Lab, was built for this, for legal citations in particular. WRL captures a page in a browser, signs the capture and has an independent authority timestamp it, so whoever reads the citation later can check that the copy wasn't changed (see [Screenshots in Court](/screenshots-in-court/) and [Legal Evidence](/legal-evidence/)).

## Method and data

- Source: the per-term lists linked from the Court's page, October 2005 term (2005) to October 2024 term (2024). The full address of each citation is in each link's title; the link itself points to the Court's PDF copy.
- Some addresses carry damage from typesetting: spaces at line breaks, typographic dashes in place of hyphens, two addresses joined with "and". For the second pass we removed the spaces, put hyphens back and split joined addresses. The data file keeps the address as the Court lists it.
- A few addresses were already wrong in the opinion, such as `https://www.nbcnews/com/...` in *Fulton v. Philadelphia*. They count as gone, since a reader following them gets nowhere either.
- Checked on 26 November 2026 from a computer in Germany, one GET request per address with redirects followed, at most eight at a time. Sites that only answer visitors from the US count as "can't tell" or, if they say "not found" to others, as gone.
- One check on one day. A site that was down that day counts as "can't tell", not as gone.

Download the data: [scotus-cited-urls-2026-11.csv](/assets/research/scotus-cited-urls-2026-11.csv), one row per citation with term, docket number, case, cited address, outcome, HTTP status or error, the address it redirected to (for one pre-signed download link, without its signed query string), and the link to the Court's copy.
