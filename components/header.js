document.addEventListener('DOMContentLoaded',function(){
const depth=window.location.pathname.split('/').filter(p=>p).length;
const isSubdir=document.querySelector('link[href*="../styles.css"]')!==null;
const base=isSubdir?'../':'./';
const headerHTML=`<nav id="nav">
<div class="container">
<a href="${base}index.html" class="nav-logo" aria-label="AIssisted Consulting Home">
<svg viewBox="0 0 600 200" width="160" height="52" aria-hidden="true">
<defs>
<linearGradient id="ng" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F0D060"/><stop offset="100%" style="stop-color:#B8922E"/></linearGradient>
<linearGradient id="nm" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#8888BB"/><stop offset="100%" style="stop-color:#555588"/></linearGradient>
</defs>
<g transform="translate(10,10) scale(0.3)">
<path d="M 315 115 A 155 155 0 1 0 315 405 A 125 125 0 0 1 315 115 Z" fill="url(#nm)" stroke="#9999CC" stroke-width="1.5"/>
<g stroke="url(#ng)" stroke-width="2.5" stroke-linecap="round" opacity="0.9">
<line x1="260" y1="260" x2="315" y2="115"/><line x1="260" y1="260" x2="315" y2="405"/>
<line x1="260" y1="260" x2="400" y2="260"/><line x1="315" y1="115" x2="400" y2="260"/>
<line x1="315" y1="405" x2="400" y2="260"/><line x1="260" y1="260" x2="160" y2="195"/>
<line x1="260" y1="260" x2="155" y2="345"/><line x1="160" y1="195" x2="130" y2="265"/>
<line x1="130" y1="265" x2="155" y2="345"/>
</g>
<circle cx="160" cy="195" r="8" fill="url(#ng)"/><circle cx="130" cy="265" r="7" fill="url(#ng)"/>
<circle cx="155" cy="345" r="8" fill="url(#ng)"/><circle cx="315" cy="115" r="12" fill="url(#ng)"/>
<circle cx="315" cy="405" r="12" fill="url(#ng)"/><circle cx="400" cy="260" r="10" fill="url(#ng)"/>
<circle cx="260" cy="260" r="36" fill="url(#ng)"/><circle cx="260" cy="260" r="32" fill="#1A1A35"/>
<circle cx="260" cy="260" r="30" fill="url(#ng)"/>
<text x="260" y="272" text-anchor="middle" font-family="Arial" font-weight="800" font-size="28" fill="#0B1120">AI</text>
</g>
<text x="190" y="85" font-family="'SF Pro Display','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="50" fill="#FFFFFF" letter-spacing="2">AIssisted</text>
<text x="190" y="130" font-family="'SF Pro Display','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="26" fill="url(#ng)" letter-spacing="8">CONSULTING</text>
</svg>
</a>
<div class="nav-links" id="navLinks">
<a href="${base}services.html">Services</a>
<a href="${base}industries/">Industries</a>
<a href="${base}pricing.html">Pricing</a>
<a href="${base}compare.html">Compare</a>
<a href="${base}about.html">About</a>
<a href="${base}case-studies.html">Case Studies</a>
<a href="${base}tools.html">Tools</a>
<a href="${base}blog/">Blog</a>
<a href="${base}reserve.html" class="btn nav-reserve" style="background:transparent;border:2px solid var(--gold-mid);color:var(--gold-mid);padding:10px 20px;font-size:.85rem">Reserve</a>
<a href="${base}contact.html" class="btn btn-primary nav-cta">Get Started</a>
</div>
<button class="hamburger" id="hamburger" aria-label="Toggle menu">
<span></span><span></span><span></span>
</button>
</div>
</nav>`;
const headerContainer=document.getElementById('header-container');
if(headerContainer){headerContainer.innerHTML=headerHTML;initNav(base);}
});
function initNav(base){
const hamburger=document.getElementById('hamburger');
const navLinks=document.getElementById('navLinks');
const nav=document.getElementById('nav');
if(hamburger){hamburger.addEventListener('click',()=>{navLinks.classList.toggle('open');});}
window.addEventListener('scroll',()=>{if(nav){nav.classList.toggle('scrolled',window.scrollY>50);}});
const currentPath=window.location.pathname;
const links=navLinks.querySelectorAll('a:not(.nav-cta)');
links.forEach(link=>{
const href=link.getAttribute('href');
if(currentPath.endsWith(href.replace(base,''))||(currentPath.includes('/industries/')&&href.includes('industries/'))||(currentPath.includes('/blog/')&&href.includes('blog/'))){link.classList.add('active');}
});
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{const href=a.getAttribute('href');if(href.startsWith('#')){e.preventDefault();const t=document.querySelector(href);if(t)t.scrollIntoView({behavior:'smooth'});if(navLinks)navLinks.classList.remove('open');}});});
const observer=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}});},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
document.querySelectorAll('.faq-q').forEach(btn=>{btn.addEventListener('click',()=>{const item=btn.parentElement;document.querySelectorAll('.faq-item').forEach(i=>{if(i!==item)i.classList.remove('open');});item.classList.toggle('open');});});
}
