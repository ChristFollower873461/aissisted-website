document.addEventListener('DOMContentLoaded',function(){
const isSubdir=document.querySelector('link[href*="../styles.css"]')!==null;
const base=isSubdir?'../':'./';
const routes={
home:base,
services:`${base}services`,
industries:`${base}industries/`,
pricing:`${base}pricing`,
about:`${base}about`,
caseStudies:`${base}case-studies`,
blog:`${base}blog/`,
contact:`${base}contact`,
pay:`${base}pay`
};
const footerHTML=`<footer>
<div class="container">
<div class="footer-grid">
<div class="footer-brand">
<a href="${routes.home}" class="footer-brand-link"><img src="${base}img/official-logo.png?v=2" alt="AIssisted Consulting" class="footer-brand-logo"></a>
<p>NIST-compliant AI consulting by real engineers for small businesses. Local. Trusted. AI.</p>
</div>
<div class="footer-col">
<h4>Company</h4>
<a href="${routes.services}">Services</a>
<a href="${routes.industries}">Industries</a>
<a href="${routes.pricing}">Pricing</a>
<a href="${routes.about}">About</a>
<a href="${routes.caseStudies}">Case Studies</a>
<a href="${routes.blog}">Blog</a>
</div>
<div class="footer-col">
<h4>Resources</h4>
<a href="${routes.contact}">Contact</a>
<a href="mailto:pj@aissistedconsulting.com">pj@aissistedconsulting.com</a>
<a href="${routes.contact}">Schedule a Consultation</a>
<a href="${routes.pay}">₿ Pay with Bitcoin</a>
</div>
</div>
<div class="footer-bottom">
© 2026 AIssisted Consulting LLC. All rights reserved.
</div>
</div>
</footer>`;
const footerContainer=document.getElementById('footer-container');
if(footerContainer){footerContainer.innerHTML=footerHTML;}
});
