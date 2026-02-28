document.addEventListener('DOMContentLoaded',function(){
const isSubdir=document.querySelector('link[href*="../styles.css"]')!==null;
const base=isSubdir?'../':'./';
const footerHTML=`<footer>
<div class="container">
<div class="footer-grid">
<div class="footer-brand">
<strong style="font-size:1.2rem;color:#fff">AIssisted Consulting</strong>
<p>NIST-compliant AI consulting for small businesses. Strategy, custom agents, and hands-on support to help you harness superintelligence.</p>
</div>
<div class="footer-col">
<h4>Company</h4>
<a href="${base}services.html">Services</a>
<a href="${base}industries/">Industries</a>
<a href="${base}pricing.html">Pricing</a>
<a href="${base}about.html">About</a>
<a href="${base}case-studies.html">Case Studies</a>
<a href="${base}blog/">Blog</a>
</div>
<div class="footer-col">
<h4>Resources</h4>
<a href="${base}contact.html">Contact</a>
<a href="mailto:pj@aissistedconsulting.com">pj@aissistedconsulting.com</a>
<a href="${base}contact.html">Schedule a Consultation</a>
<a href="${base}pay.html">₿ Pay with Bitcoin</a>
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
