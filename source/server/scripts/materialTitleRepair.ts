import { titleFromHtmlDocument } from '../../client/src/lib/uploadTitle';

const folded=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** Repair demonstrable title defects, preserving grade, chapter and author-added qualifiers. */
export function repairedMaterialTitle(title:string,html:string):string {
  let next=title.trim().replace(/<+$/,'').trim();
  const documentTitle=titleFromHtmlDocument(html,title);
  const oldGrade=title.match(/\b(\d{1,2})\.?\s*oszt[aá]ly/i)?.[1];
  const newGrade=documentTitle.match(/\b(\d{1,2})\.?\s*oszt[aá]ly/i)?.[1];
  if(oldGrade && newGrade && oldGrade!==newGrade)return next;
  // A filename slug can be replaced by its real document title. Ordinary custom titles stay.
  if(/\b[a-z]+(?:-[a-z0-9]+){2,}\b/.test(next) && !/^(websuli lecke|document|untitled)$/i.test(documentTitle)){
    next=oldGrade && !newGrade && !/grade\s*\d|\d(?:st|nd|rd|th)\s*grade/i.test(documentTitle)
      ? `${oldGrade}. osztály - ${documentTitle}` : documentTitle;
  }
  // Restore accents only where a complete heading phrase matches the existing title.
  const headingOnly=html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi,'');
  const h1=titleFromHtmlDocument(headingOnly,'').replace(/[^\p{L}\p{N}\s,.:–—-]/gu,'').trim();
  if(h1 && h1!=='Névtelen tananyag'){
    const at=folded(next).indexOf(folded(h1));
    if(at>=0 && next.slice(at,at+h1.length).toLowerCase()!==h1.toLowerCase()) next=next.slice(0,at)+h1+next.slice(at+h1.length);
  }
  return next.replace(/\bosztaly\b/g,'osztály');
}
