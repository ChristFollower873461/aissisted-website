document.addEventListener('DOMContentLoaded',function(){
const isSubdir=document.querySelector('link[href*="../styles.css"]')!==null;
const base=isSubdir?'../':'./';
const footerHTML=`<footer>
<div class="container">
<div class="footer-grid">
<div class="footer-brand">
<a href="${base}index.html"><img src="${base}img/logo-horizontal-tagline.png" alt="AIssisted Consulting - The AI Guy - Local. Trusted. AI." style="max-width:280px;height:auto;margin-bottom:8px"></a>
<p>NIST-compliant AI consulting by real engineers for small businesses. Local. Trusted. AI.</p>
</div>
<div class="footer-col">
<h4>Company</h4>
<a href="${base}services.html">Services</a>
<a href="${base}industries/">Industries</a>
<a href="${base}pricing.html">Pricing</a>
<a href="${base}about.html">About</a>
<a href="${base}case-studies.html">Case Studies</a>
<a href="${base}blog/">The AI Guy</a>
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
